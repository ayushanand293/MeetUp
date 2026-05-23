"""add destination fields

Revision ID: 7b4d2c1e9a30
Revises: c9a7b6f8e2d1
Create Date: 2026-05-01 00:00:00.000000

"""

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision = "7b4d2c1e9a30"
down_revision = "c9a7b6f8e2d1"
branch_labels = None
depends_on = None


DESTINATION_COLUMNS = (
    sa.Column("destination_name", sa.Text(), nullable=True),
    sa.Column("destination_address", sa.Text(), nullable=True),
    sa.Column("destination_lat", sa.Float(), nullable=True),
    sa.Column("destination_lon", sa.Float(), nullable=True),
    sa.Column("destination_provider", sa.Text(), nullable=True),
    sa.Column("destination_place_id", sa.Text(), nullable=True),
)


def upgrade() -> None:
    for table_name in ("meet_requests", "sessions"):
        for column in DESTINATION_COLUMNS:
            op.add_column(table_name, column.copy())


def downgrade() -> None:
    for table_name in ("sessions", "meet_requests"):
        for column_name in (
            "destination_place_id",
            "destination_provider",
            "destination_lon",
            "destination_lat",
            "destination_address",
            "destination_name",
        ):
            op.drop_column(table_name, column_name)
