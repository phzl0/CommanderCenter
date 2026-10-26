from datetime import datetime, timezone, date
from uuid import uuid4
from sqlalchemy import (
    String,
    Text,
    DateTime,
    Date,
    ForeignKey,
    ForeignKeyConstraint,
    UniqueConstraint,
    CheckConstraint,
    JSON,
    Integer,
    Boolean,
    BigInteger,
    LargeBinary,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column
from app.core.db import Base


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def uid():
    return str(uuid4())


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false")
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class SessionToken(Base):
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=now, server_default=text("CURRENT_TIMESTAMP")
    )
    device: Mapped[str] = mapped_column(String(180), default="", server_default="")
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)


class Owned:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Project(Owned, Base):
    __tablename__ = "projects"
    __table_args__ = (
        UniqueConstraint("id", "owner_id"),
        CheckConstraint("status IN ('active','paused','completed','archived')"),
    )
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="active")
    due_date: Mapped[date | None] = mapped_column(Date)


class Task(Owned, Base):
    goal_id: Mapped[str | None] = mapped_column(ForeignKey("goals.id"), index=True)
    tags: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    recurrence: Mapped[str] = mapped_column(
        String(12), default="none", server_default="none"
    )
    recurrence_parent_id: Mapped[str | None] = mapped_column(String(36), unique=True)

    __tablename__ = "tasks"
    __table_args__ = (
        UniqueConstraint("id", "owner_id"),
        ForeignKeyConstraint(
            ["project_id", "owner_id"], ["projects.id", "projects.owner_id"]
        ),
        CheckConstraint("status IN ('pending','in_progress','completed')"),
        CheckConstraint("priority IN ('low','medium','high')"),
    )
    context: Mapped[str] = mapped_column(
        String(16), default="general", server_default="general"
    )
    project_id: Mapped[str | None] = mapped_column(String(36), index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    priority: Mapped[str] = mapped_column(String(12), default="medium")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    due_date: Mapped[date | None] = mapped_column(Date)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)


class Activity(Owned, Base):
    __tablename__ = "activities"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "owner_id"], ["projects.id", "projects.owner_id"]
        ),
        ForeignKeyConstraint(["task_id", "owner_id"], ["tasks.id", "tasks.owner_id"]),
        CheckConstraint("origin IN ('manual','automatic')"),
    )
    project_id: Mapped[str | None] = mapped_column(String(36))
    task_id: Mapped[str | None] = mapped_column(String(36))
    description: Mapped[str] = mapped_column(Text)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    origin: Mapped[str] = mapped_column(String(12), default="manual")


class ImportFile(Owned, Base):
    __tablename__ = "imports"
    __table_args__ = (UniqueConstraint("id", "owner_id"),)
    original_name: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(80), unique=True)
    format: Mapped[str] = mapped_column(String(10))
    size_bytes: Mapped[int] = mapped_column(Integer)
    rows: Mapped[int] = mapped_column(Integer)
    columns: Mapped[list] = mapped_column(JSON)
    sheets: Mapped[list] = mapped_column(JSON, default=list)
    options: Mapped[dict] = mapped_column(JSON, default=dict)


class Analysis(Owned, Base):
    __tablename__ = "analyses"
    __table_args__ = (
        UniqueConstraint("id", "owner_id"),
        ForeignKeyConstraint(
            ["import_id", "owner_id"], ["imports.id", "imports.owner_id"]
        ),
    )
    import_id: Mapped[str] = mapped_column(String(36), index=True)
    name: Mapped[str] = mapped_column(String(160))
    config: Mapped[dict] = mapped_column(JSON)


class Report(Owned, Base):
    __tablename__ = "reports"
    __table_args__ = (
        ForeignKeyConstraint(
            ["analysis_id", "owner_id"], ["analyses.id", "analyses.owner_id"]
        ),
    )
    analysis_id: Mapped[str | None] = mapped_column(String(36))
    title: Mapped[str] = mapped_column(String(160))
    format: Mapped[str] = mapped_column(String(10))
    stored_name: Mapped[str] = mapped_column(String(80), unique=True)
    parameters: Mapped[dict] = mapped_column(JSON, default=dict)


class WorkspaceSettings(Base):
    __tablename__ = "workspace_settings"
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    days: Mapped[int] = mapped_column(Integer, default=30)
    card_limit: Mapped[int] = mapped_column(Integer, default=5, server_default="5")


class DashboardWidget(Owned, Base):
    __tablename__ = "dashboard_widgets"
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)
    title: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(20))
    visible: Mapped[bool] = mapped_column(Boolean, default=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    wide: Mapped[bool] = mapped_column(Boolean, default=False)
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    cached_data: Mapped[dict | None] = mapped_column(JSON)
    cached_at: Mapped[datetime | None] = mapped_column(DateTime)
    cache_key: Mapped[str | None] = mapped_column(String(64))


class PersonalEntry(Owned, Base):
    goal_id: Mapped[str | None] = mapped_column(ForeignKey("goals.id"), index=True)
    __tablename__ = "personal_entries"
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)
    label: Mapped[str] = mapped_column(String(100))
    minutes: Mapped[int] = mapped_column(Integer)
    entry_date: Mapped[date] = mapped_column(Date, index=True)
    __table_args__ = (CheckConstraint("minutes > 0 AND minutes <= 1440"),)


class FinanceEntry(Owned, Base):
    __tablename__ = "finance_entries"
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)
    description: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(80))
    direction: Mapped[str] = mapped_column(String(10))
    amount_cents: Mapped[int] = mapped_column(BigInteger)
    entry_date: Mapped[date] = mapped_column(Date, index=True)
    __table_args__ = (
        CheckConstraint("direction IN ('income','expense')"),
        CheckConstraint("amount_cents > 0"),
    )


