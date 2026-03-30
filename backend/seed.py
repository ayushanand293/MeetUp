import json
import uuid
from datetime import datetime, timedelta

import jwt
import redis

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.session import Session, SessionParticipant, SessionStatus
from app.models.user import User

DEMO_LOCATION_TTL_SECONDS = 3600


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

        # 3. Seed initial live locations in Redis so snapshot map has peers during demo
        redis_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
        now_iso = datetime.utcnow().isoformat()
        alice_location = {
            "lat": 28.5355,
            "lon": 77.0892,
            "accuracy_m": 12,
            "timestamp": now_iso,
            "updated_at": now_iso,
        }
        bob_location = {
            "lat": 28.5362,
            "lon": 77.0901,
            "accuracy_m": 10,
            "timestamp": now_iso,
            "updated_at": now_iso,
        }
        redis_client.setex(f"loc:{session_id}:{user1_id}", DEMO_LOCATION_TTL_SECONDS, json.dumps(alice_location))
        redis_client.setex(f"loc:{session_id}:{user2_id}", DEMO_LOCATION_TTL_SECONDS, json.dumps(bob_location))
        print(f"✅ Seeded initial live locations for Alice and Bob (TTL: {DEMO_LOCATION_TTL_SECONDS}s)")

        # 4. Create Ended Sessions (for Quick Friends & Activity Timeline)
        now = datetime.utcnow()
        
        # Create 3 test friends
        sarah_id = uuid.uuid4()
        marcus_id = uuid.uuid4()
        jordan_id = uuid.uuid4()
        
        sarah = User(id=sarah_id, email=f"sarah_{str(sarah_id)[:4]}@test.com", profile_data={"name": "Sarah"})
        marcus = User(id=marcus_id, email=f"marcus_{str(marcus_id)[:4]}@test.com", profile_data={"name": "Marcus"})
        jordan = User(id=jordan_id, email=f"jordan_{str(jordan_id)[:4]}@test.com", profile_data={"name": "Jordan"})
        
        db.add(sarah)
        db.add(marcus)
        db.add(jordan)
        db.flush()
        
        # Ended session 1: Met Sarah 2 hours ago
        ended_session_1 = Session(
            id=uuid.uuid4(),
            status=SessionStatus.ENDED,
            created_at=now - timedelta(hours=2, minutes=30),
            ended_at=now - timedelta(hours=2),
            end_reason="completed"
        )
        p1_ended = SessionParticipant(session_id=ended_session_1.id, user_id=user1_id, joined_at=now - timedelta(hours=2, minutes=30))
        p2_ended = SessionParticipant(session_id=ended_session_1.id, user_id=sarah_id, joined_at=now - timedelta(hours=2, minutes=30))
        
        # Ended session 2: Met Marcus 1 day ago
        ended_session_2 = Session(
            id=uuid.uuid4(),
            status=SessionStatus.ENDED,
            created_at=now - timedelta(days=1, hours=3),
            ended_at=now - timedelta(days=1),
            end_reason="completed"
        )
        p1_ended2 = SessionParticipant(session_id=ended_session_2.id, user_id=user1_id, joined_at=now - timedelta(days=1, hours=3))
        p2_ended2 = SessionParticipant(session_id=ended_session_2.id, user_id=marcus_id, joined_at=now - timedelta(days=1, hours=3))
        
        # Ended session 3: Met Jordan 3 days ago
        ended_session_3 = Session(
            id=uuid.uuid4(),
            status=SessionStatus.ENDED,
            created_at=now - timedelta(days=3, hours=2),
            ended_at=now - timedelta(days=3),
            end_reason="completed"
        )
        p1_ended3 = SessionParticipant(session_id=ended_session_3.id, user_id=user1_id, joined_at=now - timedelta(days=3, hours=2))
        p2_ended3 = SessionParticipant(session_id=ended_session_3.id, user_id=jordan_id, joined_at=now - timedelta(days=3, hours=2))
        
        db.add_all([ended_session_1, p1_ended, p2_ended, ended_session_2, p1_ended2, p2_ended2, ended_session_3, p1_ended3, p2_ended3])
        db.commit()
        
        print(f"✅ Created test friends: Sarah, Marcus, Jordan")
        print(f"✅ Created 3 ended sessions (Quick Friends & Activity Timeline)")

        # 5. Generate Credentials
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
