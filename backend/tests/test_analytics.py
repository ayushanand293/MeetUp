import uuid
from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings
from app.models.analytics_event import AnalyticsEvent
from app.models.session import SessionStatus
from app.models.session import Session as MeetSession
from app.models.user import User


def _token_for(user_id: uuid.UUID, email: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "aud": "authenticated",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    return jwt.encode(payload, settings.SUPABASE_KEY, algorithm="HS256")


def test_analytics_event_authorized_returns_204(client, db):
    user = User(id=uuid.uuid4(), email="analytics@example.com")
    session = MeetSession(status=SessionStatus.ACTIVE)
    db.add_all([user, session])
    db.commit()

    token = _token_for(user.id, user.email)
    response = client.post(
        "/api/v1/analytics/events",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "events": [
                {
                    "event_name": "session_started",
                    "session_id": str(session.id),
                    "properties": {"source": "unit-test"},
                }
            ]
        },
    )

    assert response.status_code == 204

    saved = db.query(AnalyticsEvent).all()
    assert len(saved) == 1
    assert saved[0].event_name == "session_started"
    assert str(saved[0].session_id) == str(session.id)


def test_analytics_event_unauthorized_returns_401(client):
    response = client.post(
        "/api/v1/analytics/events",
        json={"events": [{"event_name": "session_started", "properties": {}}]},
    )
    assert response.status_code == 401


def test_analytics_event_payload_too_large_returns_413(client, db):
    user = User(id=uuid.uuid4(), email="analytics_big@example.com")
    db.add(user)
    db.commit()

    token = _token_for(user.id, user.email)
    response = client.post(
        "/api/v1/analytics/events",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "events": [
                {
                    "event_name": "big_event",
                    "properties": {"blob": "x" * (33 * 1024)},
                }
            ]
        },
    )

    assert response.status_code == 413
