import io
from datetime import datetime, date, timedelta, timezone
from urllib.parse import parse_qs, urlparse
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select, text
from alembic import command
from alembic.config import Config
from app.main import app
from app.core.config import settings
from app.models import IntegrationConnection, User, Task, SessionToken, now
from app.modules import integrations
from app.modules.recurrence import next_due
from tests.conftest import login_b


def test_profile_preferences_avatar_isolation(client):
    result = client.put(
        "/api/account/profile",
        json={
            "name": "Paulo novo",
            "occupation": "TI",
            "bio": "Meu perfil privado",
            "interests": "Python, economia",
        },
    )
    assert result.status_code == 200 and result.json()["name"] == "Paulo novo"
    assert "password_hash" not in result.json()
    prefs = result.json()["preferences"] | {
        "homepage": "daily",
        "timezone": "UTC",
        "font_size": "large",
        "reduce_motion": True,
        "daily_capacity": 360,
    }
    assert (
        client.put("/api/account/preferences", json=prefs).json()["preferences"][
            "homepage"
        ]
        == "daily"
    )
    assert (
        client.put(
            "/api/account/preferences", json=prefs | {"timezone": "invalid/zone"}
        ).status_code
        == 422
    )
    buffer = io.BytesIO()
    Image.new("RGB", (32, 32), "blue").save(buffer, format="PNG")
    assert client.post(
        "/api/account/avatar",
        files={"file": ("photo.png", buffer.getvalue(), "image/png")},
    ).json()["has_avatar"]
    photo = client.get("/api/account/avatar")
    assert photo.headers["content-type"] == "image/jpeg" and photo.status_code == 200
    assert (
        client.post(
            "/api/account/avatar",
            files={"file": ("unsafe.svg", b"<svg/>", "image/svg+xml")},
        ).status_code
        == 422
    )
    login_b(client)
    other = client.get("/api/account").json()
    assert (
        other["name"] == "Outro usuário"
        and not other["has_avatar"]
        and other["bio"] == ""
    )
    assert other["preferences"]["homepage"] == "dashboard"
    assert client.get("/api/account/avatar").status_code == 404


def test_password_rotates_session_and_revoke_others(client):
    other = TestClient(app, headers={"origin": "http://localhost:5173"})
    login = other.post(
        "/api/auth/login",
        json={"email": "a@example.com", "password": "strong-password-a"},
    )
    assert "SameSite=lax" in login.headers["set-cookie"]
    assert len(client.get("/api/account/sessions").json()) == 2
    assert client.post("/api/account/sessions/revoke-others").status_code == 204
    assert other.get("/api/auth/me").status_code == 401
    other.post(
        "/api/auth/login",
        json={"email": "a@example.com", "password": "strong-password-a"},
    )
    assert (
        client.post(
            "/api/account/password",
            json={"current_password": "wrong", "new_password": "new-strong-password"},
        ).status_code
        == 400
    )
    changed = client.post(
        "/api/account/password",
        json={
            "current_password": "strong-password-a",
            "new_password": "new-strong-password",
        },
    )
    assert (
        changed.status_code == 204 and "SameSite=lax" in changed.headers["set-cookie"]
    )
    assert (
        client.get("/api/auth/me").status_code == 200
        and other.get("/api/auth/me").status_code == 401
    )
    assert len(client.get("/api/account/sessions").json()) == 1
    assert (
        other.post(
            "/api/auth/login",
            json={"email": "a@example.com", "password": "strong-password-a"},
        ).status_code
        == 401
    )
    assert (
        other.post(
            "/api/auth/login",
            json={"email": "a@example.com", "password": "new-strong-password"},
        ).status_code
        == 200
    )


