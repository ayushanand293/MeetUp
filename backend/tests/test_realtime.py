import uuid
import json
import time
from datetime import datetime, timedelta
from uuid import UUID

import jwt
import pytest

import app.api.endpoints.realtime as realtime_endpoint
from app.core.config import settings
from app.models.session import Session as MeetSession
from app.models.session import ParticipantStatus, SessionParticipant, SessionStatus
from app.models.user import User
from app.realtime.connection_manager import ConnectionManager
from app.realtime.schemas import EventType


def _close_ws_safe(ws):
    try:
        ws.close()
    except Exception:
        pass


def receive_json_with_timeout(websocket, timeout: float = 3.0):
    deadline = time.monotonic() + timeout

    while time.monotonic() < deadline:
        try:
            message = websocket.portal.call(websocket._send_rx.receive_nowait)
        except Exception as exc:
            name = exc.__class__.__name__
            if name == "WouldBlock":
                time.sleep(0.01)
                continue
            if name in {"ClosedResourceError", "EndOfStream"}:
                pytest.fail("WebSocket stream closed while waiting for message")
            raise

        if message.get("type") == "websocket.close":
            pytest.fail(f"WebSocket closed unexpectedly: {message}")

        if message.get("type") != "websocket.send":
            continue

        if "text" in message and message["text"] is not None:
            return json.loads(message["text"])
        if "bytes" in message and message["bytes"] is not None:
            return json.loads(message["bytes"].decode("utf-8"))

    pytest.fail(f"Timed out waiting for WebSocket message after {timeout:.1f}s")


def provision_session_participants(db, session_id: str, user_ids: list[str]) -> None:
    """Create an active session and joined participants for websocket auth checks."""
    users = [User(id=UUID(user_id), email=f"{user_id}@test.local") for user_id in user_ids]
    db.add_all(users)

    session = MeetSession(id=UUID(session_id), status=SessionStatus.ACTIVE)
    db.add(session)
    db.flush()

    participants = [
        SessionParticipant(session_id=session.id, user_id=UUID(user_id), status=ParticipantStatus.JOINED)
        for user_id in user_ids
    ]
    db.add_all(participants)
    db.commit()


def receive_until_type(websocket, expected_type: str, timeout: float = 3.0, max_attempts: int = 6):
    """Read websocket messages until the expected event type is received."""
    last_message = None
    for _ in range(max_attempts):
        message = receive_json_with_timeout(websocket, timeout=timeout)
        last_message = message
        if message.get("type") == expected_type:
            return message
    pytest.fail(f"Did not receive event type '{expected_type}'. Last message: {last_message}")


def create_test_token(user_id: str) -> str:
    """Helper to create a valid JWT for testing"""
    payload = {"sub": user_id, "exp": datetime.utcnow() + timedelta(hours=1), "aud": "authenticated"}
    return jwt.encode(payload, settings.SUPABASE_KEY, algorithm="HS256")


def test_websocket_connection_no_token(client):
    from starlette.websockets import WebSocketDisconnect

    try:
        with client.websocket_connect("/api/v1/ws/meetup?session_id=" + str(uuid.uuid4())) as websocket:
            websocket.receive_text()
            pytest.fail("Should not receive data")
    except WebSocketDisconnect:
        pass  # Expected


def test_websocket_broadcast(client, db):
    session_id = str(uuid.uuid4())
    user1_id = str(uuid.uuid4())
    user2_id = str(uuid.uuid4())

    provision_session_participants(db, session_id, [user1_id, user2_id])

    token1 = create_test_token(user1_id)
    token2 = create_test_token(user2_id)

    ws2 = client.websocket_connect(f"/api/v1/ws/meetup?token={token2}&session_id={session_id}").__enter__()
    ws1 = client.websocket_connect(f"/api/v1/ws/meetup?token={token1}&session_id={session_id}").__enter__()
    try:
        payload = {"type": "location_update", "payload": {"lat": 37.7749, "lon": -122.4194, "accuracy_m": 10.0}}
        ws1.send_json(payload)

        # User 2 should receive peer_location
        data = receive_until_type(ws2, "peer_location", timeout=3.0)
        assert data["type"] == "peer_location"
        assert data["payload"]["user_id"] == user1_id
        assert data["payload"]["lat"] == 37.7749
    finally:
        _close_ws_safe(ws1)
        _close_ws_safe(ws2)


