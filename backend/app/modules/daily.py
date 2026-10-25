"""Daily planning and quick capture, independently owned and usable without integrations."""

from datetime import date, datetime, time, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.security import current_user
from app.core.preferences import user_zone
from app.models import User, Task, PersonalEntry, DailyPlan, InboxCapture, now
from app.modules.management import StrictModel, dump, owned

router = APIRouter(prefix="/api/day", tags=["Meu dia"])
ZONE = ZoneInfo("America/Sao_Paulo")


def today(db=None, user=None):
    return datetime.now(user_zone(db, user) if db is not None else ZONE).date()


def chosen(day, db=None, user=None):
    value = day or today(db, user)
    if not 2000 <= value.year <= 2100:
        raise HTTPException(422, "Escolha uma data entre 2000 e 2100.")
    return value


def plan_for(db, user, day, create=False):
    if create:
        db.scalar(select(User).where(User.id == user.id).with_for_update())
    row = db.scalar(
        select(DailyPlan).where(DailyPlan.owner_id == user.id, DailyPlan.day == day)
    )
    if not row and create:
        row = DailyPlan(owner_id=user.id, day=day, priority_ids=[], notes="")
        db.add(row)
        db.flush()
    return row


def selected_tasks(db, user, ids):
    rows = {
        r.id: r
        for r in db.scalars(
            select(Task).where(Task.owner_id == user.id, Task.id.in_(ids or []))
        )
    }
    return [dump(rows[i]) for i in ids if i in rows]


class PlanInput(StrictModel):
    day: date
    priority_ids: list[str] = Field(default_factory=list, max_length=3)
    notes: str = Field(default="", max_length=3000)


class CaptureInput(StrictModel):
    text: str = Field(min_length=1, max_length=160)
    kind: Literal["note", "idea", "task"] = "note"
    context: Literal["general", "personal", "professional"] = "general"


class CaptureState(StrictModel):
    processed: bool


class ConvertInput(StrictModel):
    due_date: date | None = None


class DayInput(StrictModel):
    day: date


@router.get("")
def read(
    day: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    day = chosen(day, db, user)
    zone = user_zone(db, user)
    plan = plan_for(db, user, day)
    start = (
        datetime.combine(day - timedelta(days=6), time.min, zone)
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )
    end = (
        datetime.combine(day + timedelta(days=1), time.min, zone)
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )
    day_start = (
        datetime.combine(day, time.min, zone)
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )
    count = lambda *clauses: db.scalar(
        select(func.count()).select_from(Task).where(Task.owner_id == user.id, *clauses)
    )
    pending = list(
        db.scalars(
            select(Task)
            .where(Task.owner_id == user.id, Task.status != "completed")
            .order_by(Task.due_date.asc().nullslast(), Task.created_at.desc(), Task.id)
            .limit(100)
        )
    )
    captures = lambda processed: [
        dump(r)
        for r in db.scalars(
            select(InboxCapture)
            .where(
                InboxCapture.owner_id == user.id, InboxCapture.processed.is_(processed)
            )
            .order_by(InboxCapture.created_at.desc(), InboxCapture.id)
            .limit(50)
        )
    ]
    return {
        "day": day,
        "priorities": selected_tasks(db, user, plan.priority_ids if plan else []),
        "notes": plan.notes if plan else "",
        "closed_at": plan.closed_at if plan else None,
        "summary": plan.summary if plan else None,
        "tasks": [dump(t) for t in pending],
        "captures": captures(False),
        "archive": captures(True),
        "counts": {
            "overdue": count(Task.status != "completed", Task.due_date < day),
            "due_today": count(Task.status != "completed", Task.due_date == day),
            "completed_today": count(
                Task.status == "completed",
                Task.completed_at >= day_start,
                Task.completed_at < end,
            ),
            "open": count(Task.status != "completed"),
        },
        "week": {
            "start": day - timedelta(days=6),
            "end": day,
            "completed": count(
                Task.status == "completed",
                Task.completed_at >= start,
                Task.completed_at < end,
            ),
            "minutes": db.scalar(
                select(func.coalesce(func.sum(PersonalEntry.minutes), 0)).where(
                    PersonalEntry.owner_id == user.id,
                    PersonalEntry.deleted_at.is_(None),
                    PersonalEntry.entry_date >= day - timedelta(days=6),
                    PersonalEntry.entry_date <= day,
                )
            ),
        },
        "closed_days": [
            {"day": r.day, "notes": r.notes, "summary": r.summary}
            for r in db.scalars(
                select(DailyPlan)
                .where(
                    DailyPlan.owner_id == user.id,
                    DailyPlan.day >= day - timedelta(days=6),
                    DailyPlan.day <= day,
                    DailyPlan.closed_at.is_not(None),
                )
                .order_by(DailyPlan.day.desc())
            )
        ],
    }


@router.put("")
def save(
    data: PlanInput, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    day = chosen(data.day, db, user)
    if len(set(data.priority_ids)) != len(data.priority_ids):
        raise HTTPException(422, "Escolha tarefas diferentes para as três prioridades.")
    row = plan_for(db, user, day, True)
    if row.closed_at:
        raise HTTPException(409, "Reabra a revisão para alterar este dia.")
    for identity in data.priority_ids:
        owned(db, Task, identity, user)
    row.priority_ids = data.priority_ids
    row.notes = data.notes
    db.commit()
    return {"ok": True}


@router.post("/close")
def close(
    data: DayInput, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    day = chosen(data.day, db, user)
    if day > today(db, user):
        raise HTTPException(422, "O fechamento fica disponível no dia ou depois dele.")
    row = plan_for(db, user, day, True)
    if not row.closed_at:
        tasks = selected_tasks(db, user, row.priority_ids)
        row.summary = {
            "priorities": [
                {"title": t["title"], "completed": t["status"] == "completed"}
                for t in tasks
            ],
            "completed": sum(t["status"] == "completed" for t in tasks),
            "planned": len(tasks),
        }
        row.closed_at = now()
        db.commit()
    return {"ok": True}


@router.post("/reopen")
def reopen(
    data: DayInput, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    row = plan_for(db, user, chosen(data.day), True)
    row.closed_at = None
    row.summary = None
    db.commit()
    return {"ok": True}


@router.post("/captures", status_code=201)
def capture(
    data: CaptureInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    count = db.scalar(
        select(func.count())
        .select_from(InboxCapture)
        .where(InboxCapture.owner_id == user.id, InboxCapture.processed.is_(False))
    )
    if count >= 1000:
        raise HTTPException(
            422, "Organize suas capturas antes de adicionar mais de mil pendências."
        )
    row = InboxCapture(owner_id=user.id, **data.model_dump())
    db.add(row)
    db.commit()
    return dump(row)


@router.patch("/captures/{identity}")
def archive(
    identity: str,
    data: CaptureState,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    row = owned(db, InboxCapture, identity, user)
    row.processed = data.processed
    db.commit()
    return dump(row)


@router.post("/captures/{identity}/task")
def convert(
    identity: str,
    data: ConvertInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    row = owned(db, InboxCapture, identity, user)
    if row.task_id:
        task = owned(db, Task, row.task_id, user)
    else:
        task = Task(
            owner_id=user.id,
            title=row.text,
            context=row.context,
            due_date=data.due_date,
        )
        db.add(task)
        db.flush()
        row.task_id = task.id
    row.processed = True
    db.commit()
    return dump(task)
