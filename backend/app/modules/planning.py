from datetime import date, datetime, time, timedelta, timezone
from typing import Literal
from urllib.parse import urlencode, quote
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.security import current_user
from app.core.preferences import preferences, user_zone
from app.models import User, Goal, Task, PersonalEntry, Appointment
from app.modules.management import StrictModel, dump, owned
from app.modules import integrations, providers

router = APIRouter(prefix="/api/planning", tags=["Metas e agenda"])


class GoalInput(StrictModel):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=2000)
    context: Literal["personal", "professional", "general"] = "personal"
    metric: Literal["tasks", "minutes", "manual"] = "tasks"
    target: int = Field(ge=1, le=1000000000)
    due_date: date | None = None
    status: Literal["active", "paused", "archived"] = "active"


class ProgressInput(StrictModel):
    value: int = Field(ge=0, le=1000000000)


class AppointmentInput(StrictModel):
    title: str = Field(min_length=1, max_length=160)
    notes: str = Field(default="", max_length=3000)
    start_at: datetime
    end_at: datetime
    context: Literal["personal", "professional", "general"] = "personal"
    kind: Literal["appointment", "todo", "notice"] = "appointment"
    completed: bool = False
    reminder_minutes: int | None = Field(default=None, ge=0, le=10080)
    notify_system: bool = True
    notify_email: bool = False


def goal_view(db, row):
    if row.metric == "tasks":
        value = db.scalar(
            select(func.count())
            .select_from(Task)
            .where(
                Task.owner_id == row.owner_id,
                Task.goal_id == row.id,
                Task.status == "completed",
            )
        )
    elif row.metric == "minutes":
        value = db.scalar(
            select(func.coalesce(func.sum(PersonalEntry.minutes), 0)).where(
                PersonalEntry.owner_id == row.owner_id,
                PersonalEntry.goal_id == row.id,
                PersonalEntry.deleted_at.is_(None),
            )
        )
    else:
        value = row.manual_value
    return {
        **dump(row),
        "progress": value,
        "percentage": min(100, round(value / row.target * 100)),
        "reached": value >= row.target,
    }


