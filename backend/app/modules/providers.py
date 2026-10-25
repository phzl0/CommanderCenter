"""Read-only public providers. Fixed HTTPS hosts; no user-supplied URLs or tokens."""

import json
import math
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from urllib.parse import urlparse
import httpx
from defusedxml import ElementTree
from app.core.config import settings

ALLOWED_HOSTS = {
    "api.github.com",
    "api.open-meteo.com",
    "geocoding-api.open-meteo.com",
    "api.bcb.gov.br",
    "servicodados.ibge.gov.br",
    "agenciabrasil.ebc.com.br",
    "rss.ebc.com.br",
    "www.alphavantage.co",
}
FEEDS = {
    "ibge": ("IBGE", "https://servicodados.ibge.gov.br/api/v3/noticias/?qtd=30"),
    "economia": (
        "Agência Brasil · Economia",
        "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml",
    ),
    "politica": (
        "Agência Brasil · Política",
        "https://agenciabrasil.ebc.com.br/rss/politica/feed.xml",
    ),
}
SERIES = {
    "usd": (1, "Dólar comercial · venda", "R$/US$"),
    "selic": (432, "Meta Selic", "% a.a."),
    "ipca": (433, "IPCA mensal", "% ao mês"),
}


class ProviderError(Exception):
    pass


def get_bytes(url):
    # Never follow a redirect to an arbitrary host, including from RSS providers.
    try:
        with httpx.Client(
            timeout=httpx.Timeout(12, connect=5),
            headers={
                "User-Agent": "CommandCenter/0.2",
                "Accept": "application/json, application/rss+xml, application/xml",
            },
            follow_redirects=False,
        ) as client:
            for _ in range(3):
                parsed = urlparse(url)
                if (
                    parsed.scheme != "https"
                    or parsed.hostname not in ALLOWED_HOSTS
                    or parsed.username is not None
                    or parsed.port not in (None, 443)
                ):
                    raise ProviderError("Endereço da fonte não permitido.")
                with client.stream("GET", url) as response:
                    if response.is_redirect:
                        from urllib.parse import urljoin

                        url = urljoin(url, response.headers.get("location", ""))
                        continue
                    if response.status_code in (403, 429):
                        raise ProviderError(
                            "A fonte limitou as consultas. Tente novamente mais tarde."
                        )
                    if response.status_code == 404:
                        raise ProviderError(
                            "Fonte não encontrada. Repositórios privados não são acessíveis nesta integração pública."
                        )
                    if response.status_code == 409:
                        return b"[]"
                    if response.status_code != 200:
                        raise ProviderError("A fonte está indisponível no momento.")
                    raw = bytearray()
                    for chunk in response.iter_bytes():
                        raw.extend(chunk)
                        if len(raw) > 3 * 1024 * 1024:
                            raise ProviderError(
                                "A resposta da fonte excedeu o limite de leitura."
                            )
                    return bytes(raw)
        raise ProviderError("A fonte redirecionou muitas vezes.")
    except ProviderError:
        raise
    except Exception:
        raise ProviderError(
            "Não foi possível consultar a fonte. Verifique a conexão e tente novamente."
        )


def get_json(url):
    try:
        return json.loads(get_bytes(url))
    except ProviderError:
        raise
    except Exception:
        raise ProviderError("A fonte retornou um formato inesperado.")


def clean(text):
    return unescape(re.sub(r"<[^>]*>", "", str(text)))[:300]


def safe_link(url):
    parsed = urlparse(url)
    return (
        url
        if parsed.scheme == "https" and parsed.hostname and not parsed.username
        else ""
    )


def series_chart(points, series, unit=""):
    return {"points": points, "series": series, "unit": unit}


