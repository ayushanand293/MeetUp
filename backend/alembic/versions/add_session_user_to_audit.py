"""Add session_id and user_id to audit_events table.

Revision ID: add_session_user_audit
Revises: 058f0ed488ad
Create Date: 2026-02-27 00:00:00.000000

"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "add_session_user_audit"
down_revision = "058f0ed488ad"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add session_id and user_id columns to audit_events
    op.add_column("audit_events", sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("audit_events", sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True))

    # Add foreign key constraints
    op.create_foreign_key(
        "fk_audit_events_session_id",
        "audit_events",
        "sessions",
        ["session_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key("fk_audit_events_user_id", "audit_events", "users", ["user_id"], ["id"], ondelete="SET NULL")

    # Create index for faster queries
    op.create_index("ix_audit_events_session_id", "audit_events", ["session_id"])
    op.create_index("ix_audit_events_user_id", "audit_events", ["user_id"])


def downgrade() -> None:
    # Drop indices
    op.drop_index("ix_audit_events_user_id", table_name="audit_events")
    op.drop_index("ix_audit_events_session_id", table_name="audit_events")

    # Drop foreign keys
    op.drop_constraint("fk_audit_events_user_id", "audit_events", type_="foreignkey")
    op.drop_constraint("fk_audit_events_session_id", "audit_events", type_="foreignkey")

    # Drop columns
    op.drop_column("audit_events", "user_id")
    op.drop_column("audit_events", "session_id")