def test_recurring_tasks_filters_and_goal_progress(client):
    goal = client.post(
        "/api/planning/goals",
        json={
            "title": "Entregas",
            "metric": "tasks",
            "target": 2,
            "context": "professional",
        },
    ).json()
    day = date.today().isoformat()
    task = client.post(
        "/api/tasks",
        json={
            "title": "Revisar sprint",
            "due_date": day,
            "context": "professional",
            "recurrence": "weekly",
            "tags": [" Trabalho ", "estágio"],
            "goal_id": goal["id"],
            "priority": "high",
        },
    ).json()

    def payload(status):
        return {
            k: task[k]
            for k in (
                "title",
                "description",
                "context",
                "priority",
                "project_id",
                "due_date",
                "recurrence",
                "tags",
                "goal_id",
            )
        } | {"status": status}

    assert (
        client.get("/api/tasks?context=professional&priority=high&tag=estágio").json()[
            "total"
        ]
        == 1
    )
    assert client.get("/api/tasks?context=personal").json()["total"] == 0
    assert (
        client.put("/api/tasks/" + task["id"], json=payload("completed")).status_code
        == 200
    )
    tasks = client.get("/api/tasks").json()["items"]
    assert len(tasks) == 2
    child = next(t for t in tasks if t["id"] != task["id"])
    assert (
        child["goal_id"] == goal["id"]
        and child["tags"] == ["trabalho", "estágio"]
        and child["status"] == "pending"
    )
    assert child["due_date"] > day and child["recurrence_parent_id"] == task["id"]
    assert client.get("/api/planning/goals").json()[0]["progress"] == 1
    client.put("/api/tasks/" + task["id"], json=payload("pending"))
    client.put("/api/tasks/" + task["id"], json=payload("completed"))
    assert client.get("/api/tasks").json()["total"] == 2
    assert (
        client.post(
            "/api/tasks", json={"title": "Sem prazo", "recurrence": "daily"}
        ).status_code
        == 422
    )
    login_b(client)
    assert client.get("/api/planning/goals").json() == []
    assert (
        client.post(
            "/api/tasks", json={"title": "Indevida", "goal_id": goal["id"]}
        ).status_code
        == 404
    )


def test_monthly_recurrence_anchor_and_missed_dates():
    feb = next_due(date(2026, 1, 31), "monthly", date(2026, 1, 31), 31)
    assert feb == date(2026, 2, 28)
    assert next_due(feb, "monthly", feb, 31) == date(2026, 3, 31)
    assert next_due(date(2026, 1, 1), "daily", date(2026, 10, 25)) == date(2026, 10, 26)


def test_minutes_manual_goals_and_invalid_links(client):
    goal = client.post(
        "/api/planning/goals",
        json={"title": "Estudar", "metric": "minutes", "target": 120},
    ).json()
    entry = client.post(
        "/api/intelligence/entries/personal",
        json={
            "label": "Python",
            "minutes": 60,
            "entry_date": date.today().isoformat(),
            "goal_id": goal["id"],
        },
    )
    assert entry.status_code == 201
    assert client.get("/api/planning/goals").json()[0]["percentage"] == 50
    assert (
        client.post(
            "/api/tasks", json={"title": "Não vale", "goal_id": goal["id"]}
        ).status_code
        == 422
    )
    assert (
        client.delete(
            "/api/intelligence/entries/personal/" + entry.json()["id"]
        ).status_code
        == 204
    )
    assert client.get("/api/planning/goals").json()[0]["progress"] == 0
    manual = client.post(
        "/api/planning/goals",
        json={"title": "Capítulos", "metric": "manual", "target": 10},
    ).json()
    assert (
        client.put(
            f"/api/planning/goals/{manual['id']}/progress", json={"value": 7}
        ).json()["percentage"]
        == 70
    )
    assert (
        client.put(
            f"/api/planning/goals/{goal['id']}/progress", json={"value": 7}
        ).status_code
        == 409
    )
    login_b(client)
    assert (
        client.put(
            f"/api/planning/goals/{manual['id']}/progress", json={"value": 8}
        ).status_code
        == 404
    )


def test_agenda_timezone_overlap_and_owner(client):
    prefs = client.get("/api/account").json()["preferences"] | {
        "timezone": "UTC",
        "daily_capacity": 480,
    }
    client.put("/api/account/preferences", json=prefs)
    for start, end in (("09:00", "11:00"), ("10:00", "12:00")):
        result = client.post(
            "/api/planning/appointments",
            json={
                "title": "Reunião",
                "start_at": "2026-10-25T" + start,
                "end_at": "2026-10-25T" + end,
            },
        )
        assert result.status_code == 201, result.text
    data = client.get("/api/planning/agenda?day=2026-10-25").json()
    assert (
        data["busy_minutes"] == 180
        and data["remaining_minutes"] == 300
        and len(data["events"]) == 2
    )
    identity = data["events"][0]["id"]
    assert (
        client.post(
            "/api/planning/appointments",
            json={
                "title": "Inválido",
                "start_at": "2026-10-25T12:00",
                "end_at": "2026-10-25T11:00",
            },
        ).status_code
        == 422
    )
    login_b(client)
    assert client.get("/api/planning/agenda?day=2026-10-25").json()["events"] == []
    assert client.delete("/api/planning/appointments/" + identity).status_code == 404


