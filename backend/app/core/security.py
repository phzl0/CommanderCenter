from datetime import timedelta
import hashlib
import secrets
import threading
import time
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select, delete
from sqlalchemy.orm import Session
from pwdlib import PasswordHash
from app.core.config import settings
from app.core.db import get_db
from app.models import User, SessionToken, now

passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash("invalid-password-placeholder")
COOKIE = "cc_session"


def token_hash(token: str):
    return hashlib.sha256(token.encode()).hexdigest()


def current_user(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get(COOKIE, "")
    session = db.get(SessionToken, token_hash(token)) if token else None
    if not session or session.expires_at <= now():
        raise HTTPException(401, "Sessão expirada. Entre novamente.")
    user = db.get(User, session.user_id)
    if not user or not user.active:
        raise HTTPException(401, "Sessão inválida.")
    return user


def create_session(db, user):
    db.execute(delete(SessionToken).where(SessionToken.expires_at <= now()))
    token = secrets.token_urlsafe(48)
    db.add(
        SessionToken(
            token_hash=token_hash(token),
            user_id=user.id,
            expires_at=now() + timedelta(hours=settings.session_hours),
        )
    )
    db.commit()
    return token


class LoginLimiter:
    """Single-process local MVP limiter; no proxy headers are trusted."""

    def __init__(self):
        self.attempts = {}
        self.lock = threading.Lock()

    def check(self, key):
        with self.lock:
            t = time.monotonic()
            self.attempts = {k: v for k, v in self.attempts.items() if v[-1] > t - 600}
            values = [v for v in self.attempts.get(key, []) if v > t - 600]
            if len(values) >= 10:
                raise HTTPException(429, "Muitas tentativas. Aguarde 10 minutos.")
            self.attempts[key] = values + [t]


limiter = LoginLimiter()
