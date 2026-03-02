# Week 4 Testing Guide - Complete Validation

**Status**: Database migration already completed ✅  
**Environment**: Docker-compose running  
**Estimated Time**: 15-20 minutes

---

## ✅ Step 1: Verify Database Migration

### Check if migration applied successfully

```bash
docker-compose exec backend python -c "
from app.core.database import engine
from sqlalchemy import inspect

# Get audit_events table columns
inspector = inspect(engine)
columns = inspector.get_columns('audit_events')

print('audit_events table columns:')
for col in columns:
    print(f'  - {col[\"name\"]}: {col[\"type\"]}')
"
```

**Expected Output:**
```
audit_events table columns:
  - id: UUID
  - event_type: VARCHAR
  - session_id: UUID          ← NEW
  - user_id: UUID             ← NEW
  - payload: JSONB
  - created_at: TIMESTAMP WITH TIMEZONE
```

✅ **If you see session_id and user_id**, migration is good!

---

## ✅ Step 2: Test Redis TTL Location Storage

### 2.1 Start a test session via API

```bash
# Get a fresh token (or use existing)
TOKEN="your-jwt-token-here"
SESSION_RESPONSE=$(curl -s -X POST http://localhost:8000/api/v1/sessions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "destination_lat": 28.5355,
    "destination_lng": 77.0892,
    "mode": "WALK"
  }')

echo "$SESSION_RESPONSE" | jq .
SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.data.id')
echo "Session ID: $SESSION_ID"
```

**Expected**: Get back session ID in response

### 2.2 Check Redis before any location update

```bash
# Connect to Redis
docker-compose exec redis redis-cli

# Check for any location keys
> KEYS loc:*
(empty array)
```

### 2.3 Send a location update via API or WebSocket

```bash
# Via REST API:
curl -X POST http://localhost:8000/api/v1/sessions/$SESSION_ID/location \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 28.5355,
    "lon": 77.0892,
    "accuracy_m": 10,
    "timestamp": '$(date +%s%3N)'
  }'
```

### 2.4 Verify location stored in Redis

```bash
# In Redis CLI:
> KEYS loc:*
1) "loc:$SESSION_ID:$USER_ID"

> GET loc:$SESSION_ID:$USER_ID
"{\"lat\": 28.5355, \"lon\": 77.0892, \"accuracy_m\": 10, ...}"

# Check TTL (should be ~120 seconds)
> TTL loc:$SESSION_ID:$USER_ID
(integer) 118  # Counting down
```

✅ **If location stored with TTL ~120**, it's working!

### 2.5 Verify TTL expiry (takes 120 seconds)

```bash
# After 120 seconds, in Redis:
> GET loc:$SESSION_ID:$USER_ID
(nil)  # Expired!
```

⏱️ **Can skip this in testing** - just verify TTL is set

---

## ✅ Step 3: Test Server-Side Throttling (1 update per 2 seconds)

### 3.1 Send first location update

```bash
curl -X POST http://localhost:8000/api/v1/sessions/$SESSION_ID/location \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 28.5355,
    "lon": 77.0892,
    "accuracy_m": 10,
    "timestamp": '$(date +%s%3N)'
  }'
```

**Expected**: `200 OK` with location data

### 3.2 Send second update IMMEDIATELY (within 1 second)

```bash
curl -X POST http://localhost:8000/api/v1/sessions/$SESSION_ID/location \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 28.5360,
    "lon": 77.0895,
    "accuracy_m": 10,
    "timestamp": '$(date +%s%3N)'
  }'
```

**Expected**: Should get `429 Too Many Requests` or similar rate limit error
```json
{
  "detail": "Maximum 1 location update per 2 seconds per user"
}
```

### 3.3 Wait 2+ seconds, send third update

```bash
sleep 2

curl -X POST http://localhost:8000/api/v1/sessions/$SESSION_ID/location \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 28.5365,
    "lon": 77.0900,
    "accuracy_m": 10,
    "timestamp": '$(date +%s%3N)'
  }'
```

