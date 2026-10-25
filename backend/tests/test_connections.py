from datetime import timedelta
from urllib.parse import urlparse, parse_qs
import pytest
from sqlalchemy import select, text
from alembic import command
from alembic.config import Config
from app.core.config import settings
from app.models import IntegrationConnection, IntegrationFlow, User, now
from app.modules import integrations, providers
from tests.conftest import login_b


def setup_connection(monkeypatch, provider="github"):
    monkeypatch.setattr(settings, provider + "_client_id", "test-client")
    monkeypatch.setattr(settings, provider + "_client_secret", "disposable-secret")


def test_layout_limit_and_duplicate_cards(client):
    ws = client.post("/api/intelligence/bootstrap").json()
    assert ws["card_limit"] == 5
    assert ws["widgets"][2]["kind"] == "news"
    for w in ws["widgets"][:2]:
        client.delete("/api/intelligence/widgets/" + w["id"])
    for title in ("GitHub A", "GitHub B"):
        result = client.post(
            "/api/intelligence/widgets",
            json={
                "title": title,
                "kind": "github",
                "config": {
                    "repository": "https://github.com/phzl0/CommanderCenter.git"
                },
            },
        )
        assert result.status_code == 201, result.text
        assert result.json()["config"]["repository"] == "phzl0/CommanderCenter"
    for url in (
        "https://evil.example/a/b",
        "https://github.com/a/b/issues",
        "https://user@github.com/a/b",
    ):
        assert (
            client.post(
                "/api/intelligence/widgets",
                json={
                    "title": "GitHub",
                    "kind": "github",
                    "config": {"repository": url},
                },
            ).status_code
            == 422
        )
    assert (
        client.put("/api/intelligence/settings", json={"card_limit": 5}).status_code
        == 200
    )
    assert client.post("/api/intelligence/bootstrap").json()["card_limit"] == 5
    for n in (0, 6, 13):
        assert (
            client.put("/api/intelligence/settings", json={"card_limit": n}).status_code
            == 422
        )
    login_b(client)
    assert client.post("/api/intelligence/bootstrap").json()["card_limit"] == 5


def test_oauth_pkce_private_storage_and_replay(client, env, monkeypatch):
    setup_connection(monkeypatch)
    result = client.post("/api/integrations/github/start")
    assert result.status_code == 200, result.text
    params = parse_qs(urlparse(result.json()["url"]).query)
    assert params["code_challenge_method"] == ["S256"] and params["scope"] == [
        "read:user"
    ]
    state = params["state"][0]
    _, factory = env
    with factory() as db:
        flow = db.scalar(select(IntegrationFlow))
        assert (
            state not in flow.state_hash
            and len(integrations.unpack(flow.verifier)) >= 43
        )
    calls = []

    def remote(method, url, **kwargs):
        calls.append((method, url, kwargs))
        if method == "POST":
            return {"access_token": "sensitive-access"}
        if url.endswith("/user"):
            return {"login": "my-account"}
        return [{"full_name": "my-account/project", "description": "Project"}]

    monkeypatch.setattr(integrations, "remote", remote)
    response = client.get(
        "/api/integrations/github/callback",
        params={"state": state, "code": "code"},
        follow_redirects=False,
    )
    assert response.status_code == 303 and response.headers["location"].endswith(
        "connected"
    )
    assert (
        client.get(
            "/api/integrations/github/callback", params={"state": state, "code": "code"}
        ).status_code
        == 400
    )
    with factory() as db:
        row = db.scalar(select(IntegrationConnection))
        assert "sensitive-access" not in row.credentials
        assert (
            integrations.unpack(row.credentials)["access_token"] == "sensitive-access"
        )
    status = client.get("/api/integrations").json()
    assert status["github"][
        "account"
    ] == "my-account" and "sensitive-access" not in str(status)
    assert (
        client.get("/api/integrations/github/repositories").json()["items"][0]["name"]
        == "my-account/project"
    )
    login_b(client)
    assert not client.get("/api/integrations").json()["github"]["connected"]
    assert client.get("/api/integrations/github/repositories").status_code == 422
    client.delete("/api/integrations/github")
    with factory() as db:
        assert db.scalar(
            select(IntegrationConnection).where(
                IntegrationConnection.owner_id == "user-a"
            )
        )


