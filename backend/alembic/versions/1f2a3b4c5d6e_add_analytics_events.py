"""add analytics_events table

Revision ID: 1f2a3b4c5d6e
Revises: 89c299ca0e48
Create Date: 2026-04-23 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "1f2a3b4c5d6e"
down_revision = "89c299ca0e48"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.create_table(
        "analytics_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("event_name", sa.String(), nullable=False),
        sa.Column("properties", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(op.f("ix_analytics_events_user_id"), "analytics_events", ["user_id"], unique=False)
    op.create_index(op.f("ix_analytics_events_session_id"), "analytics_events", ["session_id"], unique=False)
    op.create_index(op.f("ix_analytics_events_created_at"), "analytics_events", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_analytics_events_created_at"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_session_id"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_user_id"), table_name="analytics_events")
    op.drop_table("analytics_events")
