"""add_user_blocks_table

Revision ID: d3f5f0469bdd
Revises: 6a9d9f4d2b10
Create Date: 2026-04-25 18:18:35.894384

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd3f5f0469bdd'
down_revision = '6a9d9f4d2b10'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'user_blocks',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('blocker_id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('blocked_id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['blocked_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['blocker_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('blocker_id', 'blocked_id', name='uq_user_blocks_blocker_blocked')
    )


def downgrade() -> None:
    op.drop_table('user_blocks')
