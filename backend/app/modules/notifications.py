from datetime import timedelta
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from sqlalchemy import select, delete, update
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.security import current_user
from app.models import (
    User,
    Notification,
    DashboardWidget,
    PersonalEntry,
    FinanceEntry,
    NewsSource,
    now,
)
from app.modules.management import StrictModel, owned, dump

router = APIRouter(prefix="/api/notifications", tags=["Notificações"])
RECYCLE = {
    "widget": DashboardWidget,
    "personal": PersonalEntry,
    "finance": FinanceEntry,
    "source": NewsSource,
}


class Action(StrictModel):
    kind: Literal["widget", "personal", "finance", "source"]
    id: str = Field(max_length=36)


class NoticeInput(StrictModel):
    title: str = Field(min_length=1, max_length=160)
    message: str = Field(default="", max_length=500)
    level: Literal["success", "info", "warning", "error"] = "success"
    action: Action | None = None


def record(db, user, title, message="", level="success", action=None, fingerprint=None):
    if fingerprint:
        existing = db.scalar(
            select(Notification).where(
                Notification.owner_id == user.id,
                Notification.fingerprint == fingerprint,
                Notification.created_at > now() - timedelta(hours=1),
            )
        )
        if existing:
            return existing
    row = Notification(
        owner_id=user.id,
        title=title[:160],
        message=message[:500],
        level=level,
        action=action,
        fingerprint=fingerprint,
    )
    db.add(row)
    db.flush()
    keep = list(
        db.scalars(
            select(Notification.id)
            .where(Notification.owner_id == user.id)
            .order_by(Notification.created_at.desc())
            .offset(200)
        )
    )
    if keep:
        db.execute(
            delete(Notification).where(
                Notification.owner_id == user.id, Notification.id.in_(keep)
            )
        )
    return row


@router.get("")
def list_notices(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = list(
        db.scalars(
            select(Notification)
            .where(Notification.owner_id == user.id)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .limit(100)
        )
    )
    return {"items": [dump(r) for r in rows], "unread": sum(not r.read for r in rows)}


@router.post("", status_code=201)
def add(
    data: NoticeInput, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    action = data.action.model_dump() if data.action else None
    if action:
        row = owned(db, RECYCLE[action["kind"]], action["id"], user)
        if not row.deleted_at:
            raise HTTPException(409, "O registro não está na lixeira.")
    row = record(db, user, data.title, data.message, data.level, action)
    db.commit()
    return dump(row)


@router.post("/read-all", status_code=204)
def read_all(db: Session = Depends(get_db), user: User = Depends(current_user)):
    db.execute(
        update(Notification).where(Notification.owner_id == user.id).values(read=True)
    )
    db.commit()


@router.post("/{identity}/read", status_code=204)
def read(
    identity: str, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    row = owned(db, Notification, identity, user)
    row.read = True
    db.commit()


@router.post("/restore/{kind}/{identity}")
def restore(
    kind: Literal["widget", "personal", "finance", "source"],
    identity: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    row = owned(db, RECYCLE[kind], identity, user)
    if not row.deleted_at:
        raise HTTPException(409, "O registro já está ativo.")
    if row.deleted_at < now() - timedelta(minutes=10):
        raise HTTPException(409, "O prazo de dez minutos para desfazer terminou.")
    if kind == "widget":
        count = len(
            list(
                db.scalars(
                    select(DashboardWidget.id).where(
                        DashboardWidget.owner_id == user.id,
                        DashboardWidget.deleted_at.is_(None),
                    )
                )
            )
        )
        if count >= 12:
            raise HTTPException(409, "Remova outro painel antes de restaurar este.")
    if kind == "source":
        count = len(
            list(
                db.scalars(
                    select(NewsSource.id).where(
                        NewsSource.owner_id == user.id, NewsSource.deleted_at.is_(None)
                    )
                )
            )
        )
        if count >= 30:
            raise HTTPException(409, "Remova outra fonte antes de restaurar esta.")
        for widget in db.scalars(
            select(DashboardWidget).where(
                DashboardWidget.owner_id == user.id, DashboardWidget.kind == "news"
            )
        ):
            widget.cached_at = None
            widget.cached_data = None
    row.deleted_at = None
    record(db, user, "Exclusão desfeita", "O registro foi restaurado.")
    db.commit()
    return {"ok": True}
