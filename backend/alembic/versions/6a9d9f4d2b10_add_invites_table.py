"""add invites table

Revision ID: 6a9d9f4d2b10
Revises: 1f2a3b4c5d6e
Create Date: 2026-04-25 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "6a9d9f4d2b10"
down_revision = "1f2a3b4c5d6e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.create_table(
        "invites",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("recipient", sa.String(), nullable=False),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("meet_requests.id"), nullable=True),
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now() + interval '24 hours'")),
        sa.Column("redeemed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index(op.f("ix_invites_created_by"), "invites", ["created_by"], unique=False)
    op.create_index(op.f("ix_invites_request_id"), "invites", ["request_id"], unique=False)
    op.create_index(op.f("ix_invites_token"), "invites", ["token"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_invites_token"), table_name="invites")
    op.drop_index(op.f("ix_invites_request_id"), table_name="invites")
    op.drop_index(op.f("ix_invites_created_by"), table_name="invites")
    op.drop_table("invites")