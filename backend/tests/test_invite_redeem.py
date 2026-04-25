import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.api import deps
from app.core.database import SessionLocal
from app.main import app
from app.models.invite import Invite
from app.models.user import User

user1_id = uuid.uuid4()
user2_id = uuid.uuid4()
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
        db.execute(text("TRUNCATE TABLE users, meet_requests, sessions, session_participants, invites CASCADE"))
        db.add_all(
            [
                User(id=user1_id, email="invite_redeem_u1@example.com"),
                User(id=user2_id, email="invite_redeem_u2@example.com"),
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


def test_create_resolve_redeem_invite(client):
    global _current_user_id
    _current_user_id = user1_id

    create_req = client.post(f"/api/v1/requests/?receiver_id={user2_id}")
    assert create_req.status_code == 201, create_req.text
    request_id = create_req.json()["id"]

    create_invite = client.post(
        "/api/v1/invites",
        json={"recipient": "sms:+15551234567", "request_id": request_id},
    )
    assert create_invite.status_code == 201, create_invite.text

    invite_payload = create_invite.json()
    token = invite_payload["token"]
    assert invite_payload["invite_id"]
    assert invite_payload["url"].endswith(f"token={token}")
    assert invite_payload["expires_at"]

    resolve = client.get(f"/api/v1/invites/{token}")
    assert resolve.status_code == 200, resolve.text
    resolved = resolve.json()
    assert resolved["request_id"] == request_id
    assert resolved["redeemed_at"] is None

    redeem = client.post(f"/api/v1/invites/{token}/redeem")
    assert redeem.status_code == 200, redeem.text
    redeemed = redeem.json()
    assert redeemed["request_id"] == request_id
    assert redeemed["redeemed_at"] is not None

    # Idempotent redeem should not fail or duplicate.
    redeem_again = client.post(f"/api/v1/invites/{token}/redeem")
    assert redeem_again.status_code == 200, redeem_again.text


def test_expired_invite_returns_410(client):
    global _current_user_id
    _current_user_id = user1_id

    create_invite = client.post(
        "/api/v1/invites",
        json={"recipient": "email:invitee@example.com"},
    )
    assert create_invite.status_code == 201, create_invite.text
    token = create_invite.json()["token"]

    db = SessionLocal()
    try:
        invite = db.query(Invite).filter(Invite.token == token).first()
        assert invite is not None
        invite.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.add(invite)
        db.commit()
    finally:
        db.close()

    resolve = client.get(f"/api/v1/invites/{token}")
    assert resolve.status_code == 410, resolve.text

    redeem = client.post(f"/api/v1/invites/{token}/redeem")
    assert redeem.status_code == 410, redeem.text
