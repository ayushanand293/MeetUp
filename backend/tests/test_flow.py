import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.api import deps
from app.core.database import SessionLocal
from app.main import app
from app.models.user import User

# This test assumes a running Postgres DB (e.g., via Docker)
# Environment variables should be set:
# DATABASE_URL=postgresql://user:password@localhost:5432/meetup (or similar)


@pytest.fixture(scope="module")
def db():
    # Helper to clean DB before tests
    db = SessionLocal()
    try:
        # Clean tables
        db.execute(text("TRUNCATE TABLE users, meet_requests, sessions, session_participants CASCADE"))
        db.commit()
        yield db
    finally:
        db.close()


# Mock Auth Logic (still mocked to avoid needing real Supabase tokens)
# We will create users in the DB directly for the mock to find them
user1_id = uuid.uuid4()
user2_id = uuid.uuid4()
user1_email = "user1@example.com"
user2_email = "user2@example.com"

# Context var or global to switch user
_current_user_id = user1_id


def get_current_user_override(db_session=None):
    # This override mimics looking up the user from the token.
    # In integration test, we simulate different users by changing the expected user ID.

    # We query the DB to get the full user object attached to session
    # We need a fresh session here or use the one from depends?
    # For simplicity, we just assume the user exists in DB from fixture setup
    db = SessionLocal()
    u = db.query(User).filter(User.id == _current_user_id).first()
    db.close()
    if not u:
        raise Exception(f"Mock user {_current_user_id} not found in DB")
    return u


app.dependency_overrides[deps.get_current_user] = get_current_user_override


@pytest.fixture(name="client")
def client_fixture():
    # Ensure users exist for the test logic
    db = SessionLocal()
    if not db.query(User).filter(User.id == user1_id).first():
        u1 = User(id=user1_id, email=user1_email)
        db.add(u1)

    if not db.query(User).filter(User.id == user2_id).first():
        u2 = User(id=user2_id, email=user2_email)
        db.add(u2)

    db.commit()
    db.close()

    client = TestClient(app)
    return client


def test_week1_demo_flow(client, db):
    """
    Demo: login -> create request -> accept -> session becomes ACTIVE
    """
    global _current_user_id

    print("\n🚀 Starting Week 1 Demo Flow Check...")

    # 1. User 1 sends request to User 2
    _current_user_id = user1_id
    print(f"👉 Step 1: User 1 ({user1_email}) sending request to User 2 ({user2_email})")

    response = client.post(f"/api/v1/requests/?receiver_id={user2_id}")
    assert response.status_code == 201, response.text
    data = response.json()
    request_id = data["id"]
    assert data["status"] == "PENDING"
    print("   ✅ Request Created")

    # 2. User 2 accepts request
    _current_user_id = user2_id
    print(f"👉 Step 2: User 2 accepting request {request_id}")

    response = client.post(f"/api/v1/requests/{request_id}/accept")
    assert response.status_code == 200, response.text
    print("   ✅ Request Accepted")

    # 3. Create Session (User 1 initiates)
    _current_user_id = user1_id
    print("👉 Step 3: User 1 creating session from accepted request")

    response = client.post(f"/api/v1/sessions/from-request/{request_id}")
    assert response.status_code == 201, response.text
    session_data = response.json()
    session_id = session_data["session_id"]
    assert session_data["status"] == "ACTIVE"
    print(f"   ✅ Session Created: {session_id}")

    # 4. Verify Active Session for User 1
    print("👉 Step 4: Verifying Session Status")
    response = client.get("/api/v1/sessions/active")
    assert response.status_code == 200
    assert response.json()["session_id"] == session_id
    print("   ✅ User 1 sees Active Session")

    # 5. Verify Active Session for User 2
    _current_user_id = user2_id
    response = client.get("/api/v1/sessions/active")
    assert response.status_code == 200
    assert response.json()["session_id"] == session_id
    print("   ✅ User 2 sees Active Session")

    print("\n🎉 Week 1 Verification Successful!")