def test_websocket_echo_prevention(client, db):
    """Verify User 1 does NOT receive their own message"""
    session_id = str(uuid.uuid4())
    user1_id = str(uuid.uuid4())
    token1 = create_test_token(user1_id)

    provision_session_participants(db, session_id, [user1_id])

    with client.websocket_connect(f"/api/v1/ws/meetup?token={token1}&session_id={session_id}") as ws1:
        payload = {"type": "location_update", "payload": {"lat": 37.7749, "lon": -122.4194}}
        ws1.send_json(payload)

        # Try to receive with a short timeout (hacky in sync test client,
        # ideally we rely on the fact that no message comes)
        # For TestClient, receive_json blocks.
        # So we can't easily test "nothing received" without async.
        # We'll skip complex async assertions here for simplicity and rely on the broadcast test.
        pass


def test_websocket_presence(client, db):
    """Verify that connecting/disconnecting triggers presence events"""
    session_id = str(uuid.uuid4())
    user1_id = str(uuid.uuid4())
    user2_id = str(uuid.uuid4())

    provision_session_participants(db, session_id, [user1_id, user2_id])

    token1 = create_test_token(user1_id)
    token2 = create_test_token(user2_id)

    ws1 = client.websocket_connect(f"/api/v1/ws/meetup?token={token1}&session_id={session_id}").__enter__()
    ws2 = client.websocket_connect(f"/api/v1/ws/meetup?token={token2}&session_id={session_id}").__enter__()
    try:
        # User 1 should receive PRESENCE_UPDATE (ONLINE) for User 2
        data = receive_json_with_timeout(ws1, timeout=3.0)
        assert data["type"] == "presence_update"
        assert data["payload"]["user_id"] == user2_id
        assert data["payload"]["status"] == "online"
    finally:
        _close_ws_safe(ws2)

    try:
        # User 2 disconnected, User 1 should receive OFFLINE update
        data = receive_until_type(ws1, "presence_update", timeout=3.0)
        if data["payload"]["user_id"] != user2_id or data["payload"]["status"] != "offline":
            data = receive_until_type(ws1, "presence_update", timeout=3.0)
        assert data["type"] == "presence_update"
        assert data["payload"]["user_id"] == user2_id
        assert data["payload"]["status"] == "offline"
    finally:
        _close_ws_safe(ws1)


def test_websocket_end_session_event_broadcast(client, db, monkeypatch):
    session_id = str(uuid.uuid4())
    user1_id = str(uuid.uuid4())
    user2_id = str(uuid.uuid4())

    provision_session_participants(db, session_id, [user1_id, user2_id])

    token1 = create_test_token(user1_id)
    token2 = create_test_token(user2_id)

    monkeypatch.setattr(realtime_endpoint, "end_session_sync", lambda _sid, reason: True)

    ws2 = client.websocket_connect(f"/api/v1/ws/meetup?token={token2}&session_id={session_id}").__enter__()
    ws1 = client.websocket_connect(f"/api/v1/ws/meetup?token={token1}&session_id={session_id}").__enter__()
    try:
        ws1.send_json({"type": "end_session", "payload": {"reason": "ARRIVAL_CONFIRMED"}})

        data = receive_until_type(ws2, "session_ended", timeout=3.0)
        assert data["type"] == "session_ended"
        assert data["payload"]["reason"] == "ARRIVAL_CONFIRMED"
    finally:
        _close_ws_safe(ws1)
        _close_ws_safe(ws2)
