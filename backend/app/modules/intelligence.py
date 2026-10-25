"""Personal information workspace, per-user preferences and auditable chart data."""

import hashlib
import json
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal
from zoneinfo import ZoneInfo
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import Field, model_validator, field_validator
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.security import current_user
from app.models import (
    User,
    WorkspaceSettings,
    DashboardWidget,
    PersonalEntry,
    FinanceEntry,
    Task,
    Activity,
    Analysis,
    ImportFile,
    now,
)
from app.modules.management import StrictModel, owned, dump
from app.modules.files import read_import
from app.modules.data_service import AnalysisConfig, analyze, records
from app.modules import providers, newsroom, integrations
from app.modules.notifications import record

router = APIRouter(prefix="/api/intelligence", tags=["Centro de informações"])
KINDS = [
    "tasks",
    "personal",
    "finance",
    "github",
    "news",
    "macro",
    "stock",
    "analysis",
    "weather",
    "teams",
]


class WidgetConfig(StrictModel):
    @field_validator("repository", mode="before")
    @classmethod
    def repository_link(cls, value):
        from urllib.parse import urlparse

        value = str(value or "").strip()
        if "://" in value:
            parsed = urlparse(value)
            if (
                parsed.scheme != "https"
                or parsed.hostname not in ("github.com", "www.github.com")
                or parsed.username
                or parsed.port not in (None, 443)
                or parsed.query
                or parsed.fragment
            ):
                raise ValueError("Use um link HTTPS do GitHub ou dono/repositório.")
            parts = parsed.path.strip("/").split("/")
            if len(parts) != 2:
                raise ValueError("Cole o link principal do repositório.")
            value = "/".join(parts)
        return value.removesuffix(".git")

    task_source: Literal["planner", "todo"] = "planner"
    task_list_id: str = Field(default="", max_length=200, pattern=r"^[A-Za-z0-9_=.-]*$")
    chart_type: Literal["area", "line", "bar"] = "area"
    repository: str = Field(
        default="",
        max_length=140,
        pattern=r"^$|^[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}$",
    )
    feed: Literal["ibge", "economia", "politica"] = "ibge"
    series: Literal["usd", "selic", "ipca"] = "usd"
    symbol: str = Field(default="", max_length=30, pattern=r"^[A-Za-z0-9.^_-]*$")
    analysis_id: str | None = None
    x_column: str = Field(default="", max_length=300)
    y_column: str = Field(default="", max_length=300)
    aggregation: Literal["sum", "mean", "count"] = "sum"
    metric: Literal["minutes", "events"] = "minutes"
    news_source_ids: list[str] = Field(default_factory=list, max_length=6)
    news_category: str = Field(default="", max_length=80)
    news_keywords: str = Field(default="", max_length=300)
    news_exclude: str = Field(default="", max_length=300)
    stock_name: str = Field(default="", max_length=150)
    stock_exchange: str = Field(default="", max_length=100)
    stock_currency: str = Field(default="", max_length=20)
    city: str = Field(default="", max_length=200)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class WidgetInput(StrictModel):
    title: str = Field(min_length=1, max_length=100)
    kind: Literal[
        "tasks",
        "personal",
        "finance",
        "github",
        "news",
        "macro",
        "stock",
        "analysis",
        "weather",
        "teams",
    ]
    visible: bool = True
    wide: bool = False
    config: WidgetConfig = Field(default_factory=WidgetConfig)


class PeriodInput(StrictModel):
    days: Literal[7, 30, 90] | None = None
    card_limit: int | None = Field(default=None, ge=1, le=12)


class OrderInput(StrictModel):
    ids: list[str] = Field(max_length=12)


class PersonalInput(StrictModel):
    label: str = Field(min_length=1, max_length=100)
    minutes: int = Field(gt=0, le=1440)
    entry_date: date


class FinanceInput(StrictModel):
    description: str = Field(min_length=1, max_length=160)
    category: str = Field(min_length=1, max_length=80)
    direction: Literal["income", "expense"]
    amount: Decimal = Field(gt=0, le=1000000000, max_digits=12, decimal_places=2)
    entry_date: date