def github_data(repository, start, end, getter=None):
    read_json = getter or get_json
    if not repository:
        return {
            "status": "needs_config",
            "message": "Escolha um repositório público no formato dono/repositorio.",
            "source": "GitHub REST API",
        }
    if not re.fullmatch(
        r"[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}", repository
    ):
        raise ProviderError("Repositório inválido.")
    base = "https://api.github.com/repos/" + repository
    repo = read_json(base)
    commits = read_json(
        base
        + "/commits?per_page=100&since="
        + start.isoformat()
        + "T00:00:00Z&until="
        + end.isoformat()
        + "T23:59:59Z"
    )
    if not isinstance(repo, dict) or not isinstance(commits, list):
        raise ProviderError("Resposta inesperada do GitHub.")
    counts = Counter()
    for c in commits:
        stamp = c.get("commit", {}).get("committer", {}).get("date", "")[:10]
        if stamp:
            counts[stamp] += 1
    points = []
    day = start
    while day <= end:
        points.append({"label": day.isoformat(), "value": counts[day.isoformat()]})
        day += timedelta(days=1)
    return {
        "status": "ok" if commits else "empty",
        "source": "GitHub REST API · branch padrão",
        "message": "Até 100 commits mais recentes no período; não inclui todas as branches. Repositórios públicos, sem acesso à sua conta.",
        "chart": series_chart(
            points, [{"key": "value", "name": "Commits", "color": "#5b9dff"}]
        ),
        "kpis": [
            {"label": "Commits recebidos", "value": len(commits)},
            {"label": "Estrelas atuais", "value": repo.get("stargazers_count", 0)},
            {
                "label": "Issues + PRs abertos",
                "value": repo.get("open_issues_count", 0),
            },
        ],
        "link": safe_link(repo.get("html_url", "")),
    }


def macro_data(code, start, end):
    number, name, unit = SERIES[code]
    # IPCA is monthly: a wider window supplies meaningful points without manufacturing daily values.
    beginning = end - timedelta(days=365) if code == "ipca" else start
    url = f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{number}/dados?formato=json&dataInicial={beginning:%d/%m/%Y}&dataFinal={end:%d/%m/%Y}"
    raw = get_json(url)
    if not isinstance(raw, list):
        raise ProviderError("Resposta inesperada do Banco Central.")
    points = []
    for r in raw:
        value = float(r["valor"])
        if math.isfinite(value):
            points.append(
                {
                    "label": datetime.strptime(r["data"], "%d/%m/%Y")
                    .date()
                    .isoformat(),
                    "value": value,
                }
            )
    points.sort(key=lambda p: p["label"])
    return {
        "status": "ok" if points else "empty",
        "source": f"Banco Central · SGS {number}",
        "message": "Últimos 12 meses; divulgação mensal."
        if code == "ipca"
        else "Valores oficiais nas datas disponíveis. Não é cotação em tempo real.",
        "chart": series_chart(
            points, [{"key": "value", "name": name, "color": "#48d8e8"}], unit
        ),
        "kpis": [
            {
                "label": name,
                "value": points[-1]["value"] if points else None,
                "unit": unit,
            }
        ],
        "data_date": points[-1]["label"] if points else None,
    }


def news_data(feed, start, end):
    source, url = FEEDS[feed]
    items = []
    if feed == "ibge":
        raw = get_json(url)
        for item in raw.get("items", []):
            try:
                stamp = (
                    datetime.strptime(item["data_publicacao"], "%d/%m/%Y %H:%M:%S")
                    .date()
                    .isoformat()
                )
            except (ValueError, KeyError):
                stamp = ""
            items.append(
                {
                    "title": clean(item.get("titulo", "")),
                    "url": safe_link(item.get("link", "")),
                    "date": stamp,
                }
            )
    else:
        try:
            root = ElementTree.fromstring(get_bytes(url))
        except ProviderError:
            raise
        except Exception:
            raise ProviderError("O feed de notícias não pôde ser lido.")
        for item in root.findall(".//item")[:30]:
            try:
                stamp = (
                    parsedate_to_datetime(item.findtext("pubDate", ""))
                    .date()
                    .isoformat()
                )
            except (ValueError, TypeError):
                stamp = ""
            items.append(
                {
                    "title": clean(item.findtext("title", "")),
                    "url": safe_link(item.findtext("link", "")),
                    "date": stamp,
                }
            )
    items = [
        i
        for i in items
        if i["url"]
        and (not i["date"] or start.isoformat() <= i["date"] <= end.isoformat())
    ]
    counts = Counter(i["date"] for i in items if i["date"])
    points = [{"label": day, "value": value} for day, value in sorted(counts.items())]
    return {
        "status": "ok" if items else "empty",
        "source": source,
        "message": "Volume dos itens recebidos neste feed (até 30), não de todas as notícias publicadas. Sem análise de sentimento.",
        "chart": series_chart(
            points, [{"key": "value", "name": "Notícias recebidas", "color": "#9b8aff"}]
        ),
        "items": items[:6],
        "kpis": [{"label": "Itens no recorte", "value": len(items)}],
    }


