from datetime import datetime
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api import deps
from app.main import app
from app.models.session import Session as MeetSession
from app.models.session import SessionParticipant, SessionStatus
from app.models.user import User


def _user(phone_suffix: str) -> User:
    phone = f"+1555{phone_suffix}"
    return User(
        id=uuid4(),
        phone_e164=phone,
        phone_hash=f"hash-{phone_suffix}",
        phone_digest=f"digest-{phone_suffix}",
        phone_verified_at=datetime.utcnow(),
    )


@pytest.fixture
def session_users(db):
    user_a = _user("1000001")
    user_b = _user("1000002")
    outsider = _user("1000003")
    session = MeetSession(status=SessionStatus.ACTIVE)
    db.add_all([user_a, user_b, outsider, session])
    db.flush()
    db.add_all([
        SessionParticipant(session_id=session.id, user_id=user_a.id),
        SessionParticipant(session_id=session.id, user_id=user_b.id),
    ])
    db.commit()
    return user_a, user_b, outsider, session


def _override_user(user):
    app.dependency_overrides[deps.get_current_user] = lambda: user


def test_background_location_requires_participant(client, session_users):
    _user_a, _user_b, outsider, session = session_users
    _override_user(outsider)
    try:
        response = client.post(
            f"/api/v1/sessions/{session.id}/location",
            json={"lat": 37.7749, "lon": -122.4194, "accuracy_m": 10},
        )
    finally:
        app.dependency_overrides.pop(deps.get_current_user, None)

    assert response.status_code == 403


def test_background_location_rejects_ended_session(client, session_users, db):
    user_a, _user_b, _outsider, session = session_users
    session.status = SessionStatus.ENDED
    db.commit()
    _override_user(user_a)
    try:
        response = client.post(
            f"/api/v1/sessions/{session.id}/location",
            json={"lat": 37.7749, "lon": -122.4194, "accuracy_m": 10},
        )
    finally:
        app.dependency_overrides.pop(deps.get_current_user, None)

    assert response.status_code == 409


def test_background_location_rate_limit_fails_closed(client, session_users, monkeypatch):
    user_a, _user_b, _outsider, session = session_users

    async def deny(*_args, **_kwargs):
        raise HTTPException(status_code=429, detail="Rate limit exceeded or security check failed")

    monkeypatch.setattr("app.api.endpoints.sessions.enforce_rate_limit", deny)
    _override_user(user_a)
    try:
        response = client.post(
            f"/api/v1/sessions/{session.id}/location",
            json={"lat": 37.7749, "lon": -122.4194, "accuracy_m": 10},
        )
    finally:
        app.dependency_overrides.pop(deps.get_current_user, None)

    assert response.status_code == 429


def test_background_location_publishes_peer_location(client, session_users, monkeypatch):
    user_a, _user_b, _outsider, session = session_users
    broadcasts = []

    async def capture_broadcast(session_id, message, exclude_user=None):
        broadcasts.append((session_id, message, exclude_user))

    monkeypatch.setattr("app.api.endpoints.sessions.manager.broadcast", capture_broadcast)
    _override_user(user_a)
    try:
        response = client.post(
            f"/api/v1/sessions/{session.id}/location",
            json={"lat": 37.7749, "lon": -122.4194, "accuracy_m": 10},
        )
    finally:
        app.dependency_overrides.pop(deps.get_current_user, None)

    assert response.status_code == 200, response.text
    assert response.json() == {"ok": True}
    assert len(broadcasts) == 1
    assert broadcasts[0][0] == session.id
    assert broadcasts[0][2] == user_a.id
    assert "peer_location" in broadcasts[0][1]
