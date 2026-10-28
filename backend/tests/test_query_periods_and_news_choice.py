from datetime import date
from app.modules import economy, providers, newsroom
from tests.conftest import login_b


def test_economic_period_query_strings(client, monkeypatch):
    monkeypatch.setattr(
        economy,
        "quote",
        lambda symbol, token: {"symbol": symbol, "status": "unavailable"},
    )
    monkeypatch.setattr(economy, "gdp_data", lambda: {"status": "empty"})
    monkeypatch.setattr(providers, "macro_data", lambda *a: {"status": "empty"})
    for days in (1, 7, 30, 90, 365):
        for interval in ("day", "week", "month", "hour"):
            response = client.get(
                f"/api/economy/overview?days={days}&interval={interval}"
            )
            assert response.status_code == 200, response.text
    for days in ("2", "0", "366", "abc"):
        assert client.get("/api/economy/overview?days=" + days).status_code == 422


def test_daily_dollar_uses_latest_reference_on_weekend(monkeypatch):
    calls = []

    def get(url):
        calls.append(url)
        return [{"data": "23/10/2026", "valor": "5.30"}]

    monkeypatch.setattr(providers, "get_json", get)
    data = providers.macro_data("usd", date(2026, 10, 25), date(2026, 10, 25))
    assert data["data_date"] == "2026-10-23"
    assert "dataInicial=15/10/2026" in calls[0]
    assert "diária" in data["period_note"]
    assert data["chart"]["points"] == [{"label": "2026-10-23", "value": 5.3}]


def test_news_default_choice_alternative_and_privacy(client, monkeypatch):
    def load(source):
        return source["name"], [
            newsroom.clean_item(
                "Manchete sobre acontecimentos importantes do dia",
                source["url"].rstrip("/") + "/item",
                "",
                "",
                "",
            )
        ]

    monkeypatch.setattr(newsroom, "load_feed", load)
    sources = client.post("/api/sources/bootstrap").json()
    assert len(sources) == 9
    for category in ("Política", "Futebol", "Economia"):
        group = [s for s in sources if s["category"] == category]
        assert len(group) == 3 and sum(s["is_primary"] for s in group) == 1
        result = client.get(
            "/api/intelligence/news", params={"category": category}
        ).json()
        assert result["selected_source"]["is_primary"]
        assert len(result["available_sources"]) == 3
        assert len(result["items"]) == 1
        alternative = next(s for s in group if not s["is_primary"])
        response = client.put(
            "/api/sources/preference",
            json={"category": category, "source_id": alternative["id"]},
        )
        assert response.status_code == 200, response.text
        result = client.get(
            "/api/intelligence/news", params={"category": category}
        ).json()
        assert result["selected_source"]["id"] == alternative["id"]
    foreign_id = alternative["id"]
    login_b(client)
    assert (
        client.put(
            "/api/sources/preference",
            json={"category": "Economia", "source_id": foreign_id},
        ).status_code
        == 404
    )
    assert (
        client.get(
            "/api/intelligence/news",
            params={"category": "Economia", "source_id": foreign_id},
        ).status_code
        == 404
    )
    assert client.get("/api/intelligence/news?category=Economia").json()[
        "selected_source"
    ]["is_primary"]


def test_economic_and_widget_refresh_preserve_good_data(client, env, monkeypatch):
    from datetime import timedelta
    from app.models import EconomySettings, DashboardWidget, now

    monkeypatch.setattr(
        economy,
        "quote",
        lambda symbol, token: {"symbol": symbol, "status": "unavailable"},
    )
    monkeypatch.setattr(economy, "gdp_data", lambda: {"status": "empty"})
    monkeypatch.setattr(
        providers,
        "macro_data",
        lambda *a: {
            "status": "ok",
            "chart": {
                "points": [{"label": "2026-10-23", "value": 5.3}],
                "series": [{"key": "value"}],
            },
            "data_date": "2026-10-23",
        },
    )
    first = client.get("/api/economy/overview?days=7").json()
    workspace = client.post("/api/intelligence/bootstrap").json()
    widget = next(w for w in workspace["widgets"] if w["kind"] == "macro")
    good = client.get(
        "/api/intelligence/widgets/" + widget["id"] + "/data?days=1"
    ).json()
    _, factory = env
    with factory() as db:
        db.get(EconomySettings, "user-a").cached_at = now() - timedelta(minutes=11)
        db.get(DashboardWidget, widget["id"]).cached_at = now() - timedelta(minutes=11)
        db.commit()

    def fail(*a):
        raise providers.ProviderError("Provedor temporariamente indisponível")

    monkeypatch.setattr(providers, "macro_data", fail)
    result = client.get("/api/economy/overview?days=7&refresh=true").json()
    assert result["indicators"]["usd"]["chart"] == first["indicators"]["usd"]["chart"]
    assert result["indicators"]["usd"]["stale"]
    result = client.get(
        "/api/intelligence/widgets/" + widget["id"] + "/data?days=1&refresh=true"
    ).json()
    assert result["chart"] == good["chart"] and result["stale"]


def test_catalogue_v1_upgrade_keeps_choices_and_custom_sources(client, env):
    from sqlalchemy import select
    from app.models import NewsSource, SourceSettings

    sources = client.post("/api/sources/bootstrap").json()
    _, factory = env
    old = {
        "politica-uol": "politica-camara",
        "politica-cnn": "politica-senado",
        "economia-valor": "economia-ibge",
    }
    with factory() as db:
        for row in db.scalars(
            select(NewsSource).where(NewsSource.owner_id == "user-a")
        ):
            if row.builtin_key in old:
                row.builtin_key = old[row.builtin_key]
                row.url = "https://old.example.com/" + row.builtin_key
                row.cached_items = [{"title": "Fonte anterior"}]
        chosen = next(s for s in sources if s["builtin_key"] == "politica-uol")
        settings = db.get(SourceSettings, "user-a")
        settings.catalogue_version = 1
        settings.preferred_sources = {"Política": chosen["id"]}
        db.add(
            NewsSource(
                owner_id="user-a",
                name="Minha fonte",
                category="Jogos",
                kind="rss",
                url="https://example.com/feed",
                enabled=True,
            )
        )
        db.commit()
    upgraded = client.post("/api/sources/bootstrap").json()
    assert len(upgraded) == 10 and len([s for s in upgraded if s["builtin_key"]]) == 9
    choice = next(s for s in upgraded if s["id"] == chosen["id"])
    assert choice["builtin_key"] == "politica-uol" and choice["is_selected"]
    assert len(client.post("/api/sources/bootstrap").json()) == 10
