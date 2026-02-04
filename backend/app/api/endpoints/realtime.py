import json
import logging
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from jwt import PyJWTError

from app.core.config import settings
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

    # 1. Authenticate (Manually verify JWT)
    try:
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

    try:
        while True:
            # 4. Receive Loop
            data = await websocket.receive_text()

            try:
                event_data = json.loads(data)
                event_type = event_data.get("type")

                if event_type == EventType.LOCATION_UPDATE:
                    location_event = LocationUpdateEvent(**event_data)

                    peer_event = PeerLocationEvent(
                        payload=PeerLocationPayload(user_id=user_id, **location_event.payload.model_dump())
                    )

                    # Broadcast to everyone in session EXCEPT sender
                    await manager.broadcast(session_uuid, peer_event.model_dump_json(), exclude_user=user_id)

            except Exception as e:
                logger.error(f"WebSocket Error: {e}", exc_info=True)
                # Send error back to client
                error_event = ErrorEvent(payload=ErrorPayload(code="INVALID_PAYLOAD", message=str(e)))
                await websocket.send_text(error_event.model_dump_json())

    except WebSocketDisconnect:
        await manager.disconnect(session_uuid, websocket)
