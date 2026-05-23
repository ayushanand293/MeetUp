"""phone auth fields and contacts digests

Revision ID: c9a7b6f8e2d1
Revises: d3f5f0469bdd
Create Date: 2026-04-26 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c9a7b6f8e2d1"
down_revision = "d3f5f0469bdd"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.add_column("users", sa.Column("phone_e164", sa.String(length=20), nullable=True))
    op.add_column("users", sa.Column("phone_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("phone_hash", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("phone_digest", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("display_name", sa.String(length=80), nullable=True))

    # Backfill existing rows with deterministic placeholders to preserve uniqueness.
    op.execute(
        """
        UPDATE users
        SET phone_e164 = '+1' || SUBSTRING(TRANSLATE(MD5(id::text), 'abcdef', '123456') FROM 1 FOR 10)
        WHERE phone_e164 IS NULL
        """
    )

    op.execute(
        """
        UPDATE users
        SET phone_hash = ENCODE(HMAC(phone_e164, 'dev-pepper-change-me', 'sha256'), 'hex')
        WHERE phone_hash IS NULL
        """
    )

    op.execute(
        """
        UPDATE users
        SET phone_digest = ENCODE(DIGEST('v1:' || phone_e164, 'sha256'), 'hex')
        WHERE phone_digest IS NULL
        """
    )

    op.alter_column("users", "phone_e164", nullable=False)
    op.alter_column("users", "phone_hash", nullable=False)
    op.alter_column("users", "phone_digest", nullable=False)
    op.alter_column("users", "email", nullable=True)

    op.create_index(op.f("ix_users_phone_e164"), "users", ["phone_e164"], unique=True)
    op.create_index(op.f("ix_users_phone_hash"), "users", ["phone_hash"], unique=True)
    op.create_index(op.f("ix_users_phone_digest"), "users", ["phone_digest"], unique=True)

    op.add_column("invites", sa.Column("recipient_phone_e164", sa.String(length=20), nullable=True))
    op.add_column("invites", sa.Column("requester_id", sa.UUID(), nullable=True))
    op.create_index(op.f("ix_invites_recipient_phone_e164"), "invites", ["recipient_phone_e164"], unique=False)
    op.create_index(op.f("ix_invites_requester_id"), "invites", ["requester_id"], unique=False)
    op.create_foreign_key("fk_invites_requester_id_users", "invites", "users", ["requester_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_invites_requester_id_users", "invites", type_="foreignkey")
    op.drop_index(op.f("ix_invites_requester_id"), table_name="invites")
    op.drop_index(op.f("ix_invites_recipient_phone_e164"), table_name="invites")
    op.drop_column("invites", "requester_id")
    op.drop_column("invites", "recipient_phone_e164")

    op.drop_index(op.f("ix_users_phone_digest"), table_name="users")
    op.drop_index(op.f("ix_users_phone_hash"), table_name="users")
    op.drop_index(op.f("ix_users_phone_e164"), table_name="users")
    op.alter_column("users", "email", nullable=False)
    op.drop_column("users", "display_name")
    op.drop_column("users", "phone_digest")
    op.drop_column("users", "phone_hash")
    op.drop_column("users", "phone_verified_at")
    op.drop_column("users", "phone_e164")
