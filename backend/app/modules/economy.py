"""Read-only Brazilian market dashboard with isolated provider failures."""

import json, math
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Literal
from urllib.parse import urlencode
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.security import current_user
from app.core.preferences import user_zone
from app.models import EconomySettings, User, now
from app.modules import providers, integrations
from app.modules.management import StrictModel
from app.modules.timeframes import resample

router = APIRouter(prefix="/api/economy", tags=["Economia"])
COMPANIES = {
    "PETR4": "Petrobras",
    "VALE3": "Vale",
    "ITUB4": "Itaú Unibanco",
    "BBDC4": "Bradesco",
    "ABEV3": "Ambev",
    "WEGE3": "WEG",
    "BBAS3": "Banco do Brasil",
    "SUZB3": "Suzano",
    "RENT3": "Localiza",
    "BPAC11": "BTG Pactual",
    "PRIO3": "PRIO",
    "MGLU3": "Magazine Luiza",
}
FREE = {"PETR4", "VALE3", "ITUB4", "MGLU3"}


def market_get(path, token=""):
    headers = {"User-Agent": "CommandCenter/0.8", "Accept": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    try:
        with httpx.Client(
            timeout=12, follow_redirects=False, trust_env=False
        ) as client:
            with client.stream(
                "GET", "https://brapi.dev/api/" + path, headers=headers
            ) as response:
                if response.status_code != 200:
                    raise providers.ProviderError(
                        "Cotação indisponível. Confira a chave e os limites do plano brapi."
                    )
                body = bytearray()
                for chunk in response.iter_bytes():
                    body.extend(chunk)
                    if len(body) > 3 * 1024 * 1024:
                        raise providers.ProviderError(
                            "Resposta de mercado muito grande."
                        )
                data = json.loads(body)
                if data.get("error"):
                    raise providers.ProviderError(
                        "O provedor não liberou este dado no plano atual."
                    )
                return data
    except providers.ProviderError:
        raise
    except Exception:
        raise providers.ProviderError("Não foi possível consultar o mercado agora.")


def number(value):
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (ValueError, TypeError):
        return None


def quote(symbol, token):
    base = {
        "symbol": symbol,
        "name": COMPANIES[symbol],
        "price": None,
        "change": None,
        "time": None,
    }
    if not token and symbol not in FREE:
        return {**base, "status": "needs_key"}
    try:
        row = market_get("quote/" + symbol, token).get("results", [])[0]
        if row.get("symbol") != symbol:
            raise ValueError()
        price = number(row.get("regularMarketPrice"))
        change = number(row.get("regularMarketChangePercent"))
        return {
            **base,
            "price": price,
            "change": change,
            "time": row.get("regularMarketTime"),
            "status": "ok"
            if price is not None and change is not None
            else "unavailable",
        }
    except (providers.ProviderError, IndexError, ValueError):
        return {**base, "status": "unavailable"}


def gdp_data():
    raw = providers.get_json(
        "https://servicodados.ibge.gov.br/api/v3/agregados/5932/periodos/-12/variaveis/6564?localidades=N1%5Ball%5D&classificacao=11255%5B90707%5D"
    )
    points = []
    for variable in raw:
        if str(variable.get("id")) != "6564":
            continue
        for result in variable.get("resultados", []):
            categories = [
                c.get("categoria", {}) for c in result.get("classificacoes", [])
            ]
            if not any("90707" in c for c in categories):
                continue
            for series in result.get("series", []):
                for period, value in series.get("serie", {}).items():
                    n = number(value)
                    if (
                        n is not None
                        and len(period) == 6
                        and period[-2:] in ("01", "02", "03", "04")
                    ):
                        points.append(
                            {
                                "label": period[:4] + "-T" + str(int(period[-2:])),
                                "value": n,
                            }
                        )
    points.sort(key=lambda p: p["label"])
    return {
        "status": "ok" if points else "empty",
        "source": "IBGE · SIDRA 5932 / 6564 · PIB a preços de mercado",
        "frequency": "Trimestral",
        "chart": providers.series_chart(
            points,
            [
                {
                    "key": "value",
                    "name": "PIB · trimestre anterior, dessazonalizado",
                    "color": "#93c5fd",
                }
            ],
            "%",
        ),
        "kpis": [
            {
                "label": "Variação trimestral",
                "value": points[-1]["value"] if points else None,
                "unit": "%",
            }
        ],
        "data_date": points[-1]["label"] if points else None,
        "message": "Variação em volume frente ao trimestre anterior, com ajuste sazonal. Não é crescimento mensal nem PIB nominal.",
    }


def settings_row(db, user):
    row = db.get(EconomySettings, user.id)
    if not row:
        row = EconomySettings(owner_id=user.id)
        db.add(row)
        db.flush()
    return row


class KeyInput(StrictModel):
    api_key: str = Field(default="", max_length=500, pattern=r"^[A-Za-z0-9_.-]*$")


@router.get("/settings")
def configuration(db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = db.get(EconomySettings, user.id)
    return {"has_key": bool(row and row.api_key), "free_symbols": sorted(FREE)}


@router.put("/settings")
def save_configuration(
    data: KeyInput, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    row = settings_row(db, user)
    row.api_key = integrations.pack(data.api_key) if data.api_key else None
    row.cached_data = None
    row.cached_at = None
    db.commit()
    return {"has_key": bool(row.api_key)}


@router.get("/overview")
def overview(
    days: Literal[7, 30, 90, 365] = 90,
    interval: Literal["day", "week", "month"] = "day",
    refresh: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    row = settings_row(db, user)
    stamp = now()
    cache_key = f"{days}:{interval}"
    if (
        row.cached_data
        and row.cached_data.get("cache_key") == cache_key
        and row.cached_at
        and (stamp - row.cached_at).total_seconds() < (30 if refresh else 600)
    ):
        return {**row.cached_data, "cached": True}
    original_key = row.api_key
    db.commit()
    token = integrations.unpack(original_key) if original_key else ""
    end = datetime.now(user_zone(db, user)).date()
    start = end - timedelta(days=days - 1)

    def indicator(code):
        try:
            data = (
                gdp_data() if code == "pib" else providers.macro_data(code, start, end)
            )
            if code in ("pib", "ipca") and data.get("chart"):
                count = max(1, math.ceil(days / (90 if code == "pib" else 30)))
                data["chart"]["points"] = data["chart"]["points"][-count:]
                data["period_note"] = (
                    "Divulgações na frequência nativa; no mínimo a última referência disponível."
                )
                if code == "ipca":
                    data["message"] = "Variação mensal oficial do IPCA."
            return {
                **(resample(data, interval) if code != "pib" else data),
                "frequency": "Trimestral"
                if code == "pib"
                else "Mensal"
                if code == "ipca"
                else "Diária",
            }
        except Exception:
            return {
                "status": "unavailable",
                "source": "IBGE" if code == "pib" else "Banco Central",
                "message": "A fonte oficial está indisponível; tente atualizar mais tarde.",
            }

    with ThreadPoolExecutor(max_workers=6) as pool:
        jobs = {
            code: pool.submit(indicator, code)
            for code in ["selic", "usd", "pib", "ipca"]
        }
        stocks = list(pool.map(lambda symbol: quote(symbol, token), COMPANIES))
        indicators = {code: job.result() for code, job in jobs.items()}
    result = {
        "cache_key": cache_key,
        "as_of": stamp.isoformat() + "Z",
        "cached": False,
        "stocks": stocks,
        "indicators": indicators,
        "has_key": bool(token),
        "market_source": "brapi · variação do preço em relação ao fechamento anterior",
        "notice": "A seleção é uma lista inicial de empresas brasileiras, não um ranking atualizado de capitalização. Cotações podem ter atraso conforme o provedor/plano.",
    }
    db.refresh(row)
    if row.api_key == original_key:
        row.cached_data = result
        row.cached_at = stamp
        db.commit()
    return result


@router.get("/stocks/{symbol}/history")
def history(
    symbol: str,
    range: Literal["1d", "5d", "1mo", "3mo", "1y"] = "1mo",
    interval: Literal["1h", "1d", "1mo"] = "1d",
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if symbol not in COMPANIES:
        raise HTTPException(422, "Selecione uma empresa do mapa.")
    row = db.get(EconomySettings, user.id)
    token = integrations.unpack(row.api_key) if row and row.api_key else ""
    if not token and symbol not in FREE:
        return {
            "status": "needs_config",
            "message": "Cadastre sua chave brapi para liberar este ativo.",
        }
    try:
        raw = market_get(
            "quote/" + symbol + "?" + urlencode({"range": range, "interval": interval}),
            token,
        )
        series = raw.get("results", [])[0].get("historicalDataPrice", [])
        points = []
        for item in series:
            value = number(item.get("close"))
            stamp = number(item.get("date"))
            if value is not None and stamp is not None:
                points.append(
                    {
                        "label": datetime.fromtimestamp(
                            stamp, timezone.utc
                        ).isoformat(),
                        "value": value,
                    }
                )
        points.sort(key=lambda p: p["label"])
        return {
            "status": "ok" if points else "empty",
            "source": "brapi",
            "chart": providers.series_chart(
                points, [{"key": "value", "name": symbol, "color": "#93c5fd"}], "R$"
            ),
            "message": "Histórico na frequência devolvida pelo provedor; intervalos intradiários dependem do plano. Ausência de dado não é variação zero.",
        }
    except (providers.ProviderError, ValueError, IndexError, OverflowError):
        return {
            "status": "unavailable",
            "message": "Histórico indisponível para este ativo, período ou plano.",
        }
