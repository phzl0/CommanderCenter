from datetime import timedelta
from io import BytesIO
from sqlalchemy import select
from reportlab.pdfgen.canvas import Canvas
from app.core.config import settings
from app.models import Appointment, Notification, now
from app.modules import reminders, providers
from tests.conftest import login_b


def test_calendar_month_items_owner(client):
    body = {
        "title": "Revisar orçamento",
        "start_at": "2026-11-03T09:00",
        "end_at": "2026-11-03T09:15",
        "kind": "todo",
        "reminder_minutes": 15,
    }
    r = client.post("/api/planning/appointments", json=body)
    assert r.status_code == 201, r.text
    identity = r.json()["id"]
    assert client.get("/api/planning/month?year=2026&month=11").json()["days"] == {
        "2026-11-03": 1
    }
    assert (
        client.get("/api/planning/agenda?day=2026-11-03").json()["events"][0]["kind"]
        == "todo"
    )
    assert client.put(
        "/api/planning/appointments/" + identity, json={**body, "completed": True}
    ).json()["completed"]
    login_b(client)
    assert client.get("/api/planning/month?year=2026&month=11").json()["days"] == {}
    assert client.delete("/api/planning/appointments/" + identity).status_code == 404


def test_background_reminders_retry_dedup_and_owner(client, env, monkeypatch):
    _, factory = env
    monkeypatch.setattr(settings, "smtp_host", "smtp.test.invalid")
    monkeypatch.setattr(settings, "smtp_from", "command@example.test")
    sent = []

    def fail(*args):
        raise RuntimeError("secret-must-not-leak")

    monkeypatch.setattr(reminders, "send_email", fail)
    with factory() as db:
        row = Appointment(
            owner_id="user-a",
            title="Aviso",
            start_at=now() + timedelta(minutes=5),
            end_at=now() + timedelta(minutes=30),
            kind="notice",
            reminder_at=now() - timedelta(seconds=1),
            reminder_minutes=15,
            notify_system=True,
            notify_email=True,
        )
        db.add(row)
        db.commit()
        identity = row.id
    reminders.process_due(factory)
    reminders.process_due(factory)
    with factory() as db:
        row = db.get(Appointment, identity)
        assert (
            row.system_sent_at
            and not row.email_sent_at
            and "secret" not in row.email_error
        )
        notices = list(
            db.scalars(
                select(Notification).where(Notification.title == "Lembrete da agenda")
            )
        )
        assert (
            len(notices) == 1
            and notices[0].target["kind"] == "agenda"
            and notices[0].owner_id == "user-a"
        )
        row.email_attempt_at = now() - timedelta(minutes=6)
        db.commit()
    monkeypatch.setattr(
        reminders,
        "send_email",
        lambda user, row, zone: sent.append((user.email, row.title)),
    )
    reminders.process_due(factory)
    reminders.process_due(factory)
    assert sent == [("a@example.com", "Aviso")]
    with factory() as db:
        assert db.get(Appointment, identity).email_sent_at


