"""
Tests for idempotency key support on critical REST endpoints.
"""

from dataclasses import dataclass
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from app.api.deps import get_current_user
from app.core.database import SessionLocal
from app.main import app
from app.models.meet_request import MeetRequest, RequestStatus
from app.models.session import Session as MeetSession
from app.models.session import SessionParticipant, SessionStatus
from app.models.user import User


@dataclass
class MockUser:
    """Mock user object for dependency override, avoids SQLAlchemy detachment issues."""
    id: UUID
    email: str
    profile_data: dict = None
    
    def __post_init__(self):
        if self.profile_data is None:
            self.profile_data = {}


def override_get_current_user_for_idem_test(user_id: UUID, user_email: str = None):
    """Create an override with a mock user to avoid detached instance errors."""
    def _get_current_user():
        return MockUser(id=user_id, email=user_email or "test@example.com")
    return _get_current_user
# Tests
def test_accept_request_idempotency_key_valid_uuid(client: TestClient, db):
    """Valid UUID idempotency key should be accepted."""
    # Create users and request in DB
    db = SessionLocal()
    test_user = User(email="idem_test_user_uuid@example.com")
    test_peer = User(email="idem_test_peer_uuid@example.com")
    db.add(test_user)
    db.add(test_peer)
    db.flush()
    
    req = MeetRequest(requester_id=test_user.id, receiver_id=test_peer.id, status=RequestStatus.PENDING)
    db.add(req)
    db.commit()
    req_id = str(req.id)
    peer_id = test_peer.id
    db.close()
    
    app.dependency_overrides[get_current_user] = override_get_current_user_for_idem_test(peer_id)
    
    try:
        idempotency_key = str(uuid4())
        response1 = client.post(
            f"/api/v1/requests/{req_id}/accept",
            headers={"Idempotency-Key": idempotency_key},
        )
        
        assert response1.status_code == 200
        assert response1.json()["status"] == "accepted"
        session_id_1 = response1.json()["session_id"]

        # Second request with same idempotency key should return same result
        response2 = client.post(
            f"/api/v1/requests/{req_id}/accept",
            headers={"Idempotency-Key": idempotency_key},
        )

        assert response2.status_code == 200
        assert response2.json()["status"] == "accepted"
        session_id_2 = response2.json()["session_id"]

        # Should return identical session_id (cached)
        assert session_id_1 == session_id_2
    finally:
        del app.dependency_overrides[get_current_user]


def test_accept_request_invalid_idempotency_key_format(client: TestClient, db):
    """Invalid UUID format in idempotency key should be rejected."""
    # Create users and request in DB
    db = SessionLocal()
    test_user = User(email="idem_test_user_invalid@example.com")
    test_peer = User(email="idem_test_peer_invalid@example.com")
    db.add(test_user)
    db.add(test_peer)
    db.flush()
    
    req = MeetRequest(requester_id=test_user.id, receiver_id=test_peer.id, status=RequestStatus.PENDING)
    db.add(req)
    db.commit()
    req_id = str(req.id)
    peer_id = test_peer.id
    db.close()
    
    app.dependency_overrides[get_current_user] = override_get_current_user_for_idem_test(peer_id)
    
    try:
        response = client.post(
            f"/api/v1/requests/{req_id}/accept",
            headers={"Idempotency-Key": "not-a-valid-uuid"},
        )

        assert response.status_code == 400
        assert "must be a valid UUID" in response.json()["detail"]
    finally:
        del app.dependency_overrides[get_current_user]


def test_accept_request_without_idempotency_key(client: TestClient, db):
    """Requests without idempotency key should work but not be cached."""
    # Create users and request in DB
    db = SessionLocal()
    test_user = User(email="idem_test_user_nokey@example.com")
    test_peer = User(email="idem_test_peer_nokey@example.com")
    db.add(test_user)
    db.add(test_peer)
    db.flush()
    
    req = MeetRequest(requester_id=test_user.id, receiver_id=test_peer.id, status=RequestStatus.PENDING)
    db.add(req)
    db.commit()
    req_id = str(req.id)
    peer_id = test_peer.id
    db.close()
    
    app.dependency_overrides[get_current_user] = override_get_current_user_for_idem_test(peer_id)
    
    try:
        response = client.post(f"/api/v1/requests/{req_id}/accept")

        assert response.status_code == 200
        assert response.json()["status"] == "accepted"
    finally:
        del app.dependency_overrides[get_current_user]