**Expected**: `200 OK` - should succeed after 2 seconds

✅ **If 1st succeeds, 2nd fails, 3rd succeeds**, throttling works!

---

## ✅ Step 4: Test Session Snapshot Endpoint

### 4.1 Make sure you have an ACTIVE session with 2+ users

If testing alone, you need another user/session. For now, test with your single session:

```bash
curl -X GET "http://localhost:8000/api/v1/sessions/$SESSION_ID/snapshot" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Expected Response**:
```json
{
  "session_id": "uuid-here",
  "status": "ACTIVE",
  "locations": {
    "user-1-uuid": {
      "lat": 28.5365,
      "lon": 77.0900,
      "accuracy_m": 10,
      "timestamp": "2026-02-27T10:30:00Z",
      "updated_at": "2026-02-27T10:30:05Z"
    }
  },
  "timestamp": "2026-02-27T10:30:06Z"
}
```

✅ **If you get your location in snapshot**, endpoint works!

---

## ✅ Step 5: Test Audit Logging

### 5.1 Create session (should log SESSION_CREATED)

Already done in Step 2. Now check database:

```bash
docker-compose exec backend python -c "
from app.core.database import SessionLocal
from app.models.audit import AuditEvent

db = SessionLocal()
events = db.query(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(5).all()

for event in events:
    print(f'Event: {event.event_type}')
    print(f'  Session ID: {event.session_id}')
    print(f'  User ID: {event.user_id}')
    print(f'  Created: {event.created_at}')
    print()
"
```

**Expected Output**:
```
Event: SESSION_CREATED
  Session ID: <your-session-id>
  User ID: <your-user-id>
  Created: 2026-02-27 10:30:00+00

... (other events)
```

✅ **If you see SESSION_CREATED with session_id and user_id**, audit logging works!

### 5.2 End session (should log SESSION_ENDED)

```bash
curl -X POST "http://localhost:8000/api/v1/sessions/$SESSION_ID/end" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "TEST_COMPLETED"}'
```

### 5.3 Check database again

```bash
docker-compose exec backend python -c "
from app.core.database import SessionLocal
from app.models.audit import AuditEvent

