import io
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    Response,
    UploadFile,
    File,
)
from pydantic import BaseModel, ConfigDict, Field, field_validator
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select, delete
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.config import settings
from app.core.preferences import account_view
from app.core.security import (
    current_user,
    passwords,
    limiter,
    COOKIE,
    token_hash,
    create_session,
)
from app.models import User, AccountSettings, SessionToken, now
from app.modules.management import StrictModel

router = APIRouter(prefix="/api/account", tags=["Perfil e preferências"])


def settings_for(db, user):
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    row = db.get(AccountSettings, user.id)
    if not row:
        row = AccountSettings(owner_id=user.id)
        db.add(row)
        db.flush()
    return row


class ProfileInput(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    bio: str = Field(default="", max_length=500)
    occupation: str = Field(default="", max_length=100)
    interests: str = Field(default="", max_length=300)


class PreferencesInput(StrictModel):
    homepage: Literal["dashboard", "daily"] = "dashboard"
    timezone: str = Field(default="America/Sao_Paulo", max_length=64)
    font_size: Literal["normal", "large"] = "normal"
    reduce_motion: bool = False
    notify_success: bool = True
    deadline_alerts: bool = True
    alert_days: Literal[0, 1, 3, 7] = 1
    daily_capacity: int = Field(default=480, ge=15, le=1440)

    @field_validator("timezone")
    @classmethod
    def valid_zone(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Escolha um fuso horário IANA válido.")
        return value


class PasswordInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


@router.get("")
def read(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return account_view(db, user)


@router.put("/profile")
def profile(
    data: ProfileInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    row = settings_for(db, user)
    user.name = data.name
    for key in ("bio", "occupation", "interests"):
        setattr(row, key, getattr(data, key))
    db.commit()
    return account_view(db, user)


@router.put("/preferences")
def update_preferences(
    data: PreferencesInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    row = settings_for(db, user)
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    db.commit()
    return account_view(db, user)


@router.post("/avatar")
async def avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    raw = await file.read(5 * 1024 * 1024 + 1)
    await file.close()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(422, "A foto deve ter até 5 MB.")
    try:
        with Image.open(io.BytesIO(raw)) as img:
            if (
                img.format not in ("JPEG", "PNG", "WEBP")
                or img.width * img.height > 16_000_000
            ):
                raise ValueError()
            img = ImageOps.exif_transpose(img).convert("RGB")
            img.thumbnail((256, 256))
            output = io.BytesIO()
            img.save(output, format="JPEG", quality=85)
            processed = output.getvalue()
    except (ValueError, UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(
            422, "Use uma foto PNG, JPEG ou WEBP válida, com até 16 milhões de pixels."
        )
    row = settings_for(db, user)
    row.avatar = processed
    row.avatar_version += 1
    db.commit()
    return account_view(db, user)


@router.get("/avatar")
def get_avatar(db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = db.get(AccountSettings, user.id)
    if not row or not row.avatar:
        raise HTTPException(404, "Foto não cadastrada.")
    return Response(row.avatar, media_type="image/jpeg")


@router.delete("/avatar")
def delete_avatar(db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = settings_for(db, user)
    row.avatar = None
    row.avatar_version += 1
    db.commit()
    return account_view(db, user)


@router.get("/sessions")
def sessions(
    request: Request, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    current = token_hash(request.cookies.get(COOKIE, ""))
    return [
        {
            "current": r.token_hash == current,
            "device": r.device or "Sessão anterior",
            "created_at": r.created_at,
            "expires_at": r.expires_at,
        }
        for r in db.scalars(
            select(SessionToken)
            .where(SessionToken.user_id == user.id, SessionToken.expires_at > now())
            .order_by(SessionToken.created_at.desc())
        )
    ]


@router.post("/sessions/revoke-others", status_code=204)
def revoke_others(
    request: Request, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    db.execute(
        delete(SessionToken).where(
            SessionToken.user_id == user.id,
            SessionToken.token_hash != token_hash(request.cookies.get(COOKIE, "")),
        )
    )
    db.commit()


@router.post("/password", status_code=204)
def password(
    data: PasswordInput,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    limiter.check("password:" + user.id)
    user = db.scalar(
        select(User)
        .where(User.id == user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if not passwords.verify(data.current_password, user.password_hash):
        raise HTTPException(400, "A senha atual não confere.")
    if data.current_password == data.new_password:
        raise HTTPException(422, "Escolha uma senha diferente da atual.")
    user.password_hash = passwords.hash(data.new_password)
    db.execute(delete(SessionToken).where(SessionToken.user_id == user.id))
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
