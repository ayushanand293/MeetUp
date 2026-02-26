"""WebSocket connection manager with Redis pub/sub for multi-instance support."""

import json
import logging
import asyncio
from collections import defaultdict
from datetime import datetime
from uuid import UUID

import redis.asyncio as redis
from fastapi import WebSocket

from app.core.redis import get_redis
from app.core.metrics import track_ws_connection_open, track_ws_connection_close, track_message_broadcasted
from .schemas import PresenceEvent, PresencePayload, PresenceStatus

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections with Redis pub/sub for multi-instance support.
    
    Architecture:
    - Local: ws_to_user dict + active_connections (per-instance)
    - Distributed: Redis pub/sub channel per session (cross-instance)
    
    Flow:
    1. Client connects → register in active_connections + subscribe to Redis channel
    2. Client sends message → broadcast to Redis channel
    3. Redis publishes to all instances subscribed to that channel
    4. Each instance receives and forwards to local WebSockets
    """

    def __init__(self):
        # Local per-instance state
        self.active_connections: dict[UUID, set[WebSocket]] = defaultdict(set)
        self.ws_to_user: dict[WebSocket, UUID] = {}
        
        # Redis pub/sub subscriptions (one per session)
        self.pubsub_subscriptions: dict[UUID, redis.client.PubSub] = {}
        
        # Background listener tasks
        self._listener_tasks: dict[UUID, asyncio.Task] = {}

    async def connect(self, session_id: UUID, user_id: UUID, websocket: WebSocket):
        """Accept WebSocket connection and subscribe to session channel."""
        await websocket.accept()
        
        # Register local connection
        self.active_connections[session_id].add(websocket)
        self.ws_to_user[websocket] = user_id
        
        logger.info(f"User {user_id} connected to session {session_id}")
        track_ws_connection_open(str(session_id))

        # Subscribe to Redis channel for this session (if not already subscribed)
        if session_id not in self.pubsub_subscriptions:
            await self._subscribe_to_session(session_id)

        # Broadcast presence: user is ONLINE
        await self.broadcast_presence(session_id, user_id, PresenceStatus.ONLINE)

    async def disconnect(self, session_id: UUID, websocket: WebSocket):
        """Disconnect WebSocket and clean up."""
        user_id = self.ws_to_user.get(websocket)

        # Unregister local connection
        if session_id in self.active_connections:
            self.active_connections[session_id].discard(websocket)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]
                # Unsubscribe from Redis when no local connections left
                await self._unsubscribe_from_session(session_id)

        if websocket in self.ws_to_user:
            del self.ws_to_user[websocket]

        logger.info(f"User {user_id} disconnected from session {session_id}")
        track_ws_connection_close(str(session_id))

        # Broadcast presence: user is OFFLINE
        if user_id:
            await self.broadcast_presence(session_id, user_id, PresenceStatus.OFFLINE)

    async def broadcast(self, session_id: UUID, message: dict | str, exclude_user: UUID = None) -> None:
        """Broadcast message to all users in session via Redis pub/sub.
        
        Multi-instance safe: publishes to Redis channel, which all instances receive.
        """
        if isinstance(message, dict):
            message = json.dumps(message)

        # Publish to Redis channel (all instances subscribed will receive)
        redis_client = await get_redis()
        await redis_client.publish(f"session:{session_id}", message)

        track_message_broadcasted()

    async def broadcast_presence(self, session_id: UUID, user_id: UUID, status: PresenceStatus):
        """Broadcast presence update to session."""
        event = PresenceEvent(payload=PresencePayload(user_id=user_id, status=status, last_seen=datetime.utcnow()))
        await self.broadcast(session_id, event.model_dump_json(), exclude_user=user_id)

    async def _subscribe_to_session(self, session_id: UUID):
        """Subscribe this instance to session's Redis channel."""
        redis_client = await get_redis()
        pubsub = redis_client.pubsub()
        
        channel = f"session:{session_id}"
        await pubsub.subscribe(channel)
        self.pubsub_subscriptions[session_id] = pubsub
        
        logger.info(f"Subscribed to Redis channel: {channel}")
        
        # Start listening for messages from Redis in background
        task = asyncio.create_task(self._listen_redis_messages(session_id, pubsub))
        self._listener_tasks[session_id] = task

    async def _unsubscribe_from_session(self, session_id: UUID):
        """Unsubscribe from session's Redis channel when no local connections remain."""
        if session_id in self.pubsub_subscriptions:
            pubsub = self.pubsub_subscriptions[session_id]
            channel = f"session:{session_id}"
            await pubsub.unsubscribe(channel)
            await pubsub.close()
            del self.pubsub_subscriptions[session_id]
            
            logger.info(f"Unsubscribed from Redis channel: {channel}")
        
        # Cancel listener task if running
        if session_id in self._listener_tasks:
            task = self._listener_tasks[session_id]
            task.cancel()
            del self._listener_tasks[session_id]

    async def _listen_redis_messages(self, session_id: UUID, pubsub: redis.client.PubSub):
        """Listen for messages from Redis and forward to local WebSockets."""
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    # Received a message from another instance or this instance
                    data = message["data"]
                    
                    # Forward to all local connections in this session
                    await self._forward_to_local_connections(session_id, data)
        except asyncio.CancelledError:
            logger.info(f"Redis listener for session {session_id} cancelled")
        except Exception as e:
            logger.error(f"Error listening to Redis channel for {session_id}: {e}")

    async def _forward_to_local_connections(self, session_id: UUID, message: str):
        """Forward a message to all local connections in a session."""
        if session_id not in self.active_connections:
            return

        # Make a copy to avoid "Set changed size during iteration" error
        connections_copy = list(self.active_connections[session_id])
        
        # Send to all local WebSockets
        dead_connections = []
        for websocket in connections_copy:
            try:
                await websocket.send_text(message)
            except Exception as e:
                logger.warning(f"Failed to send message to WebSocket: {e}")
                dead_connections.append(websocket)

        # Clean up dead connections
        for ws in dead_connections:
            self.active_connections[session_id].discard(ws)

    def get_local_session_user_count(self, session_id: UUID) -> int:
        """Get number of local WebSocket connections in a session."""
        return len(self.active_connections.get(session_id, set()))


# Global manager instance
manager = ConnectionManager()
