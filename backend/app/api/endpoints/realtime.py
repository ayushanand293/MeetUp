import json
import logging
from datetime import datetime
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from jwt import PyJWTError

from app.core.config import settings
from app.core.redis import get_redis
from app.core.validation import validate_location_update
from app.core.metrics import (
    track_message_received,
    track_rate_limit_hit,
    track_validation_error,
)
from app.realtime.connection_manager import manager
from app.realtime.schemas import (
    ErrorEvent,
    ErrorPayload,
    EventType,
    LocationUpdateEvent,
    PeerLocationEvent,
    PeerLocationPayload,
)

logger = logging.getLogger(__name__)

# Rate limiting configuration
RATE_LIMIT_MESSAGES_PER_SEC = 10
RATE_LIMIT_WINDOW_SEC = 1

router = APIRouter()


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
                    # 5. Rate limiting check
                    rate_limit_key = f"{session_uuid}:{user_id}"
                    count = await redis_client.incr(f"ratelimit:{rate_limit_key}")
                    
                    if count == 1:
                        # First increment in window, set TTL
                        await redis_client.expire(f"ratelimit:{rate_limit_key}", RATE_LIMIT_WINDOW_SEC)
                    
                    if count > RATE_LIMIT_MESSAGES_PER_SEC:
                        track_rate_limit_hit()
                        error_event = ErrorEvent(
                            payload=ErrorPayload(
                                code="RATE_LIMIT_EXCEEDED",
                                message=f"Max {RATE_LIMIT_MESSAGES_PER_SEC} messages per second"
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
                        error_event = ErrorEvent(
                            payload=ErrorPayload(code="INVALID_LOCATION", message=error_msg)
                        )
                        await websocket.send_text(error_event.model_dump_json())
                        logger.warning(f"Invalid location from {user_id}: {error_msg}")
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

                elif event_type == EventType.END_SESSION:
                    # Handle end session (could trigger session end via API)
                    logger.info(f"User {user_id} sent end_session event")
                    pass

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