def test_email_config_required_and_completed_expired_skipped(client, env, monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", "")
    r = client.post(
        "/api/planning/appointments",
        json={
            "title": "Email",
            "start_at": "2026-11-04T09:00",
            "end_at": "2026-11-04T10:00",
            "reminder_minutes": 15,
            "notify_email": True,
        },
    )
    assert r.status_code == 422
    _, factory = env
    with factory() as db:
        for completed, end in [
            (True, now() + timedelta(hours=1)),
            (False, now() - timedelta(hours=1)),
        ]:
            db.add(
                Appointment(
                    owner_id="user-a",
                    title="Sem alerta",
                    start_at=now() - timedelta(hours=2),
                    end_at=end,
                    completed=completed,
                    reminder_at=now() - timedelta(hours=3),
                    notify_system=True,
                )
            )
        db.commit()
    reminders.process_due(factory)
    with factory() as db:
        assert not db.scalar(
            select(Notification).where(Notification.title == "Lembrete da agenda")
        )


def test_pdf_analysis_export_private(client):
    out = BytesIO()
    c = Canvas(out)
    c.drawString(40, 750, "Receita mensal: R$ 1200")
    c.showPage()
    c.save()
    r = client.post(
        "/api/imports",
        files={"file": ("resumo.pdf", out.getvalue(), "application/pdf")},
    )
    assert r.status_code == 201, r.text
    identity = r.json()["id"]
    assert (
        "Receita mensal"
        in client.get(f"/api/imports/{identity}/preview").json()["rows"][0]["Texto"]
    )
    a = client.post(
        "/api/analyses",
        json={"import_id": identity, "name": "Resumo PDF", "config": {}},
    )
    assert a.status_code == 201, a.text
    r = client.post(
        "/api/reports",
        json={
            "title": "Texto do PDF",
            "dataset": "analysis",
            "analysis_id": a.json()["id"],
            "format": "pdf",
        },
    )
    assert r.status_code == 201, r.text
    assert (
        client.post("/api/imports", files={"file": ("bad.pdf", b"not pdf")}).status_code
        == 422
    )
    login_b(client)
    assert client.get(f"/api/imports/{identity}/download").status_code == 404


def test_weather_hourly_city(monkeypatch):
    urls = []

    def fake(url):
        urls.append(url)
        if "/search?" in url:
            return {
                "results": [
                    {
                        "name": "Campinas",
                        "admin1": "São Paulo",
                        "country": "Brasil",
                        "latitude": -22.9,
                        "longitude": -47.1,
                    }
                ]
            }
        return {
            "current": {
                "temperature_2m": 25,
                "relative_humidity_2m": 60,
                "time": "2026-11-01T09:15",
            },
            "hourly": {
                "time": ["2026-11-01T09:00", "2026-11-01T10:00"],
                "temperature_2m": [25, 26],
                "precipitation_probability": [10, 20],
                "weather_code": [1, 2],
            },
            "daily": {},
            "timezone": "America/Sao_Paulo",
        }

    monkeypatch.setattr(providers, "get_json", fake)
    assert (
        providers.city_search("Campinas, SP")[0]["label"]
        == "Campinas, São Paulo, Brasil"
    )
    assert "name=Campinas&" in urls[0]
    data = providers.weather_data(-22.9, -47.1, "Campinas")
    assert data["weather"]["humidity"] == 60 and len(data["weather"]["hours"]) == 1


def test_five_cards_reject_activation_and_restore(client):
    ws = client.post("/api/intelligence/bootstrap").json()
    assert len([w for w in ws["widgets"] if w["visible"] and w["kind"] != "news"]) == 5
    assert (
        client.post(
            "/api/intelligence/widgets", json={"title": "Sexto", "kind": "github"}
        ).status_code
        == 422
    )
    hidden = client.post(
        "/api/intelligence/widgets",
        json={"title": "Configuração guardada", "kind": "github", "visible": False},
    ).json()
    payload = {k: hidden[k] for k in ["title", "kind", "visible", "wide", "config"]}
    assert (
        client.put(
            "/api/intelligence/widgets/" + hidden["id"],
            json={**payload, "visible": True},
        ).status_code
        == 422
    )
    removed = ws["widgets"][0]
    client.delete("/api/intelligence/widgets/" + removed["id"])
    assert (
        client.put(
            "/api/intelligence/widgets/" + hidden["id"],
            json={**payload, "visible": True},
        ).status_code
        == 200
    )
    assert (
        client.post("/api/notifications/restore/widget/" + removed["id"]).status_code
        == 409
    )


def test_news_page_uses_private_sources_and_filters(client, monkeypatch):
    from app.modules import newsroom

    calls = []

    def fake(db, user, config, start, end, refresh=False):
        calls.append((user.id, config.news_category, refresh))
        return {"items": [], "source_errors": []}

    monkeypatch.setattr(newsroom, "aggregate", fake)
    assert (
        client.get("/api/intelligence/news?category=Futebol&refresh=true").status_code
        == 200
    )
    assert calls == [("user-a", "Futebol", True)]
    login_b(client)
    client.get("/api/intelligence/news")
    assert calls[-1][0] == "user-b"
