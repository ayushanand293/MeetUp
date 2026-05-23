"""Session cleanup worker jobs."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from uuid import UUID

from app.core.database import SessionLocal
from app.core.metrics import track_session_ended
from app.core.redis import get_redis
from app.models.meet_request import MeetRequest
from app.models.session import ParticipantStatus, Session, SessionParticipant, SessionStatus

DEFAULT_STALE_AFTER_MINUTES = 5
SESSION_RETENTION_DAYS = 30
REQUEST_RETENTION_DAYS = 30


def _parse_iso_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        # Accept both aware and naive timestamp payloads.
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


async def _cleanup_session_keys(redis_client, session_id: UUID) -> int:
    patterns = [
        f"loc:{session_id}:*",
        f"prox:{session_id}:*",
        f"last_update:{session_id}:*",
        f"presence:{session_id}:*",
        f"session:{session_id}:*",
        f"prox_lock:{session_id}",
    ]

    deleted = 0
    for pattern in patterns:
        cursor = 0
        while True:
            cursor, keys = await redis_client.scan(cursor, match=pattern)
            if keys:
                deleted += await redis_client.delete(*keys)
            if cursor == 0:
                break
    return deleted


async def expire_stale_sessions(stale_after_minutes: int = DEFAULT_STALE_AFTER_MINUTES) -> dict[str, int]:
    """Expire active sessions with no recent location updates and cleanup Redis keys."""
    now = datetime.utcnow()
    stale_cutoff = now - timedelta(minutes=stale_after_minutes)

    db = SessionLocal()
    redis_client = await get_redis()

    sessions_scanned = 0
    sessions_expired = 0
    redis_keys_deleted = 0

    try:
        active_sessions = db.query(Session).filter(Session.status == SessionStatus.ACTIVE).all()

        for session in active_sessions:
            sessions_scanned += 1

            participant_rows = (
                db.query(SessionParticipant.user_id)
                .filter(
                    SessionParticipant.session_id == session.id,
                    SessionParticipant.status == ParticipantStatus.JOINED,
                )
                .all()
            )

            participant_ids = [row[0] for row in participant_rows]
            if not participant_ids:
                session.status = SessionStatus.ENDED
                session.end_reason = "EXPIRED"
                session.ended_at = now
                sessions_expired += 1
                track_session_ended(str(session.id))
                redis_keys_deleted += await _cleanup_session_keys(redis_client, session.id)
                continue

            latest_seen: datetime | None = None
            for participant_id in participant_ids:
                payload = await redis_client.get(f"loc:{session.id}:{participant_id}")
                if not payload:
                    continue
                try:
                    location_data = json.loads(payload)
                except Exception:
                    continue

                ts = _parse_iso_timestamp(location_data.get("timestamp"))
                if ts is None:
                    continue
                if latest_seen is None or ts > latest_seen:
                    latest_seen = ts

            is_stale = latest_seen is None or latest_seen < stale_cutoff
            if not is_stale:
                continue

            session.status = SessionStatus.ENDED
            session.end_reason = "EXPIRED"
            session.ended_at = now
            sessions_expired += 1
            track_session_ended(str(session.id))
            redis_keys_deleted += await _cleanup_session_keys(redis_client, session.id)

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    return {
        "sessions_scanned": sessions_scanned,
        "sessions_expired": sessions_expired,
        "redis_keys_deleted": redis_keys_deleted,
    }


async def purge_retention_records(
    session_retention_days: int = SESSION_RETENTION_DAYS,
    request_retention_days: int = REQUEST_RETENTION_DAYS,
) -> dict[str, int]:
    """Delete ended sessions and stale requests older than the retention window."""
    now = datetime.utcnow()
    session_cutoff = now - timedelta(days=session_retention_days)
    request_cutoff = now - timedelta(days=request_retention_days)

    db = SessionLocal()
    redis_client = await get_redis()

    sessions_deleted = 0
    requests_deleted = 0
    redis_keys_deleted = 0

    try:
        old_sessions = (
            db.query(Session)
            .filter(Session.status == SessionStatus.ENDED, Session.ended_at.isnot(None), Session.ended_at < session_cutoff)
            .all()
        )

        for session in old_sessions:
            redis_keys_deleted += await _cleanup_session_keys(redis_client, session.id)
            db.query(SessionParticipant).filter(SessionParticipant.session_id == session.id).delete(synchronize_session=False)
            db.query(Session).filter(Session.id == session.id).delete(synchronize_session=False)
            sessions_deleted += 1

        requests_deleted = (
            db.query(MeetRequest)
            .filter(MeetRequest.created_at.isnot(None), MeetRequest.created_at < request_cutoff)
            .delete(synchronize_session=False)
        )

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    return {
        "sessions_deleted": sessions_deleted,
        "requests_deleted": requests_deleted,
        "redis_keys_deleted": redis_keys_deleted,
    }
