from datetime import datetime, timedelta
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.api import deps
from app.core.database import SessionLocal
from app.main import app
from app.models.user import User
from app.models.user_block import UserBlock
from app.models.meet_request import MeetRequest, RequestStatus
from app.models.session import Session as MeetSession, SessionStatus, SessionParticipant, ParticipantStatus

# Mock Users
USER_A_ID = uuid.uuid4()
USER_B_ID = uuid.uuid4()
USER_C_ID = uuid.uuid4()

_current_auth_user_id = USER_A_ID

def get_current_user_override():
    db = SessionLocal()
    u = db.query(User).filter(User.id == _current_auth_user_id).first()
    db.close()
    return u

@pytest.fixture(scope="function", autouse=True)
def auth_override():
    app.dependency_overrides[deps.get_current_user] = get_current_user_override
    yield
    if deps.get_current_user in app.dependency_overrides:
        del app.dependency_overrides[deps.get_current_user]

@pytest.fixture(scope="function")
def setup_users():
    db = SessionLocal()
    db.execute(text("TRUNCATE TABLE users, meet_requests, sessions, session_participants CASCADE"))
    
    u_a = User(id=USER_A_ID, email="a@example.com")
    u_b = User(id=USER_B_ID, email="b@example.com")
    u_c = User(id=USER_C_ID, email="c@example.com")
    db.add_all([u_a, u_b, u_c])
    db.commit()
    db.close()

def test_session_snapshot_authorization(setup_users):
    client = TestClient(app)
    db = SessionLocal()
    global _current_auth_user_id
    
    # Create session between A and B
    session = MeetSession(status=SessionStatus.ACTIVE)
    db.add(session)
    db.flush()
    
    p1 = SessionParticipant(session_id=session.id, user_id=USER_A_ID, status=ParticipantStatus.JOINED)
    p2 = SessionParticipant(session_id=session.id, user_id=USER_B_ID, status=ParticipantStatus.JOINED)
    db.add_all([p1, p2])
    db.commit()
    
    session_id = session.id
    
    # USER A should access
    _current_auth_user_id = USER_A_ID
    resp = client.get(f"/api/v1/sessions/{session_id}/snapshot")
    assert resp.status_code == 200
    
    # USER C (stranger) should be REJECTED (Fix V1)
    _current_auth_user_id = USER_C_ID
    resp = client.get(f"/api/v1/sessions/{session_id}/snapshot")
    assert resp.status_code == 403
    assert "Not authorized" in resp.text
    
    db.close()

def test_request_action_authorization(setup_users):
    client = TestClient(app)
    db = SessionLocal()
    global _current_auth_user_id
    
    # User A sends request to User B
    req = MeetRequest(requester_id=USER_A_ID, receiver_id=USER_B_ID, status=RequestStatus.PENDING)
    db.add(req)
    db.commit()
    req_id = req.id
    
    # User C (malicious) tries to accept request for B
    _current_auth_user_id = USER_C_ID
    resp = client.post(f"/api/v1/requests/{req_id}/accept")
    assert resp.status_code == 403
    
    # User B (rightful receiver) accepts
    _current_auth_user_id = USER_B_ID
    resp = client.post(f"/api/v1/requests/{req_id}/accept")
    assert resp.status_code == 200
    
    db.close()

def test_invite_rate_limiting(setup_users):
    client = TestClient(app)
    global _current_auth_user_id
    _current_auth_user_id = USER_A_ID
    
    # Spam invite creation
    for i in range(12): # Limit is 10
        resp = client.post("/api/v1/invites", json={"recipient": f"test{i}@example.com"})
        if i < 10:
            assert resp.status_code == 201
        else:
            assert resp.status_code == 429 # Rate limit hit (Fix V2)

