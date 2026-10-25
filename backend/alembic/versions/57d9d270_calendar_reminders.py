"""Calendar items and persisted reminders."""

from alembic import op
import sqlalchemy as sa

revision = "57d9d270"
down_revision = "0e9a026a1e4f"
branch_labels = depends_on = None


def upgrade():
    with op.batch_alter_table("appointments") as b:
        b.add_column(
            sa.Column(
                "kind", sa.String(16), nullable=False, server_default="appointment"
            )
        )
        b.add_column(
            sa.Column(
                "completed", sa.Boolean(), nullable=False, server_default=sa.false()
            )
        )
        b.add_column(sa.Column("reminder_minutes", sa.Integer(), nullable=True))
        b.add_column(
            sa.Column(
                "notify_system", sa.Boolean(), nullable=False, server_default=sa.true()
            )
        )
        b.add_column(
            sa.Column(
                "notify_email", sa.Boolean(), nullable=False, server_default=sa.false()
            )
        )
        for name in [
            "reminder_at",
            "system_sent_at",
            "email_sent_at",
            "email_attempt_at",
        ]:
            b.add_column(sa.Column(name, sa.DateTime(), nullable=True))
        b.add_column(sa.Column("email_error", sa.String(300), nullable=True))
        b.create_index("ix_appointments_reminder_at", ["reminder_at"])
    # Keep all old configurations; only five non-news cards stay visible.
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT id, owner_id, kind, visible FROM dashboard_widgets WHERE deleted_at IS NULL ORDER BY position, created_at, id"
        )
    ).mappings()
    counts = {}
    for row in list(rows):
        if row["kind"] == "news" or not row["visible"]:
            continue
        owner = row["owner_id"]
        counts[owner] = counts.get(owner, 0) + 1
        if counts[owner] > 5:
            bind.execute(
                sa.text("UPDATE dashboard_widgets SET visible = false WHERE id = :id"),
                {"id": row["id"]},
            )
    bind.execute(sa.text("UPDATE workspace_settings SET card_limit = 5"))
    bind.execute(
        sa.text(
            "UPDATE account_settings SET homepage = 'dashboard' WHERE homepage = 'daily'"
        )
    )


def downgrade():
    with op.batch_alter_table("appointments") as b:
        b.drop_index("ix_appointments_reminder_at")
        for name in [
            "kind",
            "completed",
            "reminder_minutes",
            "notify_system",
            "notify_email",
            "reminder_at",
            "system_sent_at",
            "email_sent_at",
            "email_attempt_at",
            "email_error",
        ]:
            b.drop_column(name)
