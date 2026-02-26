import uuid
from datetime import datetime, timedelta

import jwt

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.session import Session, SessionParticipant, SessionStatus
from app.models.user import User


def create_test_token(user_id: str) -> str:
    """Helper to create a valid JWT for testing"""
    payload = {
        "sub": user_id,
        "exp": datetime.utcnow() + timedelta(days=1),
        "aud": "authenticated",
        "email": f"user_{user_id[:4]}@example.com",
    }
    # Verify we have a key
    key = settings.SUPABASE_KEY
    if not key:
        print("⚠️  WARNING: SUPABASE_KEY is empty. Tokens will be insecure.")

    return jwt.encode(payload, key or "", algorithm="HS256")


def seed():
    db = SessionLocal()
    try:
        print("🌱 Seeding Database...")

        # 1. Create Users
        user1_id = uuid.uuid4()
        user2_id = uuid.uuid4()

        user1 = User(id=user1_id, email=f"alice_{str(user1_id)[:4]}@test.com")
        user2 = User(id=user2_id, email=f"bob_{str(user2_id)[:4]}@test.com")

        db.add(user1)
        db.add(user2)
        db.commit()

        print(f"✅ Created User 1: Alice ({user1_id})")
        print(f"✅ Created User 2: Bob   ({user2_id})")

        # 2. Create Active Session
        session_id = uuid.uuid4()

        session = Session(id=session_id, status=SessionStatus.ACTIVE)

        p1 = SessionParticipant(session_id=session_id, user_id=user1_id)
        p2 = SessionParticipant(session_id=session_id, user_id=user2_id)

        db.add(session)
        db.add(p1)
        db.add(p2)
        db.commit()

        print(f"✅ Created Active Session: {session_id}")

        # 3. Generate Credentials
        # Token creation needs string usually for jwt payload
        token1 = create_test_token(str(user1_id))
        token2 = create_test_token(str(user2_id))

        print("\n" + "=" * 60)
        print("🎉 SEED COMPLETE")
        print("=" * 60)
        print(f"\n🔑 SESSION ID: {session_id}")
        print("\n👤 USER 1 (Alice):")
        print(f"   Token: {token1}")
        print("\n👤 USER 2 (Bob):")
        print(f"   Token: {token2}")
        print("\n" + "=" * 60)

    except Exception as e:
        print(f"❌ Error seeding: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    seed()
