"""Persisted local calendar reminders; run with python -m app.modules.reminders."""

import logging
import smtplib
import ssl
import time
from datetime import timedelta, timezone
from email.message import EmailMessage
from sqlalchemy import select, or_, and_
from app.core.config import settings
from app.core.db import SessionLocal
from app.core.preferences import user_zone
from app.models import Appointment, User, now
from app.modules.notifications import record

logger = logging.getLogger(__name__)


def email_configured():
    return bool(
        settings.smtp_host
        and settings.smtp_from
        and settings.smtp_security in ("starttls", "ssl")
    )


def send_email(user, row, zone):
    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = user.email
    message["Subject"] = "Command Center: " + " ".join(row.title.splitlines())[:160]
    start = row.start_at.replace(tzinfo=timezone.utc).astimezone(zone)
    message.set_content(
        f"{row.title}\n{start:%d/%m/%Y %H:%M} ({zone})\n\n{row.notes}\n\nAbra sua agenda no Command Center."
    )
    client = smtplib.SMTP_SSL if settings.smtp_security == "ssl" else smtplib.SMTP
    kwargs = {"timeout": 15}
    if settings.smtp_security == "ssl":
        kwargs["context"] = ssl.create_default_context()
    with client(settings.smtp_host, settings.smtp_port, **kwargs) as smtp:
        if settings.smtp_security == "starttls":
            smtp.ehlo()
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)


def process_due(factory=SessionLocal):
    # Row locks serialize workers on PostgreSQL. A crash immediately after SMTP
    # acceptance may cause a duplicate on retry; delivery is at least once.
    moment = now()
    with factory() as db:
        rows = list(
            db.scalars(
                select(Appointment)
                .where(
                    Appointment.reminder_at <= moment,
                    Appointment.end_at > moment,
                    Appointment.completed.is_(False),
                    or_(
                        and_(
                            Appointment.notify_system.is_(True),
                            Appointment.system_sent_at.is_(None),
                        ),
                        and_(
                            Appointment.notify_email.is_(True),
                            Appointment.email_sent_at.is_(None),
                            or_(
                                Appointment.email_attempt_at.is_(None),
                                Appointment.email_attempt_at
                                < moment - timedelta(minutes=5),
                            ),
                        ),
                    ),
                )
                .order_by(Appointment.reminder_at)
                .limit(100)
                .with_for_update(skip_locked=True)
            )
        )
        for row in rows:
            user = db.get(User, row.owner_id)
            zone = user_zone(db, user)
            if row.notify_system and not row.system_sent_at:
                day = (
                    row.start_at.replace(tzinfo=timezone.utc)
                    .astimezone(zone)
                    .date()
                    .isoformat()
                )
                record(
                    db,
                    user,
                    "Lembrete da agenda",
                    row.title,
                    level="info",
                    target={"kind": "agenda", "day": day},
                )
                row.system_sent_at = moment
            if (
                row.notify_email
                and not row.email_sent_at
                and (
                    not row.email_attempt_at
                    or row.email_attempt_at < moment - timedelta(minutes=5)
                )
            ):
                row.email_attempt_at = moment
                try:
                    if not email_configured():
                        raise RuntimeError("SMTP não configurado")
                    send_email(user, row, zone)
                    row.email_sent_at = moment
                    row.email_error = None
                except Exception:
                    row.email_error = "Falha no envio de e-mail. Confira a configuração SMTP; nova tentativa em cinco minutos."
            db.flush()
        db.commit()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    while True:
        try:
            process_due()
        except Exception:
            logger.error(
                "Não foi possível consultar os lembretes; nova tentativa em 30 segundos."
            )
        time.sleep(30)
