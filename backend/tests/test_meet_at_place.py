import uuid

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.api import deps
from app.core.database import SessionLocal
from app.main import app
from app.models.meet_request import MeetRequest
from app.models.session import Session as MeetSession
from app.models.user import User
from app.services.places import PlaceResult


USER_A_ID = uuid.uuid4()
USER_B_ID = uuid.uuid4()
_current_auth_user_id = USER_A_ID


DESTINATION = {
    "name": "Blue Bottle Coffee",
    "address": "1 Market St, San Francisco, CA",
    "lat": 37.7936,
    "lon": -122.3958,
    "provider": "osm",
    "place_id": "12345",
}


def get_current_user_override():
    db = SessionLocal()
    try:
        return db.query(User).filter(User.id == _current_auth_user_id).first()
    finally:
        db.close()


@pytest.fixture(scope="function", autouse=True)
def auth_override():
    app.dependency_overrides[deps.get_current_user] = get_current_user_override
    yield
    app.dependency_overrides.pop(deps.get_current_user, None)


@pytest.fixture(scope="function")
def setup_users(monkeypatch):
    async def allow(*_args, **_kwargs):
        return None

    monkeypatch.setattr("app.api.endpoints.requests.enforce_rate_limit", allow)

    db = SessionLocal()
    db.execute(text("TRUNCATE TABLE users, meet_requests, sessions, session_participants, user_blocks CASCADE"))
    db.add_all([
        User(id=USER_A_ID, email="place-a@example.com"),
        User(id=USER_B_ID, email="place-b@example.com"),
    ])
    db.commit()
    db.close()


def test_request_with_destination_persists(setup_users):
    global _current_auth_user_id
    _current_auth_user_id = USER_A_ID
    client = TestClient(app)

    response = client.post("/api/v1/requests/", json={"to_user_id": str(USER_B_ID), "destination": DESTINATION})
    assert response.status_code == 201

    db = SessionLocal()
    try:
        req = db.query(MeetRequest).filter(MeetRequest.id == response.json()["id"]).first()
        assert req.destination_name == DESTINATION["name"]
        assert req.destination_provider == "osm"
        assert req.destination_lat == DESTINATION["lat"]
    finally:
        db.close()


def test_accept_copies_destination_to_session(setup_users):
    global _current_auth_user_id
    client = TestClient(app)

    _current_auth_user_id = USER_A_ID
    create_response = client.post("/api/v1/requests/", json={"to_user_id": str(USER_B_ID), "destination": DESTINATION})
    assert create_response.status_code == 201

    _current_auth_user_id = USER_B_ID
    accept_response = client.post(f"/api/v1/requests/{create_response.json()['id']}/accept")
    assert accept_response.status_code == 200

    db = SessionLocal()
    try:
        session = db.query(MeetSession).filter(MeetSession.id == accept_response.json()["session_id"]).first()
        assert session.destination_name == DESTINATION["name"]
        assert session.destination_address == DESTINATION["address"]
        assert session.destination_place_id == DESTINATION["place_id"]
    finally:
        db.close()


def test_session_snapshot_includes_destination_for_participant(setup_users, monkeypatch):
    global _current_auth_user_id
    client = TestClient(app)

    class FakeRedis:
        async def scan(self, cursor, match=None):
            return 0, []

    async def fake_get_redis():
        return FakeRedis()

    monkeypatch.setattr("app.api.endpoints.sessions.get_redis", fake_get_redis)

    _current_auth_user_id = USER_A_ID
    create_response = client.post("/api/v1/requests/", json={"to_user_id": str(USER_B_ID), "destination": DESTINATION})
    _current_auth_user_id = USER_B_ID
    accept_response = client.post(f"/api/v1/requests/{create_response.json()['id']}/accept")

    snapshot_response = client.get(f"/api/v1/sessions/{accept_response.json()['session_id']}/snapshot")
    assert snapshot_response.status_code == 200
    assert snapshot_response.json()["destination"]["name"] == DESTINATION["name"]


def test_places_search_requires_auth():
    app.dependency_overrides.pop(deps.get_current_user, None)
    client = TestClient(app)

    response = client.get("/api/v1/places/search?q=cafe")
    assert response.status_code == 401


def test_places_search_rate_limited(setup_users, monkeypatch):
    global _current_auth_user_id
    _current_auth_user_id = USER_A_ID
    client = TestClient(app)

    async def deny(*_args, **_kwargs):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    monkeypatch.setattr("app.api.endpoints.places.enforce_rate_limit", deny)
    response = client.get("/api/v1/places/search?q=cafe")
    assert response.status_code == 429


def test_places_search_uses_mocked_provider(setup_users, monkeypatch):
    global _current_auth_user_id
    _current_auth_user_id = USER_A_ID
    client = TestClient(app)

    async def allow(*_args, **_kwargs):
        return None

    class FakeProvider:
        def search(self, query, lat=None, lon=None, limit=10):
            assert query == "cafe"
            return [PlaceResult(name="Cafe", address="Main St", lat=1.0, lon=2.0, provider="osm", place_id="p1")]

    monkeypatch.setattr("app.api.endpoints.places.enforce_rate_limit", allow)
    monkeypatch.setattr("app.api.endpoints.places.places_provider", FakeProvider())

    response = client.get("/api/v1/places/search?q=cafe&lat=1&lon=2&limit=5")
    assert response.status_code == 200
    assert response.json() == [{"name": "Cafe", "address": "Main St", "lat": 1.0, "lon": 2.0, "provider": "osm", "place_id": "p1"}]
