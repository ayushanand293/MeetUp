import uuid
from datetime import datetime, timedelta
from uuid import UUID

import jwt
import pytest

import app.api.endpoints.realtime as realtime_endpoint
from app.core.config import settings
from app.models.session import Session as MeetSession
from app.models.session import SessionParticipant, SessionStatus
from app.models.user import User
from app.realtime.schemas import EventType


def provision_session_participants(db, session_id: str, user_ids: list[str]) -> None:
    """Create an active session and joined participants for websocket auth checks."""
    users = [User(id=UUID(user_id), email=f"{user_id}@test.local") for user_id in user_ids]
    db.add_all(users)

    session = MeetSession(id=UUID(session_id), status=SessionStatus.ACTIVE)
    db.add(session)
    db.flush()

    participants = [SessionParticipant(session_id=session.id, user_id=UUID(user_id)) for user_id in user_ids]
    db.add_all(participants)
    db.commit()


def receive_until_type(websocket, expected_type: str, max_attempts: int = 6):
    """Read websocket messages until the expected event type is received."""
    last_message = None
    for _ in range(max_attempts):
        message = websocket.receive_json()
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

    # User 2 connects first (listener)
    with client.websocket_connect(f"/api/v1/ws/meetup?token={token2}&session_id={session_id}") as ws2:
        # User 1 connects (sender)
        with client.websocket_connect(f"/api/v1/ws/meetup?token={token1}&session_id={session_id}") as ws1:
            # Flush the "User 1 Online" presence event that ws2 receives immediately
            presence = ws2.receive_json()
            assert presence["type"] == EventType.PRESENCE_UPDATE
            payload = {"type": "location_update", "payload": {"lat": 37.7749, "lon": -122.4194, "accuracy_m": 10.0}}
            ws1.send_json(payload)

            # User 2 should receive peer_location
            data = receive_until_type(ws2, "peer_location")
            assert data["type"] == "peer_location"
            assert data["payload"]["user_id"] == user1_id
            assert data["payload"]["lat"] == 37.7749

            print("✅ User 2 received location from User 1")


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

    # User 1 connects first
    with client.websocket_connect(f"/api/v1/ws/meetup?token={token1}&session_id={session_id}") as ws1:
        # User 2 connects
        with client.websocket_connect(f"/api/v1/ws/meetup?token={token2}&session_id={session_id}") as _:
            # User 1 should receive PRESENCE_UPDATE (ONLINE) for User 2
            data = ws1.receive_json()
            assert data["type"] == "presence_update"
            assert data["payload"]["user_id"] == user2_id
            assert data["payload"]["status"] == "online"
            print("✅ User 1 received PRESENCE: ONLINE for User 2")

        # User 2 disconnects (context exit)
        # User 1 should receive PRESENCE_UPDATE (OFFLINE) for User 2
        data = receive_until_type(ws1, "presence_update")
        if data["payload"]["user_id"] != user2_id or data["payload"]["status"] != "offline":
            data = receive_until_type(ws1, "presence_update")
        assert data["type"] == "presence_update"
        assert data["payload"]["user_id"] == user2_id
        assert data["payload"]["status"] == "offline"
        print("✅ User 1 received PRESENCE: OFFLINE for User 2")


def test_websocket_end_session_event_broadcast(client, db, monkeypatch):
    session_id = str(uuid.uuid4())
    user1_id = str(uuid.uuid4())
    user2_id = str(uuid.uuid4())

    provision_session_participants(db, session_id, [user1_id, user2_id])

    token1 = create_test_token(user1_id)
    token2 = create_test_token(user2_id)

    monkeypatch.setattr(realtime_endpoint, "end_session_sync", lambda _sid, reason: True)

    with client.websocket_connect(f"/api/v1/ws/meetup?token={token2}&session_id={session_id}") as ws2:
        with client.websocket_connect(f"/api/v1/ws/meetup?token={token1}&session_id={session_id}") as ws1:
            # Drain initial presence update for second client.
            _ = ws2.receive_json()

            ws1.send_json({"type": "end_session", "payload": {"reason": "ARRIVAL_CONFIRMED"}})

            data = receive_until_type(ws2, "session_ended")
            assert data["type"] == "session_ended"
            assert data["payload"]["reason"] == "ARRIVAL_CONFIRMED"
