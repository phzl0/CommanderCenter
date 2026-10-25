from fastapi import APIRouter, Depends, Request, Response, HTTPException
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import select, delete
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.config import settings
from app.core.security import (
    current_user,
    passwords,
    DUMMY_HASH,
    create_session,
    limiter,
    COOKIE,
    token_hash,
)
from app.models import User, SessionToken, now
from app.core.preferences import account_view

router = APIRouter(prefix="/api/auth", tags=["Acesso"])


class Login(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


def public_user(user, db):
    return account_view(db, user)


@router.post("/login")
def login(
    data: Login, request: Request, response: Response, db: Session = Depends(get_db)
):
    limiter.check(request.client.host if request.client else "local")
    user = db.scalar(select(User).where(User.email == data.email.strip().lower()))
    try:
        valid = passwords.verify(
            data.password, user.password_hash if user else DUMMY_HASH
        )
    except Exception:
        valid = False
    if not user or not valid or not user.active:
        raise HTTPException(401, "E-mail ou senha inválidos.")
    old = request.cookies.get(COOKIE)
    if old:
        db.execute(
            delete(SessionToken).where(SessionToken.token_hash == token_hash(old))
        )
    token = create_session(db, user, request.headers.get("user-agent", ""))
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.session_hours * 3600,
        path="/api",
    )
    return public_user(user, db)


@router.get("/me")
def me(
    request: Request,
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    token = request.cookies.get(COOKIE, "")
    session = db.get(SessionToken, token_hash(token))
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=max(1, int((session.expires_at - now()).total_seconds())),
        path="/api",
    )
    return public_user(user, db)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(COOKIE)
    if token:
        db.execute(
            delete(SessionToken).where(SessionToken.token_hash == token_hash(token))
        )
        db.commit()
    response.delete_cookie(COOKIE, path="/api")
