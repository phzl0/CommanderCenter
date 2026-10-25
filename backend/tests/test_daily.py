from datetime import timedelta
from urllib.parse import parse_qs, urlparse
from app.modules import daily
from app.core.config import settings
from tests.conftest import login_b


def test_capture_conversion_is_idempotent_and_preserves_context(client):
    capture = client.post(
        "/api/day/captures",
        json={
            "text": "Preparar apresentação",
            "kind": "task",
            "context": "professional",
        },
    )
    assert capture.status_code == 201
    identity = capture.json()["id"]
    first = client.post(
        f"/api/day/captures/{identity}/task",
        json={"due_date": daily.today().isoformat()},
    )
    assert first.status_code == 200 and first.json()["context"] == "professional"
    second = client.post(f"/api/day/captures/{identity}/task", json={})
    assert second.json()["id"] == first.json()["id"]
    assert client.get("/api/tasks").json()["total"] == 1
    data = client.get("/api/day").json()
    assert not data["captures"] and data["archive"][0]["task_id"] == first.json()["id"]
    assert data["counts"]["due_today"] == 1
    task = first.json()
    payload = {
        k: task[k]
        for k in (
            "title",
            "description",
            "priority",
            "status",
            "project_id",
            "due_date",
            "context",
        )
    }
    payload["status"] = "completed"
    assert client.put("/api/tasks/" + task["id"], json=payload).status_code == 200
    assert client.get("/api/day").json()["week"]["completed"] == 1
    assert client.get("/api/tasks").json()["items"][0]["context"] == "professional"


def test_priority_limit_closed_snapshot_and_reopen(client):
    day = daily.today().isoformat()
    tasks = [
        client.post("/api/tasks", json={"title": f"Tarefa {i}"}).json()
        for i in range(4)
    ]
    ids = [t["id"] for t in tasks]
    assert (
        client.put("/api/day", json={"day": day, "priority_ids": ids}).status_code
        == 422
    )
    assert (
        client.put(
            "/api/day", json={"day": day, "priority_ids": [ids[0], ids[0]]}
        ).status_code
        == 422
    )
    assert (
        client.put(
            "/api/day",
            json={"day": day, "priority_ids": ids[:3], "notes": "Rever amanhã"},
        ).status_code
        == 200
    )
    assert client.post("/api/day/close", json={"day": day}).status_code == 200
    data = client.get("/api/day").json()
    assert data["summary"]["planned"] == 3 and data["summary"]["completed"] == 0
    assert data["notes"] == "Rever amanhã"
    assert (
        client.put("/api/day", json={"day": day, "priority_ids": []}).status_code == 409
    )
    assert (
        client.put(
            "/api/tasks/" + ids[0],
            json={"title": "Nome atualizado", "status": "completed"},
        ).status_code
        == 200
    )
    snapshot = client.get("/api/day").json()["summary"]
    assert (
        snapshot["completed"] == 0 and snapshot["priorities"][0]["title"] == "Tarefa 0"
    )
    assert client.post("/api/day/reopen", json={"day": day}).status_code == 200
    assert (
        client.put(
            "/api/day", json={"day": day, "priority_ids": ids[:2], "notes": "Revisado"}
        ).status_code
        == 200
    )
    assert client.post("/api/day/close", json={"day": day}).status_code == 200
    assert client.get("/api/day").json()["summary"]["completed"] == 1
    future = (daily.today() + timedelta(days=1)).isoformat()
    assert client.post("/api/day/close", json={"day": future}).status_code == 422
    assert client.get("/api/day?day=9999-01-01").status_code == 422


def test_daily_owner_and_archive(client):
    day = daily.today().isoformat()
    task = client.post("/api/tasks", json={"title": "Privada"}).json()
    capture = client.post("/api/day/captures", json={"text": "Anotação privada"}).json()
    client.put(
        "/api/day",
        json={"day": day, "priority_ids": [task["id"]], "notes": "Meu fechamento"},
    )
    assert (
        client.patch(
            "/api/day/captures/" + capture["id"], json={"processed": True}
        ).status_code
        == 200
    )
    assert client.get("/api/day").json()["archive"][0]["text"] == "Anotação privada"
    assert (
        client.patch(
            "/api/day/captures/" + capture["id"], json={"processed": False}
        ).status_code
        == 200
    )
    assert client.get("/api/day").json()["captures"][0]["id"] == capture["id"]
    login_b(client)
    data = client.get("/api/day").json()
    assert (
        data["priorities"] == []
        and data["notes"] == ""
        and data["captures"] == []
        and data["tasks"] == []
    )
    assert (
        client.put(
            "/api/day", json={"day": day, "priority_ids": [task["id"]]}
        ).status_code
        == 404
    )
    assert (
        client.patch(
            "/api/day/captures/" + capture["id"], json={"processed": True}
        ).status_code
        == 404
    )
    assert (
        client.post("/api/day/captures/" + capture["id"] + "/task", json={}).status_code
        == 404
    )


def test_oauth_callback_diagnostic_and_origin_guard(client, monkeypatch):
    monkeypatch.setattr(settings, "github_client_id", "test-client")
    monkeypatch.setattr(settings, "github_client_secret", "disposable-secret")
    expected = "http://localhost:5173/api/integrations/github/callback"
    assert client.get("/api/integrations").json()["github"]["callback_url"] == expected
    started = client.post("/api/integrations/github/start").json()
    assert parse_qs(urlparse(started["url"]).query)["redirect_uri"] == [expected]
    wrong = client.post(
        "/api/integrations/github/start", headers={"origin": "http://127.0.0.1:5173"}
    )
    assert wrong.status_code == 409 and "localhost:5173" in wrong.json()["detail"]
    monkeypatch.setattr(settings, "integration_origin", "http://127.0.0.1:5173/")
    result = client.post(
        "/api/integrations/github/start", headers={"origin": "http://127.0.0.1:5173"}
    ).json()
    assert parse_qs(urlparse(result["url"]).query)["redirect_uri"] == [
        "http://127.0.0.1:5173/api/integrations/github/callback"
    ]