def widgets_for(db, user):
    return list(
        db.scalars(
            select(DashboardWidget)
            .where(
                DashboardWidget.owner_id == user.id,
                DashboardWidget.deleted_at.is_(None),
            )
            .order_by(DashboardWidget.position, DashboardWidget.created_at)
        )
    )


def public_widget(row):
    return {
        k: v
        for k, v in dump(row).items()
        if k not in ("cached_data", "cached_at", "cache_key")
    }


def check_config(db, user, data):
    for source_id in data.config.news_source_ids:
        newsroom.active_source(db, user, source_id)
    if data.config.analysis_id:
        owned(db, Analysis, data.config.analysis_id, user)


@router.post("/bootstrap")
def bootstrap(db: Session = Depends(get_db), user: User = Depends(current_user)):
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    workspace = db.get(WorkspaceSettings, user.id)
    if not workspace:
        workspace = WorkspaceSettings(owner_id=user.id)
        db.add(workspace)
        defaults = [
            ("Evolução das tarefas", "tasks", {"chart_type": "bar"}),
            ("Minha atividade pessoal", "personal", {}),
            ("Radar de notícias", "news", {}),
            ("Desenvolvimento no GitHub", "github", {}),
            ("Fluxo financeiro", "finance", {}),
            ("Dólar comercial", "macro", {}),
        ]
        for position, (title, kind, config) in enumerate(defaults):
            db.add(
                DashboardWidget(
                    owner_id=user.id,
                    title=title,
                    kind=kind,
                    position=position,
                    config=WidgetConfig(**config).model_dump(),
                )
            )
        db.commit()
    newsroom.ensure_sources(db, user)
    db.commit()
    return {
        "days": workspace.days,
        "card_limit": workspace.card_limit,
        "widgets": [public_widget(w) for w in widgets_for(db, user)],
    }


