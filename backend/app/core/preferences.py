from zoneinfo import ZoneInfo
from app.models import AccountSettings

DEFAULTS = {
    "homepage": "dashboard",
    "timezone": "America/Sao_Paulo",
    "font_size": "normal",
    "reduce_motion": False,
    "notify_success": True,
    "deadline_alerts": True,
    "alert_days": 1,
    "daily_capacity": 480,
}


def preferences(db, user):
    row = db.get(AccountSettings, user.id)
    return {key: getattr(row, key) if row else value for key, value in DEFAULTS.items()}


def user_zone(db, user):
    return ZoneInfo(preferences(db, user)["timezone"])


def account_view(db, user):
    row = db.get(AccountSettings, user.id)
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "created_at": user.created_at,
        "bio": row.bio if row else "",
        "occupation": row.occupation if row else "",
        "interests": row.interests if row else "",
        "has_avatar": bool(row and row.avatar),
        "avatar_version": row.avatar_version if row else 0,
        "preferences": preferences(db, user),
    }
