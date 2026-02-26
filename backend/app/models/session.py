import enum
import uuid

from sqlalchemy import Column, DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class SessionStatus(enum.StrEnum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"


class ParticipantStatus(enum.StrEnum):
    JOINED = "JOINED"
    LEFT = "LEFT"


class Session(Base):
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status = Column(Enum(SessionStatus), default=SessionStatus.PENDING)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)
    end_reason = Column(String, nullable=True)

    participants = relationship("SessionParticipant", back_populates="session")


class SessionParticipant(Base):
    __tablename__ = "session_participants"

    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    status = Column(Enum(ParticipantStatus), default=ParticipantStatus.JOINED)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("Session", back_populates="participants")
    user = relationship("User")
