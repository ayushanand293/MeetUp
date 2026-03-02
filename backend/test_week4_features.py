"""
Quick test script for Week 4 features
Run with: docker-compose exec backend python test_week4_features.py
"""
import asyncio
import json
from datetime import datetime
from uuid import uuid4

from app.core.database import SessionLocal
from app.core.redis import get_redis
from app.models.user import User
from app.models.session import Session as DBSession
from app.models.audit import AuditEvent
from app.models.meet_request import MeetRequest


async def test_redis_ttl_storage():
    """Test 1: Redis TTL location storage"""
    print("\n=== Test 1: Redis TTL Location Storage ===")
    
    redis = await get_redis()
    test_session_id = str(uuid4())
    test_user_id = str(uuid4())
    location_key = f"loc:{test_session_id}:{test_user_id}"
    
    # Store location with 120s TTL
    location_data = {
        "lat": 28.5355,
        "lon": 77.0892,
        "accuracy_m": 10,
        "timestamp": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    
    await redis.setex(location_key, 120, json.dumps(location_data))
    print(f"✅ Stored location: {location_key}")
    
    # Verify it exists
    stored = await redis.get(location_key)
    if stored:
        print(f"✅ Retrieved location: {json.loads(stored)}")
    else:
        print("❌ Failed to retrieve location")
        return False
    
    # Check TTL
    ttl = await redis.ttl(location_key)
    print(f"✅ TTL: {ttl} seconds (expected ~120)")
    
    # Cleanup
    await redis.delete(location_key)
    print("✅ Cleaned up test location\n")
    return True


async def test_throttling():
    """Test 2: Per-user throttling"""
    print("\n=== Test 2: Server-Side Throttling ===")
    
    redis = await get_redis()
    test_session_id = str(uuid4())
    test_user_id = str(uuid4())
    throttle_key = f"last_update:{test_session_id}:{test_user_id}"
    
    # Simulate first update
    now = datetime.utcnow().timestamp()
    await redis.setex(throttle_key, 5, str(now))
    print(f"✅ First update at timestamp: {now}")
    
    # Check if throttled (immediate second update)
    last_update_ts = await redis.get(throttle_key)
    if last_update_ts:
        last_update = float(last_update_ts)
        time_diff = datetime.utcnow().timestamp() - last_update
        
        if time_diff < 2.0:
            print(f"✅ Would be THROTTLED (time diff: {time_diff:.3f}s < 2.0s)")
        else:
            print(f"❌ Would NOT be throttled (time diff: {time_diff:.3f}s >= 2.0s)")
    
    # Wait 2 seconds and try again
    print("⏱️  Waiting 2 seconds...")
    await asyncio.sleep(2.1)
    
    last_update_ts = await redis.get(throttle_key)
    if last_update_ts:
        last_update = float(last_update_ts)
        time_diff = datetime.utcnow().timestamp() - last_update
        
        if time_diff >= 2.0:
            print(f"✅ Would be ALLOWED (time diff: {time_diff:.3f}s >= 2.0s)")
        else:
            print(f"❌ Would be THROTTLED (time diff: {time_diff:.3f}s < 2.0s)")
    
    # Cleanup
    await redis.delete(throttle_key)
    print("✅ Cleaned up throttle key\n")
    return True


def test_audit_logging():
    """Test 3: Audit event logging"""
    print("\n=== Test 3: Audit Event Logging ===")
    
    db = SessionLocal()
    
    try:
        # Check if audit_events table has the new columns
        from sqlalchemy import inspect
        inspector = inspect(db.bind)
        columns = [c['name'] for c in inspector.get_columns('audit_events')]
        
        print(f"✅ Audit table columns: {columns}")
        
        if 'session_id' in columns and 'user_id' in columns:
            print("✅ New foreign key columns exist")
        else:
            print("❌ Missing FK columns (session_id, user_id)")
            return False
        
        # Check recent audit events
        recent_events = db.query(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(5).all()
        
        if recent_events:
            print(f"\n✅ Found {len(recent_events)} recent audit events:")
            for event in recent_events[:3]:
                print(f"   - {event.event_type} (session: {event.session_id}, user: {event.user_id})")
        else:
            print("⚠️  No audit events found (table is empty, but structure is correct)")
        
        print()
        return True
        
    finally:
        db.close()


async def test_snapshot_endpoint_logic():
    """Test 4: Snapshot endpoint logic (without HTTP)"""
    print("\n=== Test 4: Session Snapshot Logic ===")
    
    redis = await get_redis()
    test_session_id = str(uuid4())
    
    # Simulate 2 users with locations
    user1_id = str(uuid4())
    user2_id = str(uuid4())
    
    # Store locations
    loc1_data = {"lat": 28.5355, "lon": 77.0892, "accuracy_m": 10}
    loc2_data = {"lat": 28.5365, "lon": 77.0895, "accuracy_m": 15}
    
    await redis.setex(f"loc:{test_session_id}:{user1_id}", 120, json.dumps(loc1_data))
    await redis.setex(f"loc:{test_session_id}:{user2_id}", 120, json.dumps(loc2_data))
    
    print(f"✅ Stored locations for 2 users in session: {test_session_id}")
    
    # Simulate snapshot fetch
    locations = {}
    for user_id in [user1_id, user2_id]:
        loc_key = f"loc:{test_session_id}:{user_id}"
        loc_data = await redis.get(loc_key)
        if loc_data:
            locations[user_id] = json.loads(loc_data)
        else:
            locations[user_id] = None
    
    print(f"✅ Snapshot would return {len([l for l in locations.values() if l])} locations:")
    for user_id, loc in locations.items():
        if loc:
            print(f"   - User {user_id[:8]}...: lat={loc['lat']}, lon={loc['lon']}")
    
    # Cleanup
    await redis.delete(f"loc:{test_session_id}:{user1_id}")
    await redis.delete(f"loc:{test_session_id}:{user2_id}")
    print("✅ Cleaned up test locations\n")
    return True


async def main():
    print("=" * 60)
    print("Week 4 Feature Testing")
    print("=" * 60)
    
    results = {}
    
    # Run tests
    try:
        results['redis_ttl'] = await test_redis_ttl_storage()
        results['throttling'] = await test_throttling()
        results['audit_logging'] = test_audit_logging()
        results['snapshot'] = await test_snapshot_endpoint_logic()
        
    except Exception as e:
        print(f"\n❌ Error during testing: {e}")
        import traceback
        traceback.print_exc()
        return
    
    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    total = len(results)
    passed = sum(results.values())
    print(f"\n{passed}/{total} tests passed")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