class SourceSettings(Base):
    __tablename__ = "source_settings"
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)


class NewsSource(Owned, Base):
    __tablename__ = "news_sources"
    name: Mapped[str] = mapped_column(String(100))
    category: Mapped[str] = mapped_column(String(80))
    url: Mapped[str] = mapped_column(String(2048))
    kind: Mapped[str] = mapped_column(String(10), default="rss")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    cached_items: Mapped[list | None] = mapped_column(JSON)
    checked_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_error: Mapped[str | None] = mapped_column(String(500))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)


class Notification(Owned, Base):
    target: Mapped[dict | None] = mapped_column(JSON)
    __tablename__ = "notifications"
    title: Mapped[str] = mapped_column(String(160))
    message: Mapped[str] = mapped_column(String(500), default="")
    level: Mapped[str] = mapped_column(String(10), default="success")
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    fingerprint: Mapped[str | None] = mapped_column(String(160), index=True)
    action: Mapped[dict | None] = mapped_column(JSON)


class ArticleState(Owned, Base):
    __tablename__ = "article_states"
    __table_args__ = (UniqueConstraint("owner_id", "article_key"),)
    article_key: Mapped[str] = mapped_column(String(64))
    url: Mapped[str] = mapped_column(String(2048))
    title: Mapped[str] = mapped_column(String(500))
    source: Mapped[str] = mapped_column(String(100), default="")
    category: Mapped[str] = mapped_column(String(80), default="")
    image: Mapped[str] = mapped_column(String(2048), default="")
    description: Mapped[str] = mapped_column(String(1000), default="")
    published_date: Mapped[str] = mapped_column(String(40), default="")
    bookmarked: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime)


class IntegrationConnection(Owned, Base):
    checked_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_error: Mapped[str | None] = mapped_column(String(300))
    __tablename__ = "integration_connections"
    __table_args__ = (UniqueConstraint("owner_id", "provider"),)
    provider: Mapped[str] = mapped_column(String(20))
    account: Mapped[str] = mapped_column(String(200))
    credentials: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)


class OAuthApplication(Base):
    __tablename__ = "oauth_applications"
    provider: Mapped[str] = mapped_column(String(20), primary_key=True)
    credentials: Mapped[str | None] = mapped_column(Text)


class IntegrationFlow(Base):
    popup: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false")
    )
    __tablename__ = "integration_flows"
    state_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    session_hash: Mapped[str] = mapped_column(String(64))
    provider: Mapped[str] = mapped_column(String(20))
    verifier: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class DailyPlan(Owned, Base):
    __tablename__ = "daily_plans"
    __table_args__ = (UniqueConstraint("owner_id", "day"),)
    day: Mapped[date] = mapped_column(Date)
    priority_ids: Mapped[list] = mapped_column(JSON, default=list)
    notes: Mapped[str] = mapped_column(Text, default="")
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)
    summary: Mapped[dict | None] = mapped_column(JSON)


class InboxCapture(Owned, Base):
    __tablename__ = "inbox_captures"
    text: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(16), default="note")
    context: Mapped[str] = mapped_column(String(16), default="general")
    processed: Mapped[bool] = mapped_column(Boolean, default=False)
    task_id: Mapped[str | None] = mapped_column(String(36))


class AccountSettings(Base):
    __tablename__ = "account_settings"
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    bio: Mapped[str] = mapped_column(String(500), default="")
    occupation: Mapped[str] = mapped_column(String(100), default="")
    interests: Mapped[str] = mapped_column(String(300), default="")
    avatar: Mapped[bytes | None] = mapped_column(LargeBinary)
    avatar_version: Mapped[int] = mapped_column(Integer, default=0)
    homepage: Mapped[str] = mapped_column(String(20), default="dashboard")
    timezone: Mapped[str] = mapped_column(String(64), default="America/Sao_Paulo")
    font_size: Mapped[str] = mapped_column(String(12), default="normal")
    reduce_motion: Mapped[bool] = mapped_column(Boolean, default=False)
    notify_success: Mapped[bool] = mapped_column(Boolean, default=True)
    deadline_alerts: Mapped[bool] = mapped_column(Boolean, default=True)
    alert_days: Mapped[int] = mapped_column(Integer, default=1)
    daily_capacity: Mapped[int] = mapped_column(Integer, default=480)


class Goal(Owned, Base):
    __tablename__ = "goals"
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    context: Mapped[str] = mapped_column(String(16), default="personal")
    metric: Mapped[str] = mapped_column(String(12), default="tasks")
    target: Mapped[int] = mapped_column(Integer)
    manual_value: Mapped[int] = mapped_column(Integer, default=0)
    due_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(12), default="active")


class Appointment(Owned, Base):
    __tablename__ = "appointments"
    title: Mapped[str] = mapped_column(String(160))
    notes: Mapped[str] = mapped_column(Text, default="")
    start_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    end_at: Mapped[datetime] = mapped_column(DateTime)
    context: Mapped[str] = mapped_column(String(16), default="personal")

    kind: Mapped[str] = mapped_column(
        String(16), default="appointment", server_default="appointment"
    )
    completed: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false")
    )
    reminder_minutes: Mapped[int | None] = mapped_column(Integer)
    notify_system: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true")
    )
    notify_email: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false")
    )
    reminder_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    system_sent_at: Mapped[datetime | None] = mapped_column(DateTime)
    email_sent_at: Mapped[datetime | None] = mapped_column(DateTime)
    email_attempt_at: Mapped[datetime | None] = mapped_column(DateTime)
    email_error: Mapped[str | None] = mapped_column(String(300))
