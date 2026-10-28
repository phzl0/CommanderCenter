"""Per-account news source choices."""

from alembic import op
import sqlalchemy as sa

revision = "94cc09"
down_revision = "83cc08"
branch_labels = depends_on = None


def upgrade():
    op.add_column(
        "source_settings", sa.Column("preferred_sources", sa.JSON(), nullable=True)
    )


def downgrade():
    with op.batch_alter_table("source_settings") as b:
        b.drop_column("preferred_sources")