def stock_data(symbol, start, end):
    if not settings.alpha_vantage_api_key:
        return {
            "status": "needs_config",
            "source": "Alpha Vantage",
            "message": "Para cotações de empresas, configure ALPHA_VANTAGE_API_KEY no .env local. Também é possível usar uma análise de planilha com histórico de preços.",
        }
    if not symbol:
        return {
            "status": "needs_config",
            "source": "Alpha Vantage",
            "message": "Informe o código da empresa no provedor, por exemplo IBM.",
        }
    from urllib.parse import urlencode

    raw = get_json(
        "https://www.alphavantage.co/query?"
        + urlencode(
            {
                "function": "TIME_SERIES_DAILY",
                "symbol": symbol,
                "outputsize": "compact",
                "apikey": settings.alpha_vantage_api_key,
            }
        )
    )
    rows = raw.get("Time Series (Daily)")
    if not rows:
        raise ProviderError(
            "A cotação não está disponível. Confira símbolo, chave e limite do seu plano Alpha Vantage."
        )
    points = [
        {"label": day, "value": float(r["4. close"])}
        for day, r in sorted(rows.items())
        if start.isoformat() <= day <= end.isoformat()
        and math.isfinite(float(r["4. close"]))
    ]
    return {
        "status": "ok" if points else "empty",
        "source": "Alpha Vantage · fechamento diário",
        "message": "Até 100 pregões disponíveis; preço de fechamento, sem ajuste de dividendos. Não é cotação ao vivo. Moeda conforme a listagem do ativo.",
        "chart": series_chart(
            points, [{"key": "value", "name": symbol, "color": "#55b9ff"}]
        ),
        "kpis": [
            {
                "label": "Último fechamento",
                "value": points[-1]["value"] if points else None,
            }
        ],
        "data_date": points[-1]["label"] if points else None,
    }


def stock_query(text):
    """Recognized links are parsed locally, never fetched as arbitrary websites."""
    from urllib.parse import unquote

    text = text.strip()
    if text.startswith(("https://", "http://")):
        parsed = urlparse(text)
        host = (parsed.hostname or "").lower()
        parts = [unquote(p) for p in parsed.path.split("/") if p]
        if host == "finance.yahoo.com" and len(parts) >= 2 and parts[0] == "quote":
            return parts[1]
        if (
            host in ("www.google.com", "google.com")
            and len(parts) >= 3
            and parts[:2] == ["finance", "quote"]
        ):
            return parts[2].split(":")[0]
        if (
            host in ("www.tradingview.com", "tradingview.com")
            and len(parts) >= 2
            and parts[0] == "symbols"
        ):
            return parts[1].split("-", 1)[-1]
        raise ProviderError(
            "Link não reconhecido. Use Yahoo Finance, Google Finance ou TradingView, ou pesquise pelo nome/código."
        )
    return text


