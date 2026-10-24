from fastapi import APIRouter, Depends, Request, Response, HTTPException
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import select, delete
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.config import settings
from app.core.security import current_user, passwords, DUMMY_HASH, create_session, limiter, COOKIE, token_hash
from app.models import User, SessionToken

router = APIRouter(prefix="/api/auth", tags=["Acesso"])

class Login(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)

def public_user(user):
    return {"id":user.id, "name":user.name, "email":user.email}

@router.post("/login")
def login(data: Login, request: Request, response: Response, db: Session = Depends(get_db)):
    limiter.check(request.client.host if request.client else "local")
    user = db.scalar(select(User).where(User.email == data.email.strip().lower()))
    try:
        valid = passwords.verify(data.password, user.password_hash if user else DUMMY_HASH)
    except Exception:
        valid = False
    if not user or not valid or not user.active:
        raise HTTPException(401, "E-mail ou senha inválidos.")
    old = request.cookies.get(COOKIE)
    if old:
        db.execute(delete(SessionToken).where(SessionToken.token_hash == token_hash(old)))
    token = create_session(db, user)
    response.set_cookie(COOKIE, token, httponly=True, secure=settings.cookie_secure, samesite="strict", max_age=settings.session_hours*3600, path="/api")
    return public_user(user)

@router.get("/me")
def me(user: User = Depends(current_user)):
    return public_user(user)

@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(COOKIE)
    if token:
        db.execute(delete(SessionToken).where(SessionToken.token_hash == token_hash(token)))
        db.commit()
    response.delete_cookie(COOKIE, path="/api")
