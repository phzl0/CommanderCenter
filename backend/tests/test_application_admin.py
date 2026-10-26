from urllib.parse import urlparse, parse_qs
from sqlalchemy import select
from app.models import User, OAuthApplication, IntegrationConnection, IntegrationFlow
from app.modules import integrations
from app.core.config import settings


def admin(env):
    _, factory = env
    with factory() as db:
        db.get(User, "user-a").is_admin = True
        db.commit()


def test_admin_only_encrypted_no_secret_echo(client, env):
    body = {
        "client_id": "demo",
        "client_secret": "private-demo-secret",
        "password": "strong-password-a",
    }
    assert client.get("/api/integrations/admin/applications").status_code == 403
    assert (
        client.put("/api/integrations/admin/applications/github", json=body).status_code
        == 403
    )
    admin(env)
    assert (
        client.put(
            "/api/integrations/admin/applications/github",
            json={**body, "password": "wrong"},
        ).status_code
        == 403
    )
    r = client.put("/api/integrations/admin/applications/github", json=body)
    assert r.status_code == 200, r.text
    r = client.get("/api/integrations/admin/applications")
    assert "private-demo-secret" not in r.text and r.json()["github"]["has_secret"]
    _, factory = env
    with factory() as db:
        row = db.get(OAuthApplication, "github")
        assert "private-demo-secret" not in row.credentials
        assert (
            integrations.unpack(row.credentials)["client_secret"]
            == "private-demo-secret"
        )
    assert (
        client.put(
            "/api/integrations/admin/applications/github",
            json={**body, "client_secret": ""},
        ).status_code
        == 200
    )
    assert (
        client.put(
            "/api/integrations/admin/applications/github",
            json={**body, "client_id": "other", "client_secret": ""},
        ).status_code
        == 422
    )


def test_popup_fallback_and_replay(client, monkeypatch):
    monkeypatch.setattr(settings, "github_client_id", "env-id")
    monkeypatch.setattr(settings, "github_client_secret", "env-secret")
    assert client.get("/api/integrations").json()["github"]["configured"]
    r = client.post("/api/integrations/github/start?popup=true")
    state = parse_qs(urlparse(r.json()["url"]).query)["state"][0]
    monkeypatch.setattr(
        integrations,
        "remote",
        lambda method, url, **kw: (
            {"access_token": "secret-token"} if method == "POST" else {"login": "paulo"}
        ),
    )
    r = client.get(
        "/api/integrations/github/callback", params={"state": state, "code": "one-code"}
    )
    assert (
        r.status_code == 200
        and "postMessage" in r.text
        and '"outcome": "connected"' in r.text
    )
    assert "secret-token" not in r.text and "one-code" not in r.text
    assert "content-security-policy" in r.headers
    assert client.get("/api/integrations").json()["github"]["account"] == "paulo"
    assert (
        client.get(
            "/api/integrations/github/callback",
            params={"state": state, "code": "one-code"},
        ).status_code
        == 400
    )


def test_config_rotation_confirmation_cancels_flows(client, env, monkeypatch):
    admin(env)
    monkeypatch.setattr(settings, "github_client_id", "old")
    monkeypatch.setattr(settings, "github_client_secret", "old-secret")
    client.post("/api/integrations/github/start?popup=true")
    _, factory = env
    with factory() as db:
        db.add(
            IntegrationConnection(
                owner_id="user-a",
                provider="github",
                account="test",
                credentials=integrations.pack({"access_token": "old"}),
            )
        )
        db.commit()
    body = {
        "client_id": "new",
        "client_secret": "new-secret",
        "password": "strong-password-a",
    }
    assert (
        client.put("/api/integrations/admin/applications/github", json=body).status_code
        == 409
    )
    assert (
        client.put(
            "/api/integrations/admin/applications/github",
            json={**body, "disconnect_accounts": True},
        ).status_code
        == 200
    )
    with factory() as db:
        assert not db.scalar(select(IntegrationConnection)) and not db.scalar(
            select(IntegrationFlow)
        )
    assert parse_qs(
        urlparse(client.post("/api/integrations/github/start").json()["url"]).query
    )["client_id"] == ["new"]


def test_failed_popup_is_consumed(client, monkeypatch):
    monkeypatch.setattr(settings, "github_client_id", "id")
    monkeypatch.setattr(settings, "github_client_secret", "secret")
    r = client.post("/api/integrations/github/start?popup=true")
    state = parse_qs(urlparse(r.json()["url"]).query)["state"][0]

    def fail(*args, **kwargs):
        raise integrations.providers.ProviderError("Service unavailable")

    monkeypatch.setattr(integrations, "remote", fail)
    r = client.get(
        "/api/integrations/github/callback", params={"state": state, "code": "code"}
    )
    assert r.status_code == 200 and '"outcome": "failed"' in r.text
    assert not client.get("/api/integrations").json()["github"]["connected"]
    assert (
        client.get(
            "/api/integrations/github/callback", params={"state": state, "code": "code"}
        ).status_code
        == 400
    )