def company_search(text):
    from urllib.parse import urlencode

    query = stock_query(text)
    if not query or len(query) > 100:
        raise ProviderError("Informe um nome ou código com até 100 caracteres.")
    if not settings.alpha_vantage_api_key:
        return {
            "status": "needs_config",
            "message": "A busca e validação de listagens exige ALPHA_VANTAGE_API_KEY no .env. Você pode informar um código manualmente, sujeito à confirmação pelo provedor.",
            "query": query,
            "matches": [],
        }
    raw = get_json(
        "https://www.alphavantage.co/query?"
        + urlencode(
            {
                "function": "SYMBOL_SEARCH",
                "keywords": query,
                "apikey": settings.alpha_vantage_api_key,
            }
        )
    )
    if "bestMatches" not in raw:
        raise ProviderError(
            "Busca indisponível. Confira a chave e o limite do seu plano Alpha Vantage."
        )
    matches = [
        {
            "symbol": r.get("1. symbol", ""),
            "name": r.get("2. name", ""),
            "type": r.get("3. type", ""),
            "exchange": r.get("4. region", ""),
            "currency": r.get("8. currency", ""),
            "verified": True,
        }
        for r in raw["bestMatches"][:10]
    ]
    return {
        "status": "ok",
        "message": "Selecione a listagem. Bolsa/região e moeda ajudam a distinguir ativos diferentes.",
        "query": query,
        "matches": matches,
    }


def city_search(query):
    from urllib.parse import urlencode

    raw = get_json(
        "https://geocoding-api.open-meteo.com/v1/search?"
        + urlencode({"name": query, "count": 8, "language": "pt", "format": "json"})
    )
    return [
        {
            "name": r["name"],
            "region": r.get("admin1", ""),
            "country": r.get("country", ""),
            "latitude": r["latitude"],
            "longitude": r["longitude"],
            "label": ", ".join(
                filter(None, [r["name"], r.get("admin1"), r.get("country")])
            ),
        }
        for r in raw.get("results", [])
    ]


def weather_label(code):
    if code == 0:
        return "Céu limpo"
    if code in (1, 2, 3):
        return "Parcialmente nublado" if code != 3 else "Nublado"
    if code in (45, 48):
        return "Nevoeiro"
    if code in (51, 53, 55, 56, 57):
        return "Garoa"
    if code in (61, 63, 65, 66, 67, 80, 81, 82):
        return "Chuva"
    if code in (71, 73, 75, 77, 85, 86):
        return "Neve"
    if code in (95, 96, 99):
        return "Trovoadas"
    return "Condição não informada"


def weather_data(latitude, longitude, city):
    if latitude is None or longitude is None:
        return {
            "status": "needs_config",
            "source": "Open-Meteo",
            "message": "Pesquise e selecione sua cidade na configuração do painel.",
        }
    from urllib.parse import urlencode

    raw = get_json(
        "https://api.open-meteo.com/v1/forecast?"
        + urlencode(
            {
                "latitude": latitude,
                "longitude": longitude,
                "current": "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
                "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
                "forecast_days": 7,
                "timezone": "auto",
            }
        )
    )
    current = raw.get("current", {})
    daily = raw.get("daily", {})
    days = []
    for i, day in enumerate(daily.get("time", [])[:7]):
        days.append(
            {
                "date": day,
                "code": daily["weather_code"][i],
                "condition": weather_label(daily["weather_code"][i]),
                "max": daily["temperature_2m_max"][i],
                "min": daily["temperature_2m_min"][i],
                "rain": daily.get("precipitation_probability_max", [None] * 7)[i],
            }
        )
    code = current.get("weather_code")
    return {
        "status": "ok" if current else "empty",
        "source": "Open-Meteo",
        "message": "Condições modeladas e previsão; não substituem alertas oficiais da Defesa Civil. Horários no fuso da localidade.",
        "city": city,
        "weather": {
            "temperature": current.get("temperature_2m"),
            "feels_like": current.get("apparent_temperature"),
            "code": code,
            "condition": weather_label(code),
            "wind": current.get("wind_speed_10m"),
            "time": current.get("time"),
            "timezone": raw.get("timezone"),
            "days": days,
        },
        "link": "https://open-meteo.com/",
        "suggestions": [
            "Confira a previsão dos próximos dias antes de planejar atividades ao ar livre.",
            "Para risco severo, consulte os órgãos oficiais locais.",
        ],
    }