@router.get("/goals")
def goals(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return [
        goal_view(db, r)
        for r in db.scalars(
            select(Goal)
            .where(Goal.owner_id == user.id)
            .order_by(Goal.created_at.desc(), Goal.id)
            .limit(100)
        )
    ]


@router.post("/goals", status_code=201)
def create_goal(
    data: GoalInput, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    if (
        db.scalar(
            select(func.count()).select_from(Goal).where(Goal.owner_id == user.id)
        )
        >= 100
    ):
        raise HTTPException(422, "Limite de 100 metas por conta.")
    row = Goal(owner_id=user.id, **data.model_dump())
    db.add(row)
    db.commit()
    return goal_view(db, row)


@router.put("/goals/{identity}")
def update_goal(
    identity: str,
    data: GoalInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    row = owned(db, Goal, identity, user)
    if row.metric != data.metric:
        tasks = db.scalar(
            select(func.count())
            .select_from(Task)
            .where(Task.owner_id == user.id, Task.goal_id == identity)
        )
        entries = db.scalar(
            select(func.count())
            .select_from(PersonalEntry)
            .where(PersonalEntry.owner_id == user.id, PersonalEntry.goal_id == identity)
        )
        if tasks or entries:
            raise HTTPException(
                409,
                "Desvincule os registros antes de mudar a forma de cálculo da meta.",
            )
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    db.commit()
    return goal_view(db, row)


@router.put("/goals/{identity}/progress")
def progress(
    identity: str,
    data: ProgressInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    row = owned(db, Goal, identity, user)
    if row.metric != "manual":
        raise HTTPException(
            409, "Esta meta é calculada a partir dos registros vinculados."
        )
    row.manual_value = data.value
    db.commit()
    return goal_view(db, row)


def utc_value(value, zone):
    if value.tzinfo is None:
        aware = value.replace(tzinfo=zone)
        if (
            aware.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None)
            != value
        ):
            raise HTTPException(
                422, "Horário inexistente neste fuso. Escolha outro horário."
            )
        value = aware
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def appointment_values(data, zone):
    start = utc_value(data.start_at, zone)
    end = utc_value(data.end_at, zone)
    if not start < end or end - start > timedelta(days=7):
        raise HTTPException(
            422, "O fim deve ser posterior ao início, com duração de até sete dias."
        )
    from app.modules.reminders import email_configured

    if (
        data.reminder_minutes is not None
        and data.notify_email
        and not email_configured()
    ):
        raise HTTPException(
            422,
            "Configure o envio de e-mail em Fontes e conexões antes de ativar este canal.",
        )
    return {
        **data.model_dump(),
        "start_at": start,
        "end_at": end,
        "reminder_at": start - timedelta(minutes=data.reminder_minutes)
        if data.reminder_minutes is not None
        else None,
    }


def event_view(row):
    return {
        **dump(row),
        "start_at": row.start_at.isoformat() + "Z",
        "end_at": row.end_at.isoformat() + "Z",
        "source": "local",
    }


@router.post("/appointments", status_code=201)
def create_appointment(
    data: AppointmentInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    if (
        db.scalar(
            select(func.count())
            .select_from(Appointment)
            .where(Appointment.owner_id == user.id)
        )
        >= 5000
    ):
        raise HTTPException(422, "Limite de cinco mil compromissos locais por conta.")
    row = Appointment(owner_id=user.id, **appointment_values(data, user_zone(db, user)))
    db.add(row)
    db.commit()
    return event_view(row)


@router.put("/appointments/{identity}")
def update_appointment(
    identity: str,
    data: AppointmentInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    row = owned(db, Appointment, identity, user)
    values = appointment_values(data, user_zone(db, user))
    changed = any(
        getattr(row, key) != values[key]
        for key in ("start_at", "reminder_minutes", "notify_system", "notify_email")
    )
    for key, value in values.items():
        setattr(row, key, value)
    if changed:
        row.system_sent_at = row.email_sent_at = row.email_attempt_at = (
            row.email_error
        ) = None
    db.commit()
    return event_view(row)


@router.delete("/appointments/{identity}", status_code=204)
def delete_appointment(
    identity: str, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    row = owned(db, Appointment, identity, user)
    db.delete(row)
    db.commit()


@router.get("/calendars")
def calendars(db: Session = Depends(get_db), user: User = Depends(current_user)):
    try:
        data = integrations.provider_read(
            db,
            user,
            "google",
            "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=100",
        )
        return {
            "items": [
                {"id": r["id"], "name": r.get("summary", "Calendário")}
                for r in data.get("items", [])
            ],
            "limited": bool(data.get("nextPageToken")),
        }
    except providers.ProviderError as e:
        raise HTTPException(422, str(e))


@router.get("/agenda")
def agenda(
    day: date | None = None,
    calendar_id: str = Query("primary", max_length=250),
    include_google: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    zone = user_zone(db, user)
    day = day or datetime.now(zone).date()
    if not 2000 <= day.year <= 2100:
        raise HTTPException(422, "Escolha uma data entre 2000 e 2100.")
    start = (
        datetime.combine(day, time.min, zone)
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )
    end = (
        datetime.combine(day + timedelta(days=1), time.min, zone)
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )
    rows = list(
        db.scalars(
            select(Appointment)
            .where(
                Appointment.owner_id == user.id,
                Appointment.start_at < end,
                Appointment.end_at > start,
            )
            .order_by(Appointment.start_at)
            .limit(300)
        )
    )
    events = [event_view(r) for r in rows]
    errors = []
    limited = False
    if include_google:
        try:
            url = (
                "https://www.googleapis.com/calendar/v3/calendars/"
                + quote(calendar_id, safe="")
                + "/events?"
                + urlencode(
                    {
                        "timeMin": start.isoformat() + "Z",
                        "timeMax": end.isoformat() + "Z",
                        "singleEvents": "true",
                        "orderBy": "startTime",
                        "maxResults": 250,
                    }
                )
            )
            data = integrations.provider_read(db, user, "google", url)
            limited = bool(data.get("nextPageToken"))
            for r in data.get("items", []):
                if r.get("status") == "cancelled":
                    continue
                a = r.get("start", {})
                b = r.get("end", {})
                all_day = "dateTime" not in a
                events.append(
                    {
                        "id": r["id"],
                        "title": r.get("summary") or "Sem título",
                        "start_at": a.get("dateTime") or a.get("date"),
                        "end_at": b.get("dateTime") or b.get("date"),
                        "all_day": all_day,
                        "source": "google",
                        "link": providers.safe_link(r.get("htmlLink", "")),
                        "busy": r.get("transparency") != "transparent",
                    }
                )
        except providers.ProviderError as e:
            errors.append(str(e))
    intervals = []
    for event in events:
        if event.get("all_day") or event.get("busy") is False:
            continue
        a = (
            datetime.fromisoformat(event["start_at"].replace("Z", "+00:00"))
            .astimezone(timezone.utc)
            .replace(tzinfo=None)
        )
        b = (
            datetime.fromisoformat(event["end_at"].replace("Z", "+00:00"))
            .astimezone(timezone.utc)
            .replace(tzinfo=None)
        )
        if a < end and b > start:
            intervals.append((max(a, start), min(b, end)))
    intervals.sort()
    merged = []
    for a, b in intervals:
        if merged and a <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], b))
        else:
            merged.append((a, b))
    occupied = int(sum((b - a).total_seconds() / 60 for a, b in merged))
    capacity = preferences(db, user)["daily_capacity"]
    tasks = [
        dump(t)
        for t in db.scalars(
            select(Task)
            .where(
                Task.owner_id == user.id,
                Task.status != "completed",
                Task.due_date == day,
            )
            .order_by(Task.created_at)
            .limit(100)
        )
    ]
    return {
        "day": day,
        "timezone": str(zone),
        "events": events,
        "tasks": tasks,
        "busy_minutes": occupied,
        "capacity_minutes": capacity,
        "remaining_minutes": max(0, capacity - occupied),
        "limited": limited,
        "errors": errors,
        "note": "Capacidade é uma referência do dia. Sobreposições não contam duas vezes; eventos de dia inteiro não bloqueiam minutos. Tarefas ainda não têm estimativa de duração.",
    }


@router.get("/month")
def month(
    year: int = Query(ge=2000, le=2100),
    month: int = Query(ge=1, le=12),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    import calendar

    zone = user_zone(db, user)
    first = date(year, month, 1)
    last = date(year, month, calendar.monthrange(year, month)[1])
    start = utc_value(datetime.combine(first, time.min), zone)
    end = utc_value(datetime.combine(last + timedelta(days=1), time.min), zone)
    rows = list(
        db.scalars(
            select(Appointment)
            .where(
                Appointment.owner_id == user.id,
                Appointment.start_at < end,
                Appointment.end_at > start,
            )
            .order_by(Appointment.start_at)
        )
    )
    counts = {}
    for row in rows:
        a = max(
            first, row.start_at.replace(tzinfo=timezone.utc).astimezone(zone).date()
        )
        b = min(
            last,
            (row.end_at - timedelta(microseconds=1))
            .replace(tzinfo=timezone.utc)
            .astimezone(zone)
            .date(),
        )
        while a <= b:
            counts[a.isoformat()] = counts.get(a.isoformat(), 0) + 1
            a += timedelta(days=1)
    for task in db.scalars(
        select(Task).where(
            Task.owner_id == user.id,
            Task.status != "completed",
            Task.due_date >= first,
            Task.due_date <= last,
        )
    ):
        key = task.due_date.isoformat()
        counts[key] = counts.get(key, 0) + 1
    return {"days": counts, "scope": "local"}


@router.get("/reminders/status")
def reminder_status(user: User = Depends(current_user)):
    from app.modules.reminders import email_configured

    return {"email_configured": email_configured(), "interval_seconds": 30}
