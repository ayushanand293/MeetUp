import uuid
from hashlib import sha256


def _default_phone_e164() -> str:
    # Deterministic-enough random phone placeholder for non-OTP test fixtures.
    return "+1" + str(uuid.uuid4().int)[-10:]


def _default_phone_hash() -> str:
    return sha256(uuid.uuid4().hex.encode("utf-8")).hexdigest()


def _default_phone_digest() -> str:
    return sha256(f"v1:{uuid.uuid4().hex}".encode("utf-8")).hexdigest()

from sqlalchemy import Column, DateTime, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phone_e164 = Column(String(20), unique=True, index=True, nullable=False, default=_default_phone_e164)
    phone_verified_at = Column(DateTime(timezone=True), nullable=True)
    phone_hash = Column(String(64), unique=True, index=True, nullable=False, default=_default_phone_hash)
    phone_digest = Column(String(64), unique=True, index=True, nullable=False, default=_default_phone_digest)
    email = Column(String, unique=True, index=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    display_name = Column(String(80), nullable=True)
    profile_data = Column(JSONB, default={})
