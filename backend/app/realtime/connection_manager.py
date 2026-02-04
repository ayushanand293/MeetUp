import json
from collections import defaultdict
from datetime import datetime
from uuid import UUID

from fastapi import WebSocket

from .schemas import PresenceEvent, PresencePayload, PresenceStatus


class ConnectionManager:
    def __init__(self):
        # Map session_id -> list of active WebSockets
        self.active_sessions: dict[UUID, list[WebSocket]] = defaultdict(list)
        # Map websocket -> user_id (for reverse lookup)
        self.ws_to_user: dict[WebSocket, UUID] = {}

    async def connect(self, session_id: UUID, user_id: UUID, websocket: WebSocket):
        await websocket.accept()
        self.active_sessions[session_id].append(websocket)
        self.ws_to_user[websocket] = user_id

        # Broadcast IO: ONLINE
        await self.broadcast_presence(session_id, user_id, PresenceStatus.ONLINE)

    async def disconnect(self, session_id: UUID, websocket: WebSocket):
        user_id = self.ws_to_user.get(websocket)

        if session_id in self.active_sessions:
            if websocket in self.active_sessions[session_id]:
                self.active_sessions[session_id].remove(websocket)
                if not self.active_sessions[session_id]:
                    del self.active_sessions[session_id]

        if websocket in self.ws_to_user:
            del self.ws_to_user[websocket]

        # Broadcast IO: OFFLINE
        if user_id:
            await self.broadcast_presence(session_id, user_id, PresenceStatus.OFFLINE)

    async def broadcast_presence(self, session_id: UUID, user_id: UUID, status: PresenceStatus):
        event = PresenceEvent(payload=PresencePayload(user_id=user_id, status=status, last_seen=datetime.utcnow()))
        await self.broadcast(session_id, event.model_dump_json(), exclude_user=user_id)

    async def broadcast(self, session_id: UUID, message: dict | str, exclude_user: UUID = None):
        """
        Broadcast a message to all users in the session.
        If exclude_user is provided, that user won't receive the message.
        """
        if session_id not in self.active_sessions:
            return

        formatted_msg = message if isinstance(message, str) else json.dumps(message)

        for connection in self.active_sessions[session_id]:
            # Check exclusion
            user_id = self.ws_to_user.get(connection)
            if exclude_user and user_id == exclude_user:
                continue

            try:
                await connection.send_text(formatted_msg)
            except Exception:
                # Handle broken pipes or disconnects gracefully
                # In a real app we might queue a disconnect task here
                pass


manager = ConnectionManager()
