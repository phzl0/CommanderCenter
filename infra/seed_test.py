"""Disposable CI account. Refuses to operate on a personal database."""

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.security import passwords
from app.models import User

if not settings.database_url.split("?", 1)[0].endswith("_test"):
    raise SystemExit("Somente banco descartável com sufixo _test.")
with SessionLocal() as db:
    db.add(
        User(
            name="Teste E2E",
            email="e2e@example.test",
            password_hash=passwords.hash("disposable-e2e-password"),
        )
    )
    db.commit()
