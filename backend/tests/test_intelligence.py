from datetime import date
import pytest
from app.modules import providers, newsroom
from app.core.config import settings
from tests.conftest import login_b


def bootstrap(client):
    r = client.post("/api/intelligence/bootstrap")
    assert r.status_code == 200, r.text
    return r.json()


def get_kind(workspace, kind):
    return next(w for w in workspace["widgets"] if w["kind"] == kind)


def test_workspace_preferences_and_owner(client):
    workspace = bootstrap(client)
    assert len(workspace["widgets"]) == 6
    assert bootstrap(client)["widgets"] == workspace["widgets"]
    w = get_kind(workspace, "personal")
    payload = {k: w[k] for k in ("title", "kind", "visible", "wide", "config")}
    payload.update(title="Meu estudo", visible=False, wide=True)
    assert (
        client.put("/api/intelligence/widgets/" + w["id"], json=payload).status_code
        == 200
    )
    assert (
        client.put("/api/intelligence/settings", json={"days": 90}).status_code == 200
    )
    ids = [x["id"] for x in workspace["widgets"]][::-1]
    assert client.post("/api/intelligence/order", json={"ids": ids}).status_code == 200
    assert bootstrap(client)["widgets"][0]["id"] == ids[0]
    assert bootstrap(client)["days"] == 90
    assert (
        client.post("/api/intelligence/order", json={"ids": [ids[0]]}).status_code
        == 422
    )
    login_b(client)
    assert client.get(f"/api/intelligence/widgets/{w['id']}/data").status_code == 404
    assert (
        client.put("/api/intelligence/widgets/" + w["id"], json=payload).status_code
        == 404
    )
    assert client.delete("/api/intelligence/widgets/" + w["id"]).status_code == 404
    assert bootstrap(client)["days"] == 30


def test_finance_exact_amounts_and_personal(client):
    from app.modules.intelligence import date_range

    day = date_range(7)[1].isoformat()
    workspace = bootstrap(client)
    for direction, amount in [("income", "1000.10"), ("expense", "300.05")]:
        r = client.post(
            "/api/intelligence/entries/finance",
            json={
                "description": "Lançamento",
                "category": "Pessoal",
                "direction": direction,
                "amount": amount,
                "entry_date": day,
            },
        )
        assert r.status_code == 201, r.text
    w = get_kind(workspace, "finance")
    data = client.get(f"/api/intelligence/widgets/{w['id']}/data?days=7").json()
    assert [k["value"] for k in data["kpis"]] == [1000.1, 300.05, 700.05]
    r = client.post(
        "/api/intelligence/entries/personal",
        json={"label": "Estudo", "minutes": 45, "entry_date": day},
    )
    assert r.status_code == 201
    entry = r.json()
    w = get_kind(workspace, "personal")
    data = client.get(f"/api/intelligence/widgets/{w['id']}/data?days=7").json()
    assert data["kpis"][0]["value"] == 45
    assert (
        client.put(
            "/api/intelligence/entries/personal/" + entry["id"],
            json={"label": "Estudo", "minutes": 60, "entry_date": day},
        ).status_code
        == 200
    )
    assert (
        client.get(f"/api/intelligence/widgets/{w['id']}/data?days=7").json()["kpis"][
            0
        ]["value"]
        == 60
    )
    assert (
        client.post(
            "/api/intelligence/entries/finance",
            json={
                "description": "x",
                "category": "x",
                "direction": "expense",
                "amount": "1.001",
                "entry_date": day,
            },
        ).status_code
        == 422
    )
    login_b(client)
    assert client.get("/api/intelligence/entries/finance").json() == []
    assert (
        client.delete("/api/intelligence/entries/personal/" + entry["id"]).status_code
        == 404
    )


def test_widget_limit_and_no_reset_after_removal(client):
    workspace = bootstrap(client)
    for w in workspace["widgets"]:
        client.delete("/api/intelligence/widgets/" + w["id"])
    for i in range(5):
        assert (
            client.post(
                "/api/intelligence/widgets",
                json={"title": f"Painel {i}", "kind": "personal"},
            ).status_code
            == 201
        )
    assert (
        client.post(
            "/api/intelligence/widgets", json={"title": "Excedente", "kind": "personal"}
        ).status_code
        == 422
    )
    for w in bootstrap(client)["widgets"]:
        assert client.delete("/api/intelligence/widgets/" + w["id"]).status_code == 204
    assert bootstrap(client)["widgets"] == []


def test_providers_cache_and_failure_isolation(client, monkeypatch):
    calls = []

    def macro(code, start, end):
        calls.append(code)
        return {
            "status": "ok",
            "source": "BCB teste",
            "chart": {
                "points": [{"label": end.isoformat(), "value": 5.2}],
                "series": [{"key": "value", "name": "USD", "color": "#000"}],
                "unit": "R$",
            },
        }

    monkeypatch.setattr(providers, "macro_data", macro)
    workspace = bootstrap(client)
    w = get_kind(workspace, "macro")
    assert (
        client.get(f"/api/intelligence/widgets/{w['id']}/data").json()["status"] == "ok"
    )
    assert (
        client.get(f"/api/intelligence/widgets/{w['id']}/data").json()["cached"] is True
    )
    assert calls == ["usd"]

    def failed(*args):
        raise providers.ProviderError("Fonte temporariamente indisponível.")

    monkeypatch.setattr(newsroom, "aggregate", failed)
    w = get_kind(workspace, "news")
    assert (
        client.get(f"/api/intelligence/widgets/{w['id']}/data").json()["status"]
        == "unavailable"
    )
    assert client.get("/api/tasks").status_code == 200
    assert (
        client.get(f"/api/intelligence/widgets/{w['id']}/data?days=365").status_code
        == 422
    )


