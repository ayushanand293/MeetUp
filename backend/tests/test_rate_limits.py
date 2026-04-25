import pytest
import uuid
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock
from app.main import app
from app.api import deps
from app.core.database import SessionLocal
from app.models.user import User

# Existing IDs from authorization tests
USER_A_ID = uuid.uuid4()

def get_current_user_override():
    db = SessionLocal()
    u = db.query(User).filter(User.id == USER_A_ID).first()
    db.close()
    return u

@pytest.fixture(scope="function", autouse=True)
def setup_teardown():
    app.dependency_overrides[deps.get_current_user] = get_current_user_override
    db = SessionLocal()
    existing = db.query(User).filter(User.id == USER_A_ID).first()
    if not existing:
        u = User(id=USER_A_ID, email=f"rate_{uuid.uuid4().hex[:8]}@example.com")
        db.add(u)
        db.commit()
    db.close()
    yield
    if deps.get_current_user in app.dependency_overrides:
        del app.dependency_overrides[deps.get_current_user]

def test_rest_rate_limit_fail_closed():
    client = TestClient(app)
    # Monkeypatch redis to raise error
    with patch("app.core.rate_limit.get_redis", side_effect=Exception("Redis Down")):
        resp = client.post("/api/v1/invites", json={"recipient": "test@example.com"})
        # Should be 429 because of fail-closed
        assert resp.status_code == 429
        assert "security check failed" in resp.json()["detail"]

@patch("app.api.endpoints.realtime.is_session_participant_sync", return_value=True)
@patch("jwt.get_unverified_header", return_value={"alg": "HS256"})
@patch("jwt.decode", return_value={"sub": str(USER_A_ID)})
def test_realtime_rate_limit_throttle(mock_jwt_decode, mock_jwt_header, mock_part):
    client = TestClient(app)
    session_id = uuid.uuid4()
    
    # We test the 1/3s throttle (existing)
    with client.websocket_connect(f"/api/v1/ws/meetup?token=MOCK&session_id={session_id}") as ws:
        # First one allowed (we assume redis is clean or we mock it)
        ws.send_json({"type": "location_update", "payload": {"lat": 10.0, "lon": 20.0}})
        
        # Second one immediately - throttled
        ws.send_json({"type": "location_update", "payload": {"lat": 10.1, "lon": 20.1}})
        resp = ws.receive_json()
        assert resp["type"] == "error"
        assert resp["payload"]["code"] == "RATE_LIMIT_EXCEEDED"

@patch("app.api.endpoints.realtime.is_session_participant_sync", return_value=True)
@patch("jwt.get_unverified_header", return_value={"alg": "HS256"})
@patch("jwt.decode", return_value={"sub": str(USER_A_ID)})
def test_realtime_short_window_limit(mock_jwt_decode, mock_jwt_header, mock_part):
    client = TestClient(app)
    session_id = uuid.uuid4()
    
    # Mock check_rate_limit to return False (exceeded)
    with patch("app.api.endpoints.realtime.check_rate_limit", new_callable=AsyncMock) as mock_limit:
        mock_limit.return_value = False
        with client.websocket_connect(f"/api/v1/ws/meetup?token=MOCK&session_id={session_id}") as ws:
            ws.send_json({"type": "location_update", "payload": {"lat": 10.0, "lon": 20.0}})
            resp = ws.receive_json()
            assert resp["type"] == "error"
            assert "60 per minute" in resp["payload"]["message"]