def test_deadline_alert_dedup_actions_and_preferences(client):
    task = client.post(
        "/api/tasks",
        json={"title": "Prazo de hoje", "due_date": date.today().isoformat()},
    ).json()
    notices = client.get("/api/notifications").json()["items"]
    matches = [
        n
        for n in notices
        if n.get("target", {}) and n["target"].get("id") == task["id"]
    ]
    assert len(matches) == 1
    assert len(client.get("/api/notifications").json()["items"]) == len(notices)
    assert client.get("/api/tasks/" + task["id"]).status_code == 200
    prefs = client.get("/api/account").json()["preferences"] | {
        "notify_success": False,
        "deadline_alerts": False,
    }
    client.put("/api/account/preferences", json=prefs)
    assert (
        client.post("/api/notifications", json={"title": "Silencioso"}).status_code
        == 204
    )
    client.post(
        "/api/tasks",
        json={"title": "Não alertar", "due_date": date.today().isoformat()},
    )
    assert len(client.get("/api/notifications").json()["items"]) == len(notices)


def test_google_oauth_calendar_and_status(client, env, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "test-google")
    monkeypatch.setattr(settings, "google_client_secret", "disposable-secret")
    start = client.post("/api/integrations/google/start")
    params = parse_qs(urlparse(start.json()["url"]).query)
    assert (
        params["access_type"] == ["offline"]
        and "calendar.readonly" in params["scope"][0]
    )

    def remote(method, url, **kwargs):
        if method == "POST":
            return {
                "access_token": "google-access",
                "refresh_token": "google-refresh",
                "expires_in": 3600,
            }
        if "userinfo" in url:
            return {"email": "calendar@example.test"}
        if "calendarList" in url:
            return {"items": [{"id": "primary", "summary": "Meu calendário"}]}
        return {
            "items": [
                {
                    "id": "event-1",
                    "summary": "Reunião Google",
                    "start": {"dateTime": "2026-10-25T09:00:00Z"},
                    "end": {"dateTime": "2026-10-25T10:00:00Z"},
                },
                {
                    "id": "all-day",
                    "summary": "Dia inteiro",
                    "start": {"date": "2026-10-25"},
                    "end": {"date": "2026-10-26"},
                },
            ]
        }

    monkeypatch.setattr(integrations, "remote", remote)
    result = client.get(
        "/api/integrations/google/callback",
        params={"state": params["state"][0], "code": "code"},
        follow_redirects=False,
    )
    assert result.status_code == 303 and result.headers["location"].endswith(
        "connected"
    )
    assert (
        client.get("/api/planning/calendars").json()["items"][0]["name"]
        == "Meu calendário"
    )
    data = client.get("/api/planning/agenda?day=2026-10-25&include_google=true").json()
    assert len(data["events"]) == 2 and data["busy_minutes"] == 60
    status = client.get("/api/integrations").json()["google"]
    assert (
        status["checked_at"]
        and status["account"] == "calendar@example.test"
        and "access_token" not in str(status)
    )


def test_migration_preserves_populated_session_and_task(env):
    _, factory = env
    cfg = Config("alembic.ini")
    command.downgrade(cfg, "11872a7ab4ba")
    with factory() as db:
        db.execute(
            text(
                "INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ('legacy','user-a','2030-01-01')"
            )
        )
        db.execute(
            text(
                "INSERT INTO tasks (id,owner_id,created_at,title,description,priority,status,context) VALUES ('legacy-task','user-a','2026-10-25','Antiga','','medium','pending','general')"
            )
        )
        db.commit()
    command.upgrade(cfg, "head")
    with factory() as db:
        assert (
            db.get(SessionToken, "legacy").created_at
            and db.get(SessionToken, "legacy").device == ""
        )
        task = db.get(Task, "legacy-task")
        assert task.tags == [] and task.recurrence == "none" and task.title == "Antiga"
