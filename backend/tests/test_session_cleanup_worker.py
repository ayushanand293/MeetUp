import asyncio
import json
import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import text

from app.core.database import SessionLocal
from app.core.redis import get_redis
from app.models.session import ParticipantStatus, Session, SessionParticipant, SessionStatus
from app.models.user import User
from app.worker.session_cleanup import expire_stale_sessions


@pytest.fixture(scope="module")
def db_setup():
    db = SessionLocal()
    try:
        db.execute(text("TRUNCATE TABLE users, meet_requests, sessions, session_participants CASCADE"))

        user1 = User(id=uuid.uuid4(), email="cleanup_u1@example.com")
        user2 = User(id=uuid.uuid4(), email="cleanup_u2@example.com")
        db.add_all([user1, user2])

        stale_session = Session(status=SessionStatus.ACTIVE)
        fresh_session = Session(status=SessionStatus.ACTIVE)
        db.add_all([stale_session, fresh_session])
        db.flush()

        db.add_all(
            [
                SessionParticipant(session_id=stale_session.id, user_id=user1.id, status=ParticipantStatus.JOINED),
                SessionParticipant(session_id=stale_session.id, user_id=user2.id, status=ParticipantStatus.JOINED),
                SessionParticipant(session_id=fresh_session.id, user_id=user1.id, status=ParticipantStatus.JOINED),
                SessionParticipant(session_id=fresh_session.id, user_id=user2.id, status=ParticipantStatus.JOINED),
            ]
        )

        db.commit()
        yield {
            "user1_id": user1.id,
            "user2_id": user2.id,
            "stale_session_id": stale_session.id,
            "fresh_session_id": fresh_session.id,
        }
    finally:
        db.close()


async def _seed_redis_locations(state):
    redis_client = await get_redis()

    stale_ts = (datetime.utcnow() - timedelta(minutes=12)).isoformat()
    fresh_ts = datetime.utcnow().isoformat()

    stale_key = f"loc:{state['stale_session_id']}:{state['user1_id']}"
    fresh_key = f"loc:{state['fresh_session_id']}:{state['user1_id']}"

    await redis_client.setex(
        stale_key,
        120,
        json.dumps({"lat": 12.9716, "lon": 77.5946, "accuracy_m": 10.0, "timestamp": stale_ts}),
    )
    await redis_client.setex(
        fresh_key,
        120,
        json.dumps({"lat": 12.9762, "lon": 77.6033, "accuracy_m": 8.0, "timestamp": fresh_ts}),
    )

    # Seed extra keys to ensure cleanup deletes related session data.
    await redis_client.setex(f"prox:{state['stale_session_id']}:a:b", 120, "1")
    await redis_client.setex(f"last_update:{state['stale_session_id']}:{state['user1_id']}", 120, "123")


async def _get_redis_value(key: str):
    redis_client = await get_redis()
    return await redis_client.get(key)


def test_expire_stale_sessions_and_cleanup(db_setup):
    state = db_setup

    asyncio.run(_seed_redis_locations(state))

    result = asyncio.run(expire_stale_sessions(stale_after_minutes=5))
    assert result["sessions_scanned"] >= 2
    assert result["sessions_expired"] >= 1

    db = SessionLocal()
    try:
        stale_session = db.query(Session).filter(Session.id == state["stale_session_id"]).first()
        fresh_session = db.query(Session).filter(Session.id == state["fresh_session_id"]).first()

        assert stale_session is not None
        assert stale_session.status == SessionStatus.ENDED
        assert stale_session.end_reason == "EXPIRED"

        assert fresh_session is not None
        assert fresh_session.status == SessionStatus.ACTIVE
    finally:
        db.close()

    stale_loc_key = f"loc:{state['stale_session_id']}:{state['user1_id']}"
    stale_prox_key = f"prox:{state['stale_session_id']}:a:b"
    fresh_loc_key = f"loc:{state['fresh_session_id']}:{state['user1_id']}"

    assert asyncio.run(_get_redis_value(stale_loc_key)) is None
    assert asyncio.run(_get_redis_value(stale_prox_key)) is None
    assert asyncio.run(_get_redis_value(fresh_loc_key)) is not None
