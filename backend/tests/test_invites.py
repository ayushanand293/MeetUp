import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.api import deps
from app.core.database import SessionLocal
from app.main import app
from app.models.user import User

user1_id = uuid.uuid4()
user2_id = uuid.uuid4()
user3_id = uuid.uuid4()

_current_user_id = user1_id


def get_current_user_override():
    db = SessionLocal()
    user = db.query(User).filter(User.id == _current_user_id).first()
    db.close()
    if not user:
        raise Exception(f"Mock user {_current_user_id} not found")
    return user


@pytest.fixture(scope="module")
def db_setup():
    db = SessionLocal()
    try:
        db.execute(text("TRUNCATE TABLE users, meet_requests, sessions, session_participants CASCADE"))

        db.add_all(
            [
                User(id=user1_id, email="invite_u1@example.com"),
                User(id=user2_id, email="invite_u2@example.com"),
                User(id=user3_id, email="invite_u3@example.com"),
            ]
        )
        db.commit()
        yield
    finally:
        db.close()


@pytest.fixture(name="client")
def client_fixture(db_setup):
    previous_override = app.dependency_overrides.get(deps.get_current_user)
    app.dependency_overrides[deps.get_current_user] = get_current_user_override
    client = TestClient(app)
    try:
        yield client
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(deps.get_current_user, None)
        else:
            app.dependency_overrides[deps.get_current_user] = previous_override


def test_invite_create_and_redeem_flow(client):
    global _current_user_id

    # User1 creates request to user2.
    _current_user_id = user1_id
    create_req = client.post(f"/api/v1/requests/?receiver_id={user2_id}")
    assert create_req.status_code == 201, create_req.text
    request_id = create_req.json()["id"]

    # User2 accepts and starts session.
    _current_user_id = user2_id
    accept_req = client.post(f"/api/v1/requests/{request_id}/accept")
    assert accept_req.status_code == 200, accept_req.text

    _current_user_id = user1_id
    create_session = client.post(f"/api/v1/sessions/from-request/{request_id}")
    assert create_session.status_code == 201, create_session.text
    session_id = create_session.json()["session_id"]

    # User1 creates invite token.
    invite_res = client.post(f"/api/v1/sessions/{session_id}/invite")
    assert invite_res.status_code == 200, invite_res.text
    token = invite_res.json().get("invite_token")
    assert token

    # User3 redeems invite and joins session.
    _current_user_id = user3_id
    redeem_res = client.post(f"/api/v1/sessions/{session_id}/invite/redeem", json={"token": token})
    assert redeem_res.status_code == 200, redeem_res.text
    assert redeem_res.json()["status"] == "joined"

    # Verify active session visibility for joined user.
    active_res = client.get("/api/v1/sessions/active")
    assert active_res.status_code == 200, active_res.text
    assert active_res.json()["session_id"] == session_id


def test_metrics_prometheus_format(client):
    metrics_res = client.get("/api/v1/metrics?format=prometheus")
    assert metrics_res.status_code == 200, metrics_res.text
    assert "text/plain" in metrics_res.headers["content-type"]
    assert "meetup_" in metrics_res.text