def test_provider_payloads_no_live_network(monkeypatch):
    from app.modules.intelligence import date_range

    start, end = date_range(7)

    def response(url):
        if "/commits?" in url:
            return [{"commit": {"committer": {"date": end.isoformat() + "T12:00:00Z"}}}]
        if "api.github.com" in url:
            return {
                "stargazers_count": 2,
                "open_issues_count": 1,
                "html_url": "https://github.com/test/repo",
            }
        if "api.bcb.gov.br" in url:
            return [{"data": end.strftime("%d/%m/%Y"), "valor": "5.12"}]
        return {
            "items": [
                {
                    "titulo": "<b>Notícia econômica</b>",
                    "link": "https://agenciadenoticias.ibge.gov.br/noticia",
                    "data_publicacao": end.strftime("%d/%m/%Y") + " 10:00:00",
                }
            ]
        }

    monkeypatch.setattr(providers, "get_json", response)
    assert providers.github_data("test/repo", start, end)["kpis"][0]["value"] == 1
    assert (
        providers.macro_data("usd", start, end)["chart"]["points"][0]["value"] == 5.12
    )
    news = providers.news_data("ibge", start, end)
    assert news["items"][0]["title"] == "Notícia econômica"
    assert providers.safe_link("javascript:alert(1)") == ""
    monkeypatch.setattr(settings, "alpha_vantage_api_key", "")
    assert providers.stock_data("IBM", start, end)["status"] == "needs_config"
    with pytest.raises(providers.ProviderError):
        providers.get_bytes("http://127.0.0.1/private")


def test_analysis_chart_and_cross_user_reference(client):
    workspace = bootstrap(client)
    client.delete("/api/intelligence/widgets/" + workspace["widgets"][0]["id"])
    r = client.post(
        "/api/imports",
        files={"file": ("p.csv", b"categoria;valor\nA;10\nA;20\nB;5\n")},
        data={"separator": ";"},
    )
    assert r.status_code == 201
    a = client.post(
        "/api/analyses",
        json={"name": "Teste", "import_id": r.json()["id"], "config": {}},
    ).json()
    r = client.post(
        "/api/intelligence/widgets",
        json={
            "title": "Minha planilha",
            "kind": "analysis",
            "config": {
                "analysis_id": a["id"],
                "x_column": "categoria",
                "y_column": "valor",
            },
        },
    )
    assert r.status_code == 201, r.text
    w = r.json()
    data = client.get(f"/api/intelligence/widgets/{w['id']}/data").json()
    assert data["chart"]["points"] == [
        {"label": "A", "value": 30.0},
        {"label": "B", "value": 5.0},
    ]
    login_b(client)
    assert (
        client.post(
            "/api/intelligence/widgets",
            json={
                "title": "Invasão",
                "kind": "analysis",
                "config": {"analysis_id": a["id"]},
            },
        ).status_code
        == 404
    )


def test_github_validation_and_stock_key_not_exposed(client, monkeypatch):
    ws=bootstrap(client)
    client.delete("/api/intelligence/widgets/" + ws["widgets"][0]["id"])
    assert (
        client.post(
            "/api/intelligence/widgets",
            json={
                "title": "x",
                "kind": "github",
                "config": {"repository": "https://localhost/private"},
            },
        ).status_code
        == 422
    )
    monkeypatch.setattr(settings, "alpha_vantage_api_key", "test-only-not-real")
    monkeypatch.setattr(providers, "get_json", lambda url: {"Information": "limit"})
    w = client.post(
        "/api/intelligence/widgets",
        json={"title": "Ação", "kind": "stock", "config": {"symbol": "IBM"}},
    ).json()
    r = client.get(f"/api/intelligence/widgets/{w['id']}/data")
    assert r.json()["status"] == "unavailable" and "test-only-not-real" not in r.text


def test_personal_finance_exports(client):
    day = date.today().isoformat()
    client.post(
        "/api/intelligence/entries/finance",
        json={
            "description": "Mercado",
            "category": "Alimentação",
            "direction": "expense",
            "amount": "42.15",
            "entry_date": day,
        },
    )
    for kind in ["finance", "personal"]:
        r = client.post(
            "/api/reports",
            json={
                "title": "Novo relatório",
                "dataset": kind,
                "format": "csv",
                "date_from": day,
                "date_to": day,
            },
        )
        assert r.status_code == 201, r.text
        csv = client.get("/api/reports/" + r.json()["id"] + "/download").text
        assert ("amount_brl" if kind == "finance" else "minutes") in csv
        if kind == "finance":
            assert "42.15" in csv


def test_ipca_keeps_twelve_month_window_independent_of_dashboard_period(monkeypatch):
    from datetime import timedelta
    from app.modules.intelligence import date_range

    _, end = date_range(30)
    urls = []

    def response(url):
        urls.append(url)
        return []

    monkeypatch.setattr(providers, "get_json", response)
    providers.macro_data("ipca", end - timedelta(days=6), end)
    providers.macro_data("ipca", end - timedelta(days=89), end)
    assert urls[0] == urls[1]