@router.put("/settings")
def period(
    data: PeriodInput, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    row = db.get(WorkspaceSettings, user.id)
    if not row:
        raise HTTPException(409, "Abra o painel primeiro.")
    if data.days is not None:
        row.days = data.days
    if data.card_limit is not None:
        row.card_limit = data.card_limit
    db.commit()
    return {"days": row.days, "card_limit": row.card_limit}


@router.post("/widgets", status_code=201)
def create_widget(
    data: WidgetInput, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    rows = widgets_for(db, user)
    if len(rows) >= 12:
        raise HTTPException(
            422, "Você pode manter até 12 painéis. Edite ou remova um existente."
        )
    check_config(db, user, data)
    row = DashboardWidget(
        owner_id=user.id,
        position=max([r.position for r in rows], default=-1) + 1,
        **data.model_dump(exclude={"config"}),
        config=data.config.model_dump(),
    )
    db.add(row)
    db.commit()
    return public_widget(row)


@router.put("/widgets/{identity}")
def edit_widget(
    identity: str,
    data: WidgetInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    row = active_widget(db, user, identity)
    check_config(db, user, data)
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    row.cached_data = None
    row.cached_at = None
    row.cache_key = None
    db.commit()
    return public_widget(row)


@router.delete("/widgets/{identity}", status_code=204)
def delete_widget(
    identity: str, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    row = active_widget(db, user, identity)
    if row.deleted_at:
        raise HTTPException(404, "Registro não encontrado.")
    row.deleted_at = now()
    db.commit()


@router.post("/order")
def order(
    data: OrderInput, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    rows = widgets_for(db, user)
    if len(set(data.ids)) != len(data.ids) or set(data.ids) != {r.id for r in rows}:
        raise HTTPException(
            422, "A ordem deve conter todos os seus painéis uma única vez."
        )
    for row in rows:
        row.position = data.ids.index(row.id)
    db.commit()
    return {"ok": True}


@router.get("/entries/{kind}")
def entries(
    kind: Literal["personal", "finance"],
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    model = PersonalEntry if kind == "personal" else FinanceEntry
    return [
        dump(r)
        for r in db.scalars(
            select(model)
            .where(model.owner_id == user.id, model.deleted_at.is_(None))
            .order_by(model.entry_date.desc(), model.created_at.desc())
            .limit(100)
        )
    ]


@router.post("/entries/personal", status_code=201)
def add_personal(
    data: PersonalInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    row = PersonalEntry(owner_id=user.id, **data.model_dump())
    db.add(row)
    db.commit()
    return dump(row)


@router.put("/entries/personal/{identity}")
def edit_personal(
    identity: str,
    data: PersonalInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    row = owned(db, PersonalEntry, identity, user)
    if row.deleted_at:
        raise HTTPException(404, "Registro não encontrado.")
    for k, v in data.model_dump().items():
        setattr(row, k, v)
    db.commit()
    return dump(row)


@router.post("/entries/finance", status_code=201)
def add_finance(
    data: FinanceInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    row = FinanceEntry(
        owner_id=user.id,
        **data.model_dump(exclude={"amount"}),
        amount_cents=int(data.amount * 100),
    )
    db.add(row)
    db.commit()
    return dump(row)


@router.put("/entries/finance/{identity}")
def edit_finance(
    identity: str,
    data: FinanceInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    row = owned(db, FinanceEntry, identity, user)
    if row.deleted_at:
        raise HTTPException(404, "Registro não encontrado.")
    for k, v in data.model_dump(exclude={"amount"}).items():
        setattr(row, k, v)
    row.amount_cents = int(data.amount * 100)
    db.commit()
    return dump(row)


@router.delete("/entries/{kind}/{identity}", status_code=204)
def remove_entry(
    kind: Literal["personal", "finance"],
    identity: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    row = owned(
        db, PersonalEntry if kind == "personal" else FinanceEntry, identity, user
    )
    if row.deleted_at:
        raise HTTPException(404, "Registro não encontrado.")
    row.deleted_at = now()
    db.commit()


def date_range(days):
    end = datetime.now(ZoneInfo("America/Sao_Paulo")).date()
    return end - timedelta(days=days - 1), end


def internal_data(db, user, kind, config, start, end):
    points = {}
    day = start
    while day <= end:
        points[day.isoformat()] = {
            "label": day.isoformat(),
            "value": 0,
            "income": 0,
            "expense": 0,
        }
        day += timedelta(days=1)
    if kind == "personal":
        rows = list(
            db.scalars(
                select(PersonalEntry).where(
                    PersonalEntry.owner_id == user.id,
                    PersonalEntry.deleted_at.is_(None),
                    PersonalEntry.entry_date >= start,
                    PersonalEntry.entry_date <= end,
                )
            )
        )
        for row in rows:
            points[row.entry_date.isoformat()]["value"] += (
                row.minutes if config.metric == "minutes" else 1
            )
        return {
            "status": "ok" if rows else "empty",
            "source": "Seus registros pessoais",
            "message": "Tempo registrado manualmente; não é monitoramento automático.",
            "chart": providers.series_chart(
                list(points.values()),
                [
                    {
                        "key": "value",
                        "name": "Minutos"
                        if config.metric == "minutes"
                        else "Registros",
                        "color": "#5c9dff",
                    }
                ],
                "min" if config.metric == "minutes" else "",
            ),
            "kpis": [
                {
                    "label": "Tempo dedicado",
                    "value": sum(r.minutes for r in rows),
                    "unit": "min",
                },
                {"label": "Dias ativos", "value": len({r.entry_date for r in rows})},
            ],
        }
    if kind == "finance":
        rows = list(
            db.scalars(
                select(FinanceEntry).where(
                    FinanceEntry.owner_id == user.id,
                    FinanceEntry.deleted_at.is_(None),
                    FinanceEntry.entry_date >= start,
                    FinanceEntry.entry_date <= end,
                )
            )
        )
        totals = {"income": 0, "expense": 0}
        for row in rows:
            points[row.entry_date.isoformat()][row.direction] += row.amount_cents / 100
            totals[row.direction] += row.amount_cents
        return {
            "status": "ok" if rows else "empty",
            "source": "Seus lançamentos · BRL",
            "message": "Fluxo do período, sem saldo inicial e sem conexão bancária.",
            "chart": providers.series_chart(
                list(points.values()),
                [
                    {"key": "income", "name": "Receitas", "color": "#41d9b0"},
                    {"key": "expense", "name": "Despesas", "color": "#ef7994"},
                ],
                "R$",
            ),
            "kpis": [
                {"label": "Receitas", "value": totals["income"] / 100, "unit": "R$"},
                {"label": "Despesas", "value": totals["expense"] / 100, "unit": "R$"},
                {
                    "label": "Resultado",
                    "value": (totals["income"] - totals["expense"]) / 100,
                    "unit": "R$",
                },
            ],
        }
    rows = list(
        db.scalars(
            select(Activity).where(
                Activity.owner_id == user.id,
                Activity.origin == "automatic",
                Activity.occurred_at
                >= datetime.combine(start, datetime.min.time()) - timedelta(days=1),
            )
        )
    )
    for row in rows:
        day = (
            row.occurred_at.replace(tzinfo=timezone.utc)
            .astimezone(ZoneInfo("America/Sao_Paulo"))
            .date()
            .isoformat()
        )
        if day in points:
            points[day]["value"] += 1
    current = Counter(
        db.scalars(select(Task.status).where(Task.owner_id == user.id)).all()
    )
    return {
        "status": "ok" if any(current.values()) else "empty",
        "source": "Suas tarefas e histórico",
        "message": "Gráfico: eventos de conclusão no período (uma tarefa reaberta pode gerar outro evento). Distribuição: situação atual de todas as tarefas.",
        "chart": providers.series_chart(
            list(points.values()),
            [{"key": "value", "name": "Conclusões", "color": "#9e8dff"}],
        ),
        "distribution": [
            {"name": name, "value": current[key]}
            for key, name in [
                ("pending", "Pendentes"),
                ("in_progress", "Em andamento"),
                ("completed", "Concluídas"),
            ]
        ],
        "kpis": [
            {
                "label": "Conclusões no período",
                "value": sum(p["value"] for p in points.values()),
            },
            {
                "label": "Tarefas em aberto",
                "value": current["pending"] + current["in_progress"],
            },
        ],
    }


def analysis_data(db, user, config):
    if not config.analysis_id or not config.x_column or not config.y_column:
        return {
            "status": "needs_config",
            "source": "Sua análise salva",
            "message": "Escolha uma análise e as colunas do eixo e do valor.",
        }
    a = owned(db, Analysis, config.analysis_id, user)
    row = owned(db, ImportFile, a.import_id, user)
    saved = AnalysisConfig(**a.config)
    df, _ = read_import(row, saved.sheet)
    df, _, _ = analyze(df, saved)
    if config.x_column not in df.columns or config.y_column not in df.columns:
        raise HTTPException(
            422, "As colunas do gráfico não existem no resultado da análise."
        )
    if config.aggregation != "count" and not pd.api.types.is_numeric_dtype(
        df[config.y_column]
    ):
        raise HTTPException(422, "Escolha uma coluna numérica para soma ou média.")
    grouped = getattr(
        df.groupby(config.x_column, dropna=False, sort=True)[config.y_column],
        config.aggregation,
    )().reset_index(name="value")
    points = [
        {"label": str(r[config.x_column]), "value": r["value"]}
        for r in records(grouped.head(100))
    ]
    return {
        "status": "ok" if points else "empty",
        "source": "Planilha privada · " + a.name,
        "message": f"Até 100 grupos de {len(grouped)}. Usa todos os registros filtrados da análise; o seletor de período não refiltra a planilha.",
        "chart": providers.series_chart(
            points, [{"key": "value", "name": config.y_column, "color": "#42cddc"}]
        ),
        "kpis": [
            {"label": "Registros analisados", "value": len(df)},
            {"label": "Grupos", "value": len(grouped)},
        ],
    }


@router.get("/widgets/{identity}/data")
def widget_data(
    identity: str,
    days: int = Query(30, ge=7, le=90),
    refresh: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if days not in (7, 30, 90):
        raise HTTPException(422, "Escolha 7, 30 ou 90 dias.")
    row = active_widget(db, user, identity)
    config = WidgetConfig(**row.config)
    start, end = date_range(days)
    key = hashlib.sha256(
        json.dumps([days, end.isoformat(), row.config], sort_keys=True).encode()
    ).hexdigest()
    external = row.kind in ("github", "news", "macro", "stock", "weather", "teams")
    if (
        external
        and row.cached_data is not None
        and row.cache_key == key
        and row.cached_at
        and (now() - row.cached_at).total_seconds() < (30 if refresh else 600)
    ):
        cached = (
            newsroom.annotate(db, user, row.cached_data)
            if row.kind == "news"
            else row.cached_data
        )
        return {
            **cached,
            "as_of": row.cached_at.isoformat() + "Z",
            "cached": True,
        }
    try:
        if row.kind in ("tasks", "personal", "finance"):
            data = internal_data(db, user, row.kind, config, start, end)
        elif row.kind == "analysis":
            data = analysis_data(db, user, config)
        elif row.kind == "github":
            data = integrations.github_panel(db, user, config.repository, start, end)
        elif row.kind == "teams":
            data = integrations.task_panel(
                db, user, config.task_source, config.task_list_id
            )
        elif row.kind == "news":
            data = newsroom.aggregate(db, user, config, start, end, refresh)
        elif row.kind == "macro":
            data = providers.macro_data(config.series, start, end)
        elif row.kind == "weather":
            data = providers.weather_data(
                config.latitude, config.longitude, config.city
            )
        elif row.kind == "stock":
            data = providers.stock_data(config.symbol, start, end)
        else:
            raise HTTPException(422, "Tipo de painel inválido.")
    except providers.ProviderError as error:
        record(
            db,
            user,
            "Painel sem atualização",
            row.title + ": " + str(error),
            level="warning",
            fingerprint="widget:" + row.id,
        )
        db.commit()
        return {
            "status": "unavailable",
            "message": str(error),
            "source": {
                "github": "GitHub",
                "news": "Notícias",
                "macro": "Banco Central",
                "stock": "Alpha Vantage",
                "weather": "Open-Meteo",
            }.get(row.kind, ""),
            "as_of": None,
        }
    except HTTPException as error:
        return {
            "status": "needs_config",
            "message": str(error.detail),
            "source": "Sua análise salva",
            "as_of": None,
        }
    except (ValueError, KeyError, TypeError, AttributeError, OverflowError):
        record(
            db,
            user,
            "Dados incompatíveis na fonte",
            row.title,
            level="warning",
            fingerprint="format:" + row.id,
        )
        db.commit()
        return {
            "status": "unavailable",
            "message": "A fonte retornou dados incompatíveis. Tente atualizar mais tarde.",
            "as_of": None,
        }
    stamp = now()
    if external:
        row.cached_data = data
        row.cached_at = stamp
        row.cache_key = key
        db.commit()
    if row.kind == "news":
        data = newsroom.annotate(db, user, data)
    return {**data, "as_of": stamp.isoformat() + "Z", "cached": False}


def active_widget(db, user, identity):
    row = owned(db, DashboardWidget, identity, user)
    if row.deleted_at:
        raise HTTPException(404, "Painel não encontrado.")
    return row


@router.get("/widgets/{identity}")
def get_widget(
    identity: str, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    return public_widget(active_widget(db, user, identity))


@router.get("/company-search")
def company_search(
    q: str = Query(min_length=2, max_length=300), user: User = Depends(current_user)
):
    try:
        return providers.company_search(q)
    except providers.ProviderError as e:
        raise HTTPException(422, str(e))


@router.get("/city-search")
def city_search(
    q: str = Query(min_length=2, max_length=100), user: User = Depends(current_user)
):
    try:
        return providers.city_search(q)
    except providers.ProviderError as e:
        raise HTTPException(422, str(e))
