import json
import logging
from datetime import datetime
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from jwt import PyJWTError
from sqlalchemy import text

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.metrics import (
    track_message_received,
    track_rate_limit_hit,
    track_session_ended,
    track_validation_error,
)
from app.core.proximity import adaptive_threshold_m, haversine_distance_m, should_auto_end
from app.core.redis import get_redis
from app.core.validation import validate_location_update
from app.models.session import ParticipantStatus, Session, SessionParticipant, SessionStatus
from app.realtime.connection_manager import manager
from app.realtime.schemas import (
    EndSessionEvent,
    ErrorEvent,
    ErrorPayload,
    EventType,
    LocationUpdateEvent,
    PeerLocationEvent,
    PeerLocationPayload,
    SessionEndedEvent,
    SessionEndedPayload,
)

logger = logging.getLogger(__name__)

# Rate limiting configuration
RATE_LIMIT_MESSAGES_PER_SEC = 10
RATE_LIMIT_WINDOW_SEC = 1

LOCATION_TTL_SECONDS = 120
PROXIMITY_STATE_TTL_SECONDS = 120
PROXIMITY_REQUIRED_CONSECUTIVE_UPDATES = 5
PROXIMITY_DWELL_SECONDS = 12.0

router = APIRouter()

POSTGIS_DISTANCE_SQL = text(
    """
    SELECT ST_DistanceSphere(
        ST_SetSRID(ST_MakePoint(:lon1, :lat1), 4326),
        ST_SetSRID(ST_MakePoint(:lon2, :lat2), 4326)
    )
    """
)


def _proximity_state_key(session_id: UUID, user_a: UUID, user_b: UUID) -> str:
    left, right = sorted([str(user_a), str(user_b)])
    return f"prox:{session_id}:{left}:{right}"


def _location_key(session_id: UUID, user_id: UUID) -> str:
    return f"loc:{session_id}:{user_id}"


def _proximity_lock_key(session_id: UUID) -> str:
    return f"prox_lock:{session_id}"


def _end_session_if_active(session_id: UUID, reason: str) -> bool:
    db = SessionLocal()
    try:
        session = db.query(Session).filter(Session.id == session_id).first()
        if not session or session.status != SessionStatus.ACTIVE:
            return False

        session.status = SessionStatus.ENDED
        session.end_reason = reason
        session.ended_at = datetime.utcnow()
        db.commit()
        return True
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _postgis_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float | None:
    db = SessionLocal()
    try:
        result = db.execute(
            POSTGIS_DISTANCE_SQL,
            {
                "lat1": lat1,
                "lon1": lon1,
                "lat2": lat2,
                "lon2": lon2,
            },
        ).scalar_one_or_none()
        if result is None:
            return None
        return float(result)
    except Exception:
        # Keep proximity logic resilient in environments where PostGIS is absent.
        return None
    finally:
        db.close()


def _active_participant_ids(session_id: UUID) -> list[UUID]:
    db = SessionLocal()
    try:
        rows = (
            db.query(SessionParticipant.user_id)
            .filter(
                SessionParticipant.session_id == session_id,
                SessionParticipant.status == ParticipantStatus.JOINED,
            )
            .all()
        )
        return [row[0] for row in rows]
    finally:
        db.close()


