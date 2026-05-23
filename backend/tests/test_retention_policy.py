import uuid
from datetime import datetime, timedelta

import jwt
from sqlalchemy import text

from app.core.config import settings
from app.core.database import SessionLocal
from app.api.endpoints.realtime import LAST_LOCATION_TTL_SECONDS, _store_last_known_location
from app.models.meet_request import MeetRequest
from app.models.session import ParticipantStatus, Session as MeetSession, SessionParticipant, SessionStatus
from app.models.user import User
import app.worker.session_cleanup as session_cleanup


def _token_for(user_id: uuid.UUID, email: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "aud": "authenticated",
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    return jwt.encode(payload, settings.SUPABASE_KEY, algorithm="HS256")


def test_realtime_location_is_redis_only_with_ttl(db):
    session_id = uuid.uuid4()
    user_id = uuid.uuid4()
    baseline_analytics = db.execute(text("SELECT COUNT(*) FROM analytics_events")).scalar_one()
    baseline_audit = db.execute(text("SELECT COUNT(*) FROM audit_events")).scalar_one()

    class DummyPayload:
        def __init__(self):
            self.lat = 37.7749
            self.lon = -122.4194
            self.accuracy_m = 10.0
            self.timestamp = datetime.utcnow()

        def model_dump(self):
            return {
                "lat": self.lat,
                "lon": self.lon,
                "accuracy_m": self.accuracy_m,
                "timestamp": self.timestamp,
            }

    payload = DummyPayload()

    class FakeRedis:
        def __init__(self):
            self.calls = []

        async def setex(self, key, ttl, value):
            self.calls.append((key, ttl, value))

    fake_redis = FakeRedis()
    asyncio_run(_store_last_known_location(fake_redis, session_id, user_id, payload))

    assert fake_redis.calls
    key, ttl, stored = fake_redis.calls[0]
    assert key == f"loc:{session_id}:{user_id}"
    assert ttl == LAST_LOCATION_TTL_SECONDS == 600
    assert '"lat": 37.7749' in stored

    assert db.execute(text("SELECT COUNT(*) FROM analytics_events")).scalar_one() == baseline_analytics
    assert db.execute(text("SELECT COUNT(*) FROM audit_events")).scalar_one() == baseline_audit


def test_retention_cleanup_purges_old_metadata(db):
    user = User(id=uuid.uuid4(), email="retention_old@example.com")
    peer = User(id=uuid.uuid4(), email="retention_peer@example.com")
    db.add_all([user, peer])
    db.flush()

    old_session = MeetSession(status=SessionStatus.ENDED)
    old_session.ended_at = datetime.utcnow() - timedelta(days=31)
    recent_session = MeetSession(status=SessionStatus.ENDED)
    recent_session.ended_at = datetime.utcnow() - timedelta(days=5)
    old_request = MeetRequest(
        requester_id=user.id,
        receiver_id=peer.id,
        created_at=datetime.utcnow() - timedelta(days=31),
    )
    db.add_all([old_session, recent_session, old_request])
    db.flush()
    old_session_id = old_session.id
    recent_session_id = recent_session.id
    db.add_all(
        [
            SessionParticipant(session_id=old_session_id, user_id=user.id, status=ParticipantStatus.LEFT),
            SessionParticipant(session_id=recent_session_id, user_id=user.id, status=ParticipantStatus.LEFT),
        ]
    )
    db.commit()

    class FakeRedis:
        async def scan(self, cursor, match=None):
            return 0, []

        async def delete(self, *keys):
            return len(keys)

    fake_redis = FakeRedis()

    async def fake_get_redis():
        return fake_redis

    original_get_redis = session_cleanup.get_redis
    session_cleanup.get_redis = fake_get_redis
    try:
        result = asyncio_run(session_cleanup.purge_retention_records(session_retention_days=30, request_retention_days=30))
    finally:
        session_cleanup.get_redis = original_get_redis

    assert result["sessions_deleted"] >= 1
    assert result["requests_deleted"] >= 1

    refreshed = SessionLocal()
    try:
        assert refreshed.query(MeetSession).filter(MeetSession.id == old_session_id).first() is None
        assert refreshed.query(MeetSession).filter(MeetSession.id == recent_session_id).first() is not None
    finally:
        refreshed.close()


def asyncio_run(coro):
    import asyncio

    return asyncio.run(coro)
