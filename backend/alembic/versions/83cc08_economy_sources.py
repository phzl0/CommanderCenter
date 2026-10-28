"""Economy preferences and versioned news catalogue."""

from alembic import op
import sqlalchemy as sa

revision = "83cc08"
down_revision = "729b2a6"
branch_labels = depends_on = None


def upgrade():
    op.add_column(
        "source_settings",
        sa.Column(
            "catalogue_version", sa.Integer(), nullable=False, server_default="0"
        ),
    )
    op.add_column(
        "news_sources", sa.Column("builtin_key", sa.String(50), nullable=True)
    )
    op.create_table(
        "economy_settings",
        sa.Column(
            "owner_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True
        ),
        sa.Column("api_key", sa.Text()),
        sa.Column("cached_data", sa.JSON()),
        sa.Column("cached_at", sa.DateTime()),
    )


def downgrade():
    op.drop_table("economy_settings")
    with op.batch_alter_table("news_sources") as b:
        b.drop_column("builtin_key")
    with op.batch_alter_table("source_settings") as b:
        b.drop_column("catalogue_version")