async def _evaluate_proximity_and_auto_end(
    session_id: UUID,
    sender_user_id: UUID,
    sender_payload,
    redis_client,
) -> bool:
    participant_ids = _active_participant_ids(session_id)
    if len(participant_ids) < 2:
        return False

    now_ts = datetime.utcnow().timestamp()

    for peer_user_id in participant_ids:
        if peer_user_id == sender_user_id:
            continue

        peer_key = _location_key(session_id, peer_user_id)
        peer_location_raw = await redis_client.get(peer_key)
        if not peer_location_raw:
            continue

        try:
            peer_location = json.loads(peer_location_raw)
            peer_lat = float(peer_location["lat"])
            peer_lon = float(peer_location["lon"])
            peer_acc = float(peer_location.get("accuracy_m", 30.0))
        except Exception:
            continue

        distance_m = _postgis_distance_m(
            sender_payload.lat,
            sender_payload.lon,
            peer_lat,
            peer_lon,
        )
        if distance_m is None:
            distance_m = haversine_distance_m(
                sender_payload.lat,
                sender_payload.lon,
                peer_lat,
                peer_lon,
            )
        threshold_m = adaptive_threshold_m(sender_payload.accuracy_m, peer_acc)
        within_threshold = distance_m <= threshold_m

        state_key = _proximity_state_key(session_id, sender_user_id, peer_user_id)
        if not within_threshold:
            await redis_client.delete(state_key)
            continue

        state = await redis_client.hgetall(state_key)
        previous_count = int(state.get("count", "0"))
        first_hit_ts = float(state.get("first_hit_ts", str(now_ts)))
        consecutive_count = previous_count + 1

        await redis_client.hset(
            state_key,
            mapping={
                "count": consecutive_count,
                "first_hit_ts": first_hit_ts,
                "last_hit_ts": now_ts,
            },
        )
        await redis_client.expire(state_key, PROXIMITY_STATE_TTL_SECONDS)

        if not should_auto_end(
            consecutive_hits=consecutive_count,
            first_hit_ts=first_hit_ts,
            now_ts=now_ts,
            min_consecutive_hits=PROXIMITY_REQUIRED_CONSECUTIVE_UPDATES,
            dwell_seconds=PROXIMITY_DWELL_SECONDS,
        ):
            continue

        lock_key = _proximity_lock_key(session_id)
        lock_acquired = await redis_client.set(lock_key, "1", ex=10, nx=True)
        if not lock_acquired:
            continue

        try:
            ended = _end_session_if_active(session_id, reason="PROXIMITY_REACHED")
        finally:
            await redis_client.delete(lock_key)

        if ended:
            await redis_client.delete(state_key)
            track_session_ended(str(session_id))
            ended_event = SessionEndedEvent(
                payload=SessionEndedPayload(reason="PROXIMITY_REACHED", ended_at=datetime.utcnow())
            )
            await manager.broadcast(session_id, ended_event.model_dump_json())
            logger.info(
                "Session %s auto-ended due to proximity between %s and %s",
                session_id,
                sender_user_id,
                peer_user_id,
            )
            return True

    return False


