import json
import logging
from typing import Annotated
from uuid import UUID
from datetime import datetime

import jwt
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from jwt import PyJWTError

from app.core.config import settings
from app.core.auth_sessions import enforce_active_session
from app.core.metrics import (
    track_location_propagation_latency_ms,
    track_message_received,
    track_rate_limit_hit,
    track_validation_error,
)
from app.core.rate_limit import check_rate_limit
from app.core.redis import get_redis
from app.core.scrub import scrub_sensitive
from app.core.validation import validate_location_update
from app.realtime.connection_manager import manager
from app.realtime.schemas import (
    ErrorEvent,
    ErrorPayload,
    EventType,
    LocationUpdateEvent,
    PeerLocationEvent,
    PeerLocationPayload,
    EndSessionEvent,
    SessionEndedEvent,
    SessionEndedPayload,
)

from fastapi.concurrency import run_in_threadpool
from app.api.endpoints.realtime_helpers import end_session_sync, is_session_participant_sync
from app.core.proximity import adaptive_threshold_m, haversine_distance_m, should_auto_end

logger = logging.getLogger(__name__)

# Rate limiting configuration
RATE_LIMIT_MESSAGES_PER_SEC = 10
RATE_LIMIT_WINDOW_SEC = 1

router = APIRouter()
LAST_LOCATION_TTL_SECONDS = 600


