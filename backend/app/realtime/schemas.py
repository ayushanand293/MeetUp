from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, Field


class EventType(StrEnum):
    # Client -> Server
    LOCATION_UPDATE = "location_update"
    END_SESSION = "end_session"

    # Server -> Client
    PEER_LOCATION = "peer_location"
    SESSION_ENDED = "session_ended"
    PRESENCE_UPDATE = "presence_update"
    ERROR = "error"


class PresenceStatus(StrEnum):
    ONLINE = "online"
    OFFLINE = "offline"


class LocationPayload(BaseModel):
    lat: float
    lon: float
    accuracy_m: float = 0.0
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    client_ts_ms: int | None = None


class LocationUpdateEvent(BaseModel):
    type: EventType = EventType.LOCATION_UPDATE
    payload: LocationPayload


class EndSessionPayload(BaseModel):
    reason: str


class EndSessionEvent(BaseModel):
    type: EventType = EventType.END_SESSION
    payload: EndSessionPayload


class PeerLocationPayload(LocationPayload):
    user_id: UUID


class PeerLocationEvent(BaseModel):
    type: EventType = EventType.PEER_LOCATION
    payload: PeerLocationPayload


class SessionEndedPayload(BaseModel):
    reason: str
    ended_at: datetime


class SessionEndedEvent(BaseModel):
    type: EventType = EventType.SESSION_ENDED
    payload: SessionEndedPayload


class PresencePayload(BaseModel):
    user_id: UUID
    status: PresenceStatus
    last_seen: datetime = Field(default_factory=datetime.utcnow)


class PresenceEvent(BaseModel):
    type: EventType = EventType.PRESENCE_UPDATE
    payload: PresencePayload


class ErrorPayload(BaseModel):
    code: str
    message: str


class ErrorEvent(BaseModel):
    type: EventType = EventType.ERROR
    payload: ErrorPayload