def test_session_history_isolation(setup_users):
    client = TestClient(app)
    db = SessionLocal()
    global _current_auth_user_id
    
    # Create session for User A and User B
    s1 = MeetSession(status=SessionStatus.ENDED, ended_at=datetime.utcnow() - timedelta(minutes=1))
    db.add(s1)
    db.flush()
    p1 = SessionParticipant(session_id=s1.id, user_id=USER_A_ID, status=ParticipantStatus.JOINED)
    p2 = SessionParticipant(session_id=s1.id, user_id=USER_B_ID, status=ParticipantStatus.JOINED)
    db.add_all([p1, p2])
    db.commit()
    
    # User B should see it (it's their session too)
    _current_auth_user_id = USER_B_ID
    resp = client.get("/api/v1/sessions/history")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["history"]) == 1
    
    # User C (stranger) should NOT see it
    _current_auth_user_id = USER_C_ID
    resp = client.get("/api/v1/sessions/history")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["history"]) == 0
    
    db.close()

def test_unauthorized_session_termination(setup_users):
    client = TestClient(app)
    db = SessionLocal()
    global _current_auth_user_id
    
    # Active session between A and B
    s = MeetSession(status=SessionStatus.ACTIVE)
    db.add(s)
    db.flush()
    p1 = SessionParticipant(session_id=s.id, user_id=USER_A_ID, status=ParticipantStatus.JOINED)
    p2 = SessionParticipant(session_id=s.id, user_id=USER_B_ID, status=ParticipantStatus.JOINED)
    db.add_all([p1, p2])
    db.commit()
    
    # User C (stranger) tries to end it
    _current_auth_user_id = USER_C_ID
    resp = client.post(f"/api/v1/sessions/{s.id}/end", json={"reason": "TROLL"})
    assert resp.status_code == 403
    
    # User A (participant) ends it
    _current_auth_user_id = USER_A_ID
    resp = client.post(f"/api/v1/sessions/{s.id}/end", json={"reason": "ARRIVED"})
    assert resp.status_code == 200
    
    db.close()

def test_unauthorized_participant_list(setup_users):
    client = TestClient(app)
    db = SessionLocal()
    global _current_auth_user_id
    
    s = MeetSession(status=SessionStatus.ACTIVE)
    db.add(s)
    db.flush()
    p1 = SessionParticipant(session_id=s.id, user_id=USER_A_ID, status=ParticipantStatus.JOINED)
    db.add(p1)
    db.commit()
    
    # User C tries to see participants
    _current_auth_user_id = USER_C_ID
    resp = client.get(f"/api/v1/sessions/{s.id}/participants")
    assert resp.status_code == 403
    
    db.close()

def test_block_enforcement(setup_users):
    client = TestClient(app)
    db = SessionLocal()
    global _current_auth_user_id
    
    # User A blocks User B
    _current_auth_user_id = USER_A_ID
    resp = client.post("/api/v1/blocks", json={"blocked_user_id": str(USER_B_ID)})
    assert resp.status_code == 201
    
    # User B tries to send request to A
    _current_auth_user_id = USER_B_ID
    resp = client.post("/api/v1/requests/", json={"to_user_id": str(USER_A_ID)})
    assert resp.status_code == 403
    
    # User A tries to send request to B (also blocked since block is mutual in enforcement)
    _current_auth_user_id = USER_A_ID
    resp = client.post("/api/v1/requests/", json={"to_user_id": str(USER_B_ID)})
    assert resp.status_code == 403
    
    db.close()

def test_force_end(setup_users):
    client = TestClient(app)
    db = SessionLocal()
    global _current_auth_user_id
    
    s = MeetSession(status=SessionStatus.ACTIVE)
    db.add(s)
    db.flush()
    p1 = SessionParticipant(session_id=s.id, user_id=USER_A_ID, status=ParticipantStatus.JOINED)
    db.add(p1)
    db.commit()
    
    # Force end by participant
    _current_auth_user_id = USER_A_ID
    resp = client.post(f"/api/v1/sessions/{s.id}/force_end")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ENDED"
    
    # Check session in DB
    db.refresh(s)
    assert s.status == SessionStatus.ENDED
    assert s.end_reason == "FORCE_ENDED"
    
    db.close()