async def _store_last_known_location(redis_client, session_uuid: UUID, user_id: UUID, payload) -> None:
    loc_payload = payload.model_dump()
    loc_payload["timestamp"] = loc_payload["timestamp"].isoformat()
    await redis_client.setex(f"loc:{session_uuid}:{user_id}", LAST_LOCATION_TTL_SECONDS, json.dumps(loc_payload))


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
            payload = None
            secrets_to_try = [settings.SUPABASE_KEY]
            if settings.AUTH_JWT_SECRET:
                secrets_to_try.insert(0, settings.AUTH_JWT_SECRET)
            for decode_secret in secrets_to_try:
                if not decode_secret:
                    continue
                try:
                    payload = jwt.decode(token, decode_secret, algorithms=["HS256"], options={"verify_aud": False})
                    break
                except PyJWTError:
                    continue
            if payload is None:
                raise ValueError("Could not validate credentials")

        user_id = UUID(payload.get("sub"))
        if payload.get("iss") == "meetup-otp":
            try:
                enforce_active_session(str(user_id), payload.get("sid"))
            except Exception as exc:
                raise ValueError("Session invalidated") from exc
    except (PyJWTError, ValueError) as e:
        logger.warning(scrub_sensitive(f"WebSocket Auth Failed: {e}"))
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # 2. Convert session_id to UUID
    try:
        session_uuid = UUID(session_id)
    except ValueError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    is_participant = await run_in_threadpool(is_session_participant_sync, session_uuid, user_id)
    if not is_participant:
        logger.warning(scrub_sensitive(f"WebSocket Auth Failed: user {user_id} is not an active participant in session {session_uuid}"))
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

                    # 6. Short-window rate limit (e.g. 60 updates per minute)
                    # This protects against short bursts and keeps Redis traffic sane.
                    # Fail-closed is handled internally by check_rate_limit.
                    loc_limit_allowed = await check_rate_limit(
                        key_prefix="location_updates",
                        identifier=f"{session_uuid}:{user_id}",
                        limit=60,
                        window_seconds=60
                    )
                    if not loc_limit_allowed:
                        track_rate_limit_hit()
                        error_event = ErrorEvent(
                            payload=ErrorPayload(
                                code="RATE_LIMIT_EXCEEDED",
                                message="Too many updates. Maximum 60 per minute.",
                            )
                        )
                        await websocket.send_text(error_event.model_dump_json())
                        continue

                    # 6. Session-wide cap (e.g. max 2000 updates per session per user)
                    total_updates_key = f"total_updates:{session_uuid}:{user_id}"
                    total_updates = await redis_client.incr(total_updates_key)
                    if total_updates == 1:
                        # Set TTL for total updates (expire shortly after session TTL)
                        await redis_client.expire(total_updates_key, 7200) # 2 hours

                    if total_updates > 2000:
                        track_rate_limit_hit()
                        error_event = ErrorEvent(
                            payload=ErrorPayload(
                                code="SESSION_CAP_EXCEEDED",
                                message="Session limit reached. Maximum 2000 updates per session.",
                            )
                        )
                        await websocket.send_text(error_event.model_dump_json())
                        continue

                    # 7. Parse and validate location update
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
                        logger.warning(scrub_sensitive(f"Invalid location from {user_id}: {error_msg}"))
                        continue

                    # 8. Update previous location for next iteration
                    prev_location = {
                        "lat": payload.lat,
                        "lon": payload.lon,
                        "timestamp": payload.timestamp,
                    }

                    # 9. Broadcast to session
                    peer_event = PeerLocationEvent(
                        payload=PeerLocationPayload(user_id=user_id, **location_event.payload.model_dump())
                    )

                    # Broadcast to everyone in session EXCEPT sender
                    await manager.broadcast(session_uuid, peer_event.model_dump_json(), exclude_user=user_id)

                    # Emit location_propagation_latency_ms: time from payload timestamp to broadcast
                    _now_dt = datetime.utcnow()
                    _payload_ts = payload.timestamp
                    # payload.timestamp is already a validated datetime; make both naive for subtraction
                    if _payload_ts.tzinfo is not None:
                        _payload_ts = _payload_ts.replace(tzinfo=None)
                    _prop_latency_ms = max(0.0, (_now_dt - _payload_ts).total_seconds() * 1000)
                    track_location_propagation_latency_ms(
                        session_id=str(session_uuid),
                        user_id=str(user_id),
                        latency_ms=_prop_latency_ms,
                    )

                    now_ts = datetime.utcnow().timestamp()
                    await redis_client.setex(last_update_key, 3, str(now_ts))
                    
                    await _store_last_known_location(redis_client, session_uuid, user_id, payload)

                    # 11. Geo-Intelligence Proximity Check (Week 5)
                    cursor = 0
                    peer_id = None
                    while True:
                        cursor, keys = await redis_client.scan(cursor, match=f"loc:{session_uuid}:*")
                        for key in keys:
                            key_str = key.decode() if isinstance(key, bytes) else key
                            p_id_str = key_str.split(":")[-1]
                            if p_id_str != str(user_id):
                                peer_id = p_id_str
                                break
                        if peer_id or cursor == 0:
                            break
                    
                    if peer_id:
                        peer_raw = await redis_client.get(f"loc:{session_uuid}:{peer_id}")
                        if peer_raw:
                            try:
                                peer_loc = json.loads(peer_raw)
                                dist_m = haversine_distance_m(
                                    payload.lat, payload.lon,
                                    peer_loc["lat"], peer_loc["lon"]
                                )
                                threshold_m = adaptive_threshold_m(payload.accuracy_m, peer_loc.get("accuracy_m", 0.0))

                                if dist_m <= threshold_m:
                                    prox_hits_key = f"prox:{session_uuid}:hits"
                                    prox_ts_key = f"prox:{session_uuid}:first_ts"
                                    
                                    hits = await redis_client.incr(prox_hits_key)
                                    if hits == 1:
                                        await redis_client.setex(prox_ts_key, 120, str(now_ts))
                                        first_ts = now_ts
                                    else:
                                        first_ts_raw = await redis_client.get(prox_ts_key)
                                        first_ts = float(first_ts_raw) if first_ts_raw else now_ts

                                    if should_auto_end(hits, first_ts, now_ts):
                                        ended = await run_in_threadpool(end_session_sync, session_uuid, "PROXIMITY_REACHED")
                                        if ended:
                                            ended_evt = SessionEndedEvent(
                                                payload=SessionEndedPayload(
                                                    reason="PROXIMITY_REACHED",
                                                    ended_at=datetime.utcnow()
                                                )
                                            )
                                            await manager.broadcast(session_uuid, ended_evt.model_dump_json())
                                else:
                                    await redis_client.delete(f"prox:{session_uuid}:hits", f"prox:{session_uuid}:first_ts")
                            except Exception as e:
                                logger.error(f"Error during proximity check: {e}", exc_info=True)

                elif event_type == EventType.END_SESSION:
                    # Handle end session (triggers session end via DB and broadcasts)
                    logger.info(scrub_sensitive(f"User {user_id} sent end_session event"))
                    try:
                        end_event = EndSessionEvent(**event_data)
                        reason = end_event.payload.reason
                        ended = await run_in_threadpool(end_session_sync, session_uuid, reason)
                        if ended:
                            ended_evt = SessionEndedEvent(
                                payload=SessionEndedPayload(
                                    reason=reason,
                                    ended_at=datetime.utcnow()
                                )
                            )
                            await manager.broadcast(session_uuid, ended_evt.model_dump_json())
                        else:
                            error_event = ErrorEvent(
                                payload=ErrorPayload(
                                    code="SESSION_END_FAILED",
                                    message="Session is not active or could not be ended",
                                )
                            )
                            await websocket.send_text(error_event.model_dump_json())
                    except Exception as e:
                        logger.error(f"Error handling end_session: {e}")

            except Exception as e:
                logger.error(scrub_sensitive(f"WebSocket Error: {e}"), exc_info=True)
                # Send error back to client
                error_event = ErrorEvent(payload=ErrorPayload(code="INTERNAL_ERROR", message=str(e)))
                try:
                    await websocket.send_text(error_event.model_dump_json())
                except Exception:
                    pass

    except WebSocketDisconnect:
        await manager.disconnect(session_uuid, websocket)