db = SessionLocal()
events = db.query(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(5).all()

for event in events:
    print(f'Event: {event.event_type}')
    print(f'  Session ID: {event.session_id}')
    print(f'  User ID: {event.user_id}')
    print(f'  Created: {event.created_at}')
    print()
"
```

**Expected**: Should now show both `SESSION_CREATED` and `SESSION_ENDED`

✅ **If both appear in audit_events table**, audit logging works!

---

## ✅ Step 6: Test Mobile Background Pause Handling

### 6.1 Start the mobile app

```bash
cd mobile
npm start
# or
expo start
```

### 6.2 Create a test session and accept it

- Login with test user
- Create or accept a session
- You should be on `ActiveSessionScreen` with the map visible

### 6.3 Verify location tracking is active

- Check mobile console (in Expo): Should see `"Location update sent"` or similar messages every 2 seconds
- Check backend logs: Should see incoming location updates

### 6.4 Test Background Pause

**iOS Simulator**:
```
Simulator → Device → Home
(App goes to background)
```

**Android Emulator**:
```
Press Home button
(App goes to background)
```

**Expected Behavior**:
- ❌ Location updates should STOP being sent to backend
- Mobile console should show: `"Tracking paused - app backgrounded"`
- Backend logs should show NO incoming location updates for ~10-15 seconds

### 6.5 Test Resume from Background

**iOS Simulator**:
```
Long press on app / Swipe or use App Switcher
(Bring app back to foreground)
```

**Android Emulator**:
```
Click app in recent apps / Tap app icon
(Bring app back to foreground)
```

**Expected Behavior**:
- ✅ Location updates should RESUME
- Mobile console should show: `"Tracking resumed - app active"`
- Backend logs should show location updates resuming

✅ **If updates stop on background and resume on foreground**, it works!

---

## ✅ Step 7: Test Privacy Controls UI

### 7.1 Open ActiveSessionScreen

You should see the map with location markers.

### 7.2 Look for Privacy Controls Section

Scroll down or look for these buttons:
- **⏸️ Pause Sharing** (or "Resume Sharing" if already paused)
- **🛑 Stop Sharing**

### 7.3 Test Pause Button

Tap **"Pause Sharing"** button

**Expected**:
- ✅ Alert appears: "Location sharing paused"
- ✅ Button text changes to **"Resume Sharing"**
- ✅ Button color changes to indicate paused state
- ❌ No location updates sent to backend (check logs)
- ✅ Map updates STOP

### 7.4 Test Resume Button

Tap **"Resume Sharing"** button

**Expected**:
- ✅ Alert appears: "Location sharing resumed"
- ✅ Button text changes back to **"Pause Sharing"**
- ✅ Button color returns to normal
- ✅ Location updates RESUME being sent to backend
- ✅ Map updates RESUME

### 7.5 Test Stop Button

Tap **"Stop Sharing"** button

**Expected**:
- ✅ Alert appears: "Session ended"
- ✅ Navigation goes back to HomeScreen
- ✅ Backend logs should show SESSION_ENDED event

✅ **If all buttons work and location stops/resumes**, UI controls work!

---

## 📊 Complete Testing Checklist

| Feature | Test | Status |
|---------|------|--------|
| **DB Migration** | Check audit_events has session_id, user_id | ☐ |
| **Redis TTL** | Send location, verify in Redis with ~120s TTL | ☐ |
| **Throttling** | 1st update OK, 2nd within 2s rejected, 3rd OK | ☐ |
| **Snapshot Endpoint** | GET snapshot returns current locations | ☐ |
| **Audit Logging** | SESSION_CREATED + SESSION_ENDED in DB | ☐ |
| **Background Pause** | Updates stop when app backgrounded | ☐ |
| **Background Resume** | Updates resume when app returns | ☐ |
| **Pause Button** | Pause button stops updates + resumes them | ☐ |
| **Stop Button** | Stop button ends session + navigates away | ☐ |

---

## 🐛 Troubleshooting

### Redis not showing locations
**Possible Causes**:
- Location endpoint not being called (check API response)
- Validation failing (check backend logs)
- Keys using wrong format

**Fix**:
```bash
docker-compose logs backend | grep -i "location\|error"
```

### Throttling not working
**Possible Causes**:
- Timestamp comparison issue
- Redis key not being set

**Fix**:
```bash
# Check in Redis
> GET last_update:$SESSION_ID:$USER_ID
# Should return timestamp
```

### Mobile not sending updates
**Possible Causes**:
- WebSocket not connected
- Location permission denied
- Background pause is active

**Fix**:
- Check mobile console: `console.log('WS Status:', wsStatus)`
- Verify permission: Go to Settings → MeetUp → Location: "Always"
- Resume from background

### Audit events not appearing
**Possible Causes**:
- Migration partially failed
- DB connection issue
- Event logging code not executed

**Fix**:
```bash
# Check if columns exist
docker-compose exec backend python -c "
from sqlalchemy import inspect
from app.core.database import engine
inspector = inspect(engine)
print([c['name'] for c in inspector.get_columns('audit_events')])
"
```

---

## ⏱️ Time Summary

| Task | Time |
|------|------|
| DB verification | 1 min |
| Redis TTL test | 3 min |
| Throttling test | 2 min |
| Snapshot test | 1 min |
| Audit logging test | 2 min |
| Mobile background test | 3 min |
| Mobile UI controls test | 3 min |
| **Total** | **~15 min** |

---

## ✅ Final Validation

Once all tests pass:

1. ✅ Run all tests together (no manual waits):
```bash
# Run a quick smoke test
docker-compose exec backend python tests/test_week4.py
```

2. ✅ Check logs for errors:
```bash
docker-compose logs backend | grep -i error
docker-compose logs mobile | grep -i error
```

3. ✅ Celebrate—Week 4 is done! 🎉

