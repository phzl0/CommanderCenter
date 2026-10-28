from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from app.models import EconomySettings, Task, now
from app.modules import economy, newsroom, providers, integrations
from app.modules.timeframes import resample
from tests.conftest import login_b


def test_fixed_catalogue_and_custom_html(client, monkeypatch):
    sources = client.post("/api/sources/bootstrap").json()
    assert len(sources) == 9
    for category in ("Política", "Futebol", "Economia"):
        assert (
            len([s for s in sources if s["category"] == category and s["builtin_key"]])
            == 3
        )
    assert client.delete("/api/sources/" + sources[0]["id"]).status_code == 422
    html = b'<html><head><title>Meu Futebol</title></head><body><nav><a href="/futebol/ignore">Menu com texto longo que nao deve virar manchete</a></nav><a href="/noticias/futebol/campeonato"><img src="/foto.jpg"/>Clube anuncia novo treinador para disputar o campeonato</a></body></html>'
    monkeypatch.setattr(
        newsroom, "public_fetch", lambda url, **kw: (html, "text/html", url)
    )
    preview = client.post(
        "/api/sources/preview", json={"url": "https://example.com/futebol"}
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["kind"] == "auto" and len(preview.json()["items"]) == 1
    r = client.post(
        "/api/sources",
        json={
            "name": "Meu time",
            "category": "Futebol",
            "url": "https://example.com/futebol",
        },
    )
    assert r.status_code == 201, r.text
    identity = r.json()["id"]
    assert r.json()["kind"] == "auto" and not r.json()["builtin_key"]
    login_b(client)
    assert client.delete("/api/sources/" + identity).status_code == 404


def test_large_page_and_structured_headlines():
    html = (
        b'<html><head><title>Noticias</title><script type="application/ld+json">{"@type":"NewsArticle","headline":"Uma manchete real do site","mainEntityOfPage":{"@id":"https://example.com/noticias/a"},"image":{"url":"https://example.com/a.jpg"},"datePublished":"2026-10-28"}</script></head><body>'
        + b" " * 3000000
        + b"</body></html>"
    )
    title, items = newsroom.html_headlines(html, "https://example.com/")
    assert title == "Noticias" and items[0]["image"] == "https://example.com/a.jpg"


def test_economy_cache_key_privacy_and_partial_failures(client, env, monkeypatch):
    calls = []

    def market(path, token=""):
        calls.append((path, token))
        symbol = path.split("/")[-1]
        return {
            "results": [
                {
                    "symbol": symbol,
                    "regularMarketPrice": 32,
                    "regularMarketChangePercent": -1.5 if symbol == "PETR4" else 2,
                    "regularMarketTime": "2026-10-28T18:00:00Z",
                }
            ]
        }

    monkeypatch.setattr(economy, "market_get", market)
    monkeypatch.setattr(
        economy,
        "gdp_data",
        lambda: (_ for _ in ()).throw(providers.ProviderError("unavailable")),
    )
    monkeypatch.setattr(
        providers,
        "macro_data",
        lambda code, start, end: {
            "status": "ok",
            "source": "BCB fixture",
            "chart": providers.series_chart(
                [
                    {"label": "2026-10-01", "value": 10},
                    {"label": "2026-10-28", "value": 11},
                ],
                [{"key": "value", "name": code}],
                "%",
            ),
        },
    )
    r = client.get("/api/economy/overview")
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["stocks"]) == 12
    assert sum(s["status"] == "ok" for s in data["stocks"]) == 4
    assert data["indicators"]["pib"]["status"] == "unavailable"
    assert client.get("/api/economy/overview").json()["cached"]
    assert len(calls) == 4
    assert (
        client.put(
            "/api/economy/settings", json={"api_key": "private-test-key"}
        ).status_code
        == 200
    )
    assert "private-test-key" not in client.get("/api/economy/settings").text
    _, factory = env
    with factory() as db:
        stored = db.get(EconomySettings, "user-a").api_key
        assert (
            "private-test-key" not in stored
            and integrations.unpack(stored) == "private-test-key"
        )
    data = client.get("/api/economy/overview").json()
    assert all(s["status"] == "ok" for s in data["stocks"])
    login_b(client)
    assert not client.get("/api/economy/settings").json()["has_key"]
    assert client.get("/api/economy/stocks/INVALID/history").status_code == 422


