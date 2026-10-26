"""OAuth application administration and popup completion."""

from alembic import op
import sqlalchemy as sa

revision = "729b2a6"
down_revision = "57d9d270"
branch_labels = depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # A single-account local installation has an unambiguous administrator.
    op.execute(
        "UPDATE users SET is_admin = true WHERE (SELECT count(*) FROM users) = 1"
    )
    op.add_column(
        "integration_flows",
        sa.Column("popup", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    table = op.create_table(
        "oauth_applications",
        sa.Column("provider", sa.String(20), primary_key=True),
        sa.Column("credentials", sa.Text(), nullable=True),
    )
    op.bulk_insert(
        table,
        [
            {"provider": p, "credentials": None}
            for p in ["github", "google", "microsoft"]
        ],
    )


def downgrade():
    op.drop_table("oauth_applications")
    with op.batch_alter_table("integration_flows") as b:
        b.drop_column("popup")
    with op.batch_alter_table("users") as b:
        b.drop_column("is_admin")