@router.websocket("/meetup")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Annotated[str | None, Query()] = None,
    session_id: Annotated[str | None, Query()] = None,
):
    """
    WebSocket endpoint for realtime location streaming.
    Client connects to: /api/v1/ws/meetup?token=<JWT>&session_id=<UUID>
    """
    if not token or not session_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # 1. Authenticate (Manually verify JWT — supports ES256 via JWKS and HS256 fallback)
    try:
        from app.api.deps import _get_jwks_keys

        unverified_header = jwt.get_unverified_header(token)
        alg = unverified_header.get("alg", "HS256")
        kid = unverified_header.get("kid")

        if alg == "ES256" and kid:
            keys = _get_jwks_keys()
            public_key = keys.get(kid)
            if not public_key:
                raise ValueError(f"Unknown key ID: {kid}")
            payload = jwt.decode(token, public_key, algorithms=["ES256"], options={"verify_aud": False})
        else:
            payload = jwt.decode(token, settings.SUPABASE_KEY, algorithms=["HS256"], options={"verify_aud": False})

        user_id = UUID(payload.get("sub"))
    except (PyJWTError, ValueError) as e:
        logger.warning(f"WebSocket Auth Failed: {e}")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # 2. Convert session_id to UUID
    try:
        session_uuid = UUID(session_id)
    except ValueError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # 3. Connect User to Session Room
    await manager.connect(session_uuid, user_id, websocket)

    # Track previous location for jump detection
    prev_location = None
    redis_client = await get_redis()

    try:
        while True:
            # 4. Receive Loop
            data = await websocket.receive_text()

            try:
                event_data = json.loads(data)
                event_type = event_data.get("type")
                track_message_received(event_type)

                if event_type == EventType.LOCATION_UPDATE:
                    # 5. Rate limiting check (1 update per 3 seconds per user, per session)
                    last_update_key = f"last_update:{session_uuid}:{user_id}"
                    last_update_ts = await redis_client.get(last_update_key)

                    if last_update_ts:
                        last_update = float(last_update_ts)
                        now = datetime.utcnow().timestamp()
                        if (now - last_update) < 3.0:  # Less than 3 seconds (1 update per 3s)
                            track_rate_limit_hit()
                            error_event = ErrorEvent(
                                payload=ErrorPayload(
                                    code="RATE_LIMIT_EXCEEDED",
                                    message="Maximum 1 location update per 3 seconds",
                                )
                            )
                            await websocket.send_text(error_event.model_dump_json())
                            continue

                    # 6. Parse and validate location update
                    try:
                        location_event = LocationUpdateEvent(**event_data)
                    except Exception as e:
                        track_validation_error("parse_error")
                        error_event = ErrorEvent(
                            payload=ErrorPayload(code="INVALID_PAYLOAD", message=f"Failed to parse: {str(e)}")
                        )
                        await websocket.send_text(error_event.model_dump_json())
                        continue

                    # 7. Validate location data
                    payload = location_event.payload
                    is_valid, error_msg = validate_location_update(
                        lat=payload.lat,
                        lon=payload.lon,
                        accuracy_m=payload.accuracy_m,
                        timestamp=payload.timestamp,
                        prev_location=prev_location,
                    )

                    if not is_valid:
                        track_validation_error("location_validation")
                        error_event = ErrorEvent(payload=ErrorPayload(code="INVALID_LOCATION", message=error_msg))
                        await websocket.send_text(error_event.model_dump_json())
                        logger.warning(f"Invalid location from {user_id}: {error_msg}")
                        continue

                    # 8. Update previous location for next iteration
                    prev_location = {
                        "lat": payload.lat,
                        "lon": payload.lon,
                        "timestamp": payload.timestamp,
                    }

                    # Persist latest location for fallback snapshots and proximity checks.
                    await redis_client.setex(
                        _location_key(session_uuid, user_id),
                        LOCATION_TTL_SECONDS,
                        json.dumps(
                            {
                                "lat": payload.lat,
                                "lon": payload.lon,
                                "accuracy_m": payload.accuracy_m,
                                "timestamp": payload.timestamp.isoformat(),
                            }
                        ),
                    )
                    await redis_client.setex(last_update_key, 30, str(datetime.utcnow().timestamp()))

                    auto_ended = await _evaluate_proximity_and_auto_end(
                        session_id=session_uuid,
                        sender_user_id=user_id,
                        sender_payload=payload,
                        redis_client=redis_client,
                    )
                    if auto_ended:
                        continue

                    # 9. Broadcast to session
                    peer_event = PeerLocationEvent(
                        payload=PeerLocationPayload(user_id=user_id, **location_event.payload.model_dump())
                    )

                    # Broadcast to everyone in session EXCEPT sender
                    await manager.broadcast(session_uuid, peer_event.model_dump_json(), exclude_user=user_id)

                elif event_type == EventType.END_SESSION:
                    # Allow explicit user confirmation (e.g., "I'm here") to close the session.
                    try:
                        end_event = EndSessionEvent(**event_data)
                    except Exception as e:
                        track_validation_error("parse_error")
                        error_event = ErrorEvent(
                            payload=ErrorPayload(code="INVALID_PAYLOAD", message=f"Failed to parse: {str(e)}")
                        )
                        await websocket.send_text(error_event.model_dump_json())
                        continue

                    reason = end_event.payload.reason or "USER_ACTION"
                    ended = _end_session_if_active(session_uuid, reason=reason)
                    if ended:
                        track_session_ended(str(session_uuid))
                        ended_event = SessionEndedEvent(
                            payload=SessionEndedPayload(reason=reason, ended_at=datetime.utcnow())
                        )
                        await manager.broadcast(session_uuid, ended_event.model_dump_json())
                        logger.info("Session %s ended by user %s with reason %s", session_uuid, user_id, reason)

            except Exception as e:
                logger.error(f"WebSocket Error: {e}", exc_info=True)
                # Send error back to client
                error_event = ErrorEvent(payload=ErrorPayload(code="INTERNAL_ERROR", message=str(e)))
                try:
                    await websocket.send_text(error_event.model_dump_json())
                except Exception:
                    pass

    except WebSocketDisconnect:
        await manager.disconnect(session_uuid, websocket)