def test_gdp_and_resampling_semantics(monkeypatch):
    monkeypatch.setattr(
        providers,
        "get_json",
        lambda url: [
            {
                "id": "6564",
                "resultados": [
                    {
                        "classificacoes": [
                            {"categoria": {"90707": "PIB a preços de mercado"}}
                        ],
                        "series": [
                            {
                                "serie": {
                                    "202601": "1.1",
                                    "202602": "0.5",
                                    "202603": "...",
                                }
                            }
                        ],
                    }
                ],
            }
        ],
    )
    data = economy.gdp_data()
    assert (
        data["data_date"] == "2026-T2" and data["chart"]["points"][-1]["value"] == 0.5
    )
    frame = {
        "chart": providers.series_chart(
            [{"label": "2026-10-01", "value": 3}, {"label": "2026-10-28", "value": 4}],
            [{"key": "value", "name": "Valor"}],
        )
    }
    assert resample(frame, "month")["chart"]["points"] == [
        {"label": "2026-10", "value": 4}
    ]
    assert resample(frame, "month", additive=True)["chart"]["points"][0]["value"] == 7
    assert "sem série por hora" in resample(frame, "hour")["period_note"]


def test_hourly_tasks_and_agenda_conflicts(client, env):
    client.put("/api/account/preferences", json={"timezone": "UTC"})
    ws = client.post("/api/intelligence/bootstrap").json()
    task_widget = next(w for w in ws["widgets"] if w["kind"] == "tasks")
    _, factory = env
    with factory() as db:
        db.add(
            Task(
                owner_id="user-a",
                title="Feita",
                status="completed",
                completed_at=now() - timedelta(hours=1),
            )
        )
        db.add(
            Task(
                owner_id="user-b",
                title="Privada",
                status="completed",
                completed_at=now() - timedelta(hours=1),
            )
        )
        db.commit()
    r = client.get(
        f"/api/intelligence/widgets/{task_widget['id']}/data?days=1&interval=hour"
    ).json()
    assert (
        len(r["chart"]["points"]) == 24
        and sum(p["value"] for p in r["chart"]["points"]) == 1
    )
    day = (now() + timedelta(days=1)).date().isoformat()
    ids = []
    for title, start, end, kind in [
        ("Reunião A", "09:00", "10:00", "appointment"),
        ("Reunião B", "09:30", "10:30", "appointment"),
        ("Ler documento", "11:00", "11:15", "todo"),
    ]:
        r = client.post(
            "/api/planning/appointments",
            json={
                "title": title,
                "start_at": day + "T" + start,
                "end_at": day + "T" + end,
                "kind": kind,
            },
        )
        assert r.status_code == 201
        ids.append(r.json()["id"])
    data = client.get("/api/planning/dashboard?day=" + day).json()
    assert (
        set(data["conflict_ids"]) == set(ids[:2])
        and data["summary"]["pending"] == 1
        and len(data["upcoming"]) == 3
    )
    login_b(client)
    assert not client.get("/api/planning/dashboard?day=" + day).json()["upcoming"]


def test_catalogue_upgrade_preserves_custom_metadata(client, env):
    from app.models import NewsSource, SourceSettings

    client.post("/api/sources/bootstrap")
    _, factory = env
    with factory() as db:
        row = db.scalar(
            select(NewsSource).where(
                NewsSource.owner_id == "user-a", NewsSource.builtin_key == "economia-g1"
            )
        )
        row.builtin_key = None
        row.name = "Minha Economia"
        row.category = "Trabalho"
        db.get(SourceSettings, "user-a").catalogue_version = 0
        db.commit()
    rows = client.post("/api/sources/bootstrap").json()
    assert len(rows) == 10 and any(
        r["name"] == "Minha Economia" and r["category"] == "Trabalho" for r in rows
    )
    assert len([r for r in rows if r["builtin_key"]]) == 9
    assert len(client.post("/api/sources/bootstrap").json()) == 10