def test_oauth_session_binding_cancel_and_expiry(client, env, monkeypatch):
    setup_connection(monkeypatch)

    def begin():
        return parse_qs(
            urlparse(client.post("/api/integrations/github/start").json()["url"]).query
        )["state"][0]

    state = begin()
    # New login changes the session even for the same owner.
    client.post("/api/auth/logout")
    client.post(
        "/api/auth/login",
        json={"email": "a@example.com", "password": "strong-password-a"},
    )
    assert (
        client.get(
            "/api/integrations/github/callback", params={"state": state, "code": "x"}
        ).status_code
        == 400
    )
    state = begin()
    response = client.get(
        "/api/integrations/github/callback",
        params={"state": state, "error": "access_denied"},
        follow_redirects=False,
    )
    assert response.headers["location"].endswith("cancelled")
    state = begin()
    _, factory = env
    with factory() as db:
        row = db.scalar(select(IntegrationFlow))
        row.expires_at = now() - timedelta(seconds=1)
        db.commit()
    assert (
        client.get(
            "/api/integrations/github/callback", params={"state": state, "code": "x"}
        ).status_code
        == 400
    )


def test_tasks_read_refresh_disconnect_and_owner(client, env, monkeypatch):
    setup_connection(monkeypatch, "microsoft")
    _, factory = env
    with factory() as db:
        db.add(
            IntegrationConnection(
                owner_id="user-a",
                provider="microsoft",
                account="work",
                credentials=integrations.pack(
                    {"access_token": "old", "refresh_token": "refresh"}
                ),
                expires_at=now() - timedelta(seconds=1),
            )
        )
        db.commit()
    calls = []

    def remote(method, url, **kwargs):
        calls.append((method, url, kwargs))
        if method == "POST":
            return {
                "access_token": "new",
                "refresh_token": "rotated",
                "expires_in": 3600,
            }
        if url.endswith("lists?$top=100"):
            return {"value": [{"id": "list-1", "displayName": "Trabalho"}]}
        if "/todo/lists/" in url:
            return {
                "value": [
                    {
                        "id": "t2",
                        "title": "Estudar",
                        "status": "completed",
                        "dueDateTime": {"dateTime": "2026-10-26T00:00:00"},
                    }
                ]
            }
        return {
            "value": [
                {
                    "id": "t1",
                    "title": "Revisar sprint",
                    "percentComplete": 50,
                    "dueDateTime": "2026-10-26T00:00:00Z",
                }
            ]
        }

    monkeypatch.setattr(integrations, "remote", remote)
    ws = client.post("/api/intelligence/bootstrap").json()
    client.delete("/api/intelligence/widgets/" + ws["widgets"][0]["id"])
    w = client.post(
        "/api/intelligence/widgets", json={"title": "Teams", "kind": "teams"}
    ).json()
    data = client.get(f"/api/intelligence/widgets/{w['id']}/data").json()
    assert (
        data["task_items"][0]["title"] == "Revisar sprint"
        and data["kpis"][0]["value"] == 1
    )
    assert (
        client.get("/api/integrations/microsoft/lists").json()[0]["name"] == "Trabalho"
    )
    with factory() as db:
        user = db.get(User, "user-a")
        data = integrations.task_panel(db, user, "todo", "list-1")
        assert data["task_items"][0]["completed"]
        row = db.scalar(select(IntegrationConnection))
        assert integrations.unpack(row.credentials)["refresh_token"] == "rotated"
    assert len([c for c in calls if c[0] == "POST"]) == 1
    assert all("chat" not in c[1] and "messages" not in c[1] for c in calls)
    assert client.delete("/api/integrations/microsoft").status_code == 204
    assert (
        client.get(f"/api/intelligence/widgets/{w['id']}/data").json()["status"]
        == "needs_config"
    )


def test_unconfigured_and_remote_host_guard(client):
    assert client.post("/api/integrations/github/start").status_code == 409
    with pytest.raises(providers.ProviderError):
        integrations.remote("GET", "https://evil.example/", token="secret")


def test_existing_workspace_migration_keeps_preferences(env):
    _, factory = env
    cfg = Config("alembic.ini")
    command.downgrade(cfg, "5f1158e2520e")
    with factory() as db:
        db.execute(
            text("INSERT INTO workspace_settings (owner_id,days) VALUES ('user-a',90)")
        )
        db.commit()
    command.upgrade(cfg, "head")
    with factory() as db:
        row = db.execute(
            text(
                "SELECT days,card_limit FROM workspace_settings WHERE owner_id='user-a'"
            )
        ).one()
        assert tuple(row) == (90, 5)