def test_end_session_idempotency_key(client: TestClient, db):
    """End session with idempotency key should be cached."""
    # Create users and session in DB
    db = SessionLocal()
    test_user = User(email="idem_test_user_end@example.com")
    test_peer = User(email="idem_test_peer_end@example.com")
    db.add(test_user)
    db.add(test_peer)
    db.flush()
    
    session = MeetSession(status=SessionStatus.ACTIVE)
    db.add(session)
    db.flush()

    p1 = SessionParticipant(session_id=session.id, user_id=test_user.id)
    p2 = SessionParticipant(session_id=session.id, user_id=test_peer.id)
    db.add(p1)
    db.add(p2)
    db.commit()
    session_id = str(session.id)
    user_id = test_user.id
    db.close()
    
    app.dependency_overrides[get_current_user] = override_get_current_user_for_idem_test(user_id)
    
    try:
        idempotency_key = str(uuid4())

        # First end
        response1 = client.post(
            f"/api/v1/sessions/{session_id}/end",
            json={"reason": "USER_INITIATED"},
            headers={"Idempotency-Key": idempotency_key},
        )

        assert response1.status_code == 200
        assert response1.json()["status"] == "ended"

        # Second end with same idempotency key should return cached result
        response2 = client.post(
            f"/api/v1/sessions/{session_id}/end",
            json={"reason": "USER_INITIATED"},
            headers={"Idempotency-Key": idempotency_key},
        )

        assert response2.status_code == 200
        assert response2.json()["status"] == "ended"
    finally:
        del app.dependency_overrides[get_current_user]


def test_create_session_from_request_idempotency_key(client: TestClient, db):
    """Create session from request with idempotency key should be cached."""
    # Create users and accepted request in DB
    db = SessionLocal()
    test_user = User(email="idem_test_user_create@example.com")
    test_peer = User(email="idem_test_peer_create@example.com")
    db.add(test_user)
    db.add(test_peer)
    db.flush()
    
    req = MeetRequest(requester_id=test_user.id, receiver_id=test_peer.id, status=RequestStatus.ACCEPTED)
    db.add(req)
    db.commit()
    req_id = str(req.id)
    user_id = test_user.id
    db.close()
    
    app.dependency_overrides[get_current_user] = override_get_current_user_for_idem_test(user_id)
    
    try:
        idempotency_key = str(uuid4())

        # First create
        response1 = client.post(
            f"/api/v1/sessions/from-request/{req_id}",
            headers={"Idempotency-Key": idempotency_key},
        )

        assert response1.status_code == 201
        session_id_1 = response1.json()["session_id"]

        # Second create with same idempotency key should return cached result
        response2 = client.post(
            f"/api/v1/sessions/from-request/{req_id}",
            headers={"Idempotency-Key": idempotency_key},
        )

        assert response2.status_code == 201
        session_id_2 = response2.json()["session_id"]

        # Should return same session_id (from cache)
        assert session_id_1 == session_id_2
    finally:
        del app.dependency_overrides[get_current_user]


def test_idempotency_key_different_keys_different_results(client: TestClient, db):
    """Different idempotency keys should create separate entries."""
    # Create users and two requests in DB
    db = SessionLocal()
    test_user = User(email="idem_test_user_diff@example.com")
    test_peer = User(email="idem_test_peer_diff@example.com")
    db.add(test_user)
    db.add(test_peer)
    db.flush()
    
    req1 = MeetRequest(requester_id=test_user.id, receiver_id=test_peer.id, status=RequestStatus.PENDING)
    req2 = MeetRequest(requester_id=test_user.id, receiver_id=test_peer.id, status=RequestStatus.PENDING)
    db.add(req1)
    db.add(req2)
    db.commit()
    req1_id = str(req1.id)
    req2_id = str(req2.id)
    peer_id = test_peer.id
    db.close()

    app.dependency_overrides[get_current_user] = override_get_current_user_for_idem_test(peer_id)
    
    try:
        key1 = str(uuid4())
        key2 = str(uuid4())

        # Accept first request with key1
        response1 = client.post(
            f"/api/v1/requests/{req1_id}/accept",
            headers={"Idempotency-Key": key1},
        )
        assert response1.status_code == 200
        session_id_1 = response1.json()["session_id"]

        # Accept second request with key2
        response2 = client.post(
            f"/api/v1/requests/{req2_id}/accept",
            headers={"Idempotency-Key": key2},
        )
        assert response2.status_code == 200
        session_id_2 = response2.json()["session_id"]

        # Session IDs should be different (different requests)
        assert session_id_1 != session_id_2
    finally:
        del app.dependency_overrides[get_current_user]
