# Week 4 Implementation Plan - Privacy + Correctness
**Status**: Ready to Start  
**Target Completion**: 1 week  
**Priority**: HIGH - Addresses privacy (TTL) and reliability (throttling)

---

## 📋 Quick Overview

### What Week 4 Does
- Stores location data **ephemeral** (120s TTL) instead of permanently
- Enforces **per-user throttling** (1 update per 2 seconds, not 10/sec)
- Adds **snapshot endpoint** for offline support
- **Privacy**: Mobile app can pause/stop sharing
- **Audit**: Minimal DB logging of session lifecycle

### Why This Matters
- **Privacy**: User locations don't persist indefinitely
- **Compliance**: GDPR-friendly (no permanent location history)
- **Cost**: Less Redis memory, less DB writes
- **Reliability**: Graceful handling of background app behavior

---

## 🔧 Backend Implementation (4 tasks)

### Task 1: Redis TTL Location Storage
**File**: `backend/app/api/endpoints/realtime.py` (modify)  
**Goal**: Store locations in Redis with 120s TTL, not in memory

#### What to Change
Currently: Locations stored in connection_manager memory (lost on restart)  
Target: Store in Redis as `loc:{session_id}:{user_id}` with TTL

#### Implementation Steps

1. In `realtime.py` websocket endpoint, after location validation:
```python
# After line 160 (location validation passes)
# 10. Store location in Redis with TTL
redis_client = await get_redis()
location_key = f"loc:{session_uuid}:{user_id}"
location_data = {
    "lat": payload.lat,
    "lon": payload.lon,
    "accuracy_m": payload.accuracy_m,
    "timestamp": payload.timestamp,
    "updated_at": datetime.utcnow().isoformat(),
}
await redis_client.setex(
    location_key,
    120,  # 120 second TTL
    json.dumps(location_data)
)
```

**Tests to Add**:
- [ ] Location expires after 120s
- [ ] Location updates reset TTL
- [ ] Multiple users in same session have separate keys

---

### Task 2: Session Snapshot Endpoint
**File**: `backend/app/api/endpoints/sessions.py` (new endpoint)  
**Goal**: Return last known locations for all participants

#### Implementation

Add new endpoint to `sessions.py`:

```python
@router.get("/{session_id}/snapshot")
async def get_session_snapshot(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Get last known locations of all participants in active session."""
    
    # Verify session exists and user is participant
    session = db.query(MeetSession).filter(MeetSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    participant = (
        db.query(SessionParticipant)
        .filter(
            SessionParticipant.session_id == session_id,
            SessionParticipant.user_id == current_user.id,
        )
        .first()
    )
    if not participant:
        raise HTTPException(status_code=403, detail="Not a participant")
    
    # Get all participants
    participants = (
        db.query(SessionParticipant, User)
        .join(User)
        .filter(SessionParticipant.session_id == session_id)
        .all()
    )
    
    # Fetch locations from Redis
    redis_client = await get_redis()
    locations = {}
    
    for part, user in participants:
        location_key = f"loc:{session_id}:{user.id}"
        location_data = await redis_client.get(location_key)
        
        if location_data:
            locations[str(user.id)] = json.loads(location_data)
        else:
            locations[str(user.id)] = None
    
    return {
        "session_id": str(session.id),
        "status": session.status,
        "locations": locations,
        "timestamp": datetime.utcnow().isoformat(),
    }
```

**Tests to Add**:
- [ ] Snapshot returns all participant locations
- [ ] Snapshot shows null for stale locations
- [ ] Only participants can access snapshot

---

### Task 3: Improved Server-Side Throttling
**File**: `backend/app/api/endpoints/realtime.py` (modify)  
**Goal**: Change from 10 msg/sec to 1 update per 2 seconds per user

#### Current Implementation (Lines 93-107)
```python
# Rate limiting check
rate_limit_key = f"{session_uuid}:{user_id}"
count = await redis_client.incr(f"ratelimit:{rate_limit_key}")

if count == 1:
    await redis_client.expire(f"ratelimit:{rate_limit_key}", RATE_LIMIT_WINDOW_SEC)

if count > RATE_LIMIT_MESSAGES_PER_SEC:
    track_rate_limit_hit()
    error_event = ErrorEvent(...)
    await websocket.send_text(error_event.model_dump_json())
    continue
```

#### New Implementation
Replace with "last update timestamp" approach:

```python
# 5. Rate limiting: allow 1 update per 2 seconds per user
redis_client = await get_redis()
last_update_key = f"last_update:{session_uuid}:{user_id}"
last_update_ts = await redis_client.get(last_update_key)

if last_update_ts:
    last_update = float(last_update_ts)
    now = datetime.utcnow().timestamp()
    if (now - last_update) < 2.0:  # Less than 2 seconds
        track_rate_limit_hit()
        error_event = ErrorEvent(
            payload=ErrorPayload(
                code="RATE_LIMIT_EXCEEDED",
                message="Maximum 1 location update per 2 seconds",
            )
        )
        await websocket.send_text(error_event.model_dump_json())
        continue

# Update last_update timestamp (with 5s TTL for cleanup)
await redis_client.setex(
    last_update_key,
    5,
    str(datetime.utcnow().timestamp())
)
```

**Tests to Add**:
- [ ] Allow 1st update immediately
- [ ] Block 2nd update within 2 seconds
- [ ] Allow 2nd update after 2 seconds
- [ ] Different users have independent throttling

---

### Task 4: Audit Event Logging
**File**: `backend/app/api/endpoints/sessions.py` (modify)  
**Goal**: Log session lifecycle events to DB for compliance

#### What to Log
- Session created
- Session ended (+ reason)
- User joined
- User left

#### Implementation

Create helper function in `sessions.py`:

```python
from app.models.audit import AuditEvent  # You may need to create this model
from datetime import datetime, timezone

async def _log_audit_event(
    db: Session,
    event_type: str,  # "SESSION_CREATED", "SESSION_ENDED", etc
    session_id: UUID,
    user_id: UUID,
    details: dict = None,
):
    """Log audit event for compliance."""
    event = AuditEvent(
        event_type=event_type,
        session_id=session_id,
        user_id=user_id,
        details=details or {},
        timestamp=datetime.now(timezone.utc),
    )
    db.add(event)
    db.commit()
```

Then call in session lifecycle:

```python
# In create_session_from_request (after session created)
await _log_audit_event(
    db,
    "SESSION_CREATED",
    session.id,
    current_user.id,
    {"request_id": str(request_id)},
)

# In end_session (after session ended)
await _log_audit_event(
    db,
    "SESSION_ENDED",
    session_id,
    current_user.id,
    {"reason": reason},
)
```

**Tests to Add**:
- [ ] Audit entries created on session start
- [ ] Audit entries created on session end
- [ ] Audit entries contain correct timestamps

---

## 📱 Mobile Implementation (2 tasks)

### Task 5: Background App Pause Handling
**File**: `mobile/src/services/locationService.js` (modify)  
**Goal**: Stop sending location when app is backgrounded

#### Implementation

Add AppState listener:

```javascript
import { AppState } from 'react-native';

// In LocationService constructor
this.appState = AppState.currentState;
this.appStateSubscription = null;

// Add new method
setupBackgroundListener() {
  this.appStateSubscription = AppState.addEventListener('change', (state) => {
    console.log('[LocationService] App state changed to:', state);
    
    if (state === 'background' || state === 'inactive') {
      console.log('[LocationService] Pausing location updates');
      this.pauseTracking();
    } else if (state === 'active') {
      console.log('[LocationService] Resuming location updates');
      this.resumeTracking();
    }
  });
}

// Add pause/resume methods
pauseTracking() {
  if (this.watcher) {
    Location.removeTaskAsync(this.watcher);
    this.watcher = null;
  }
}

async resumeTracking() {
  // Restart tracking
  await this.startTracking(this.listeners[0]);
}

// Update dispose to remove listener
dispose() {
  if (this.appStateSubscription) {
    this.appStateSubscription.remove();
  }
  // ... rest of cleanup
}
```

Then call in `ActiveSessionScreen.js` during init:

```javascript
locationService.setupBackgroundListener();
```

**Tests to Add**:
- [ ] Tracking pauses when app backgrounded
- [ ] Tracking resumes when app returns to foreground
- [ ] WebSocket continues sending (client-side state)

---

### Task 6: Privacy Controls UI
**File**: `mobile/src/screens/ActiveSessionScreen.js` (modify)  
**Goal**: Add pause/resume sharing buttons

#### Implementation

Add buttons in the bottom panel:

```javascript
// Add state
const [isSharingPaused, setIsSharingPaused] = useState(false);

// Add handler
const handleTogglePauseSharing = () => {
  setIsSharingPaused(!isSharingPaused);
  
  if (!isSharingPaused) {
    // Pause: stop sending location updates
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
    }
    Alert.alert('Sharing Paused', 'Your location is no longer being shared.');
  } else {
    // Resume: restart location streaming
    startLocationStreaming();
    Alert.alert('Sharing Resumed', 'Your location is being shared again.');
  }
};

// In bottom panel, add buttons
<View style={styles.controlButtons}>
  <TouchableOpacity
    style={[
      styles.controlButton,
      isSharingPaused && styles.buttonActive,
    ]}
    onPress={handleTogglePauseSharing}
  >
    <Text style={styles.buttonIcon}>
      {isSharingPaused ? '▶️' : '⏸️'}
    </Text>
    <Text style={styles.buttonLabel}>
      {isSharingPaused ? 'Resume' : 'Pause'}
    </Text>
  </TouchableOpacity>
  
  <TouchableOpacity
    style={styles.controlButton}
    onPress={handleEndSession}
  >
    <Text style={styles.buttonIcon}>🛑</Text>
    <Text style={styles.buttonLabel}>Stop Sharing</Text>
  </TouchableOpacity>
</View>
```

**Tests to Add**:
- [ ] Pause button stops sending updates
- [ ] Resume button starts sending again
- [ ] Peer can still see last known location while paused
- [ ] "Sharing Paused" state visible in UI

---

## 🧪 Testing (Task 7)

### Unit Tests to Add

**File**: `backend/tests/test_privacy.py` (new)

```python
# Test TTL behavior
def test_location_ttl():
    """Location expires after 120s"""
    # Create location in Redis
    # Wait 119s - should exist
    # Wait 1s more - should be gone

# Test throttling
def test_throttling_per_user():
    """Different users have independent throttling"""
    # User A sends update (OK)
    # User A sends again immediately (blocked)
    # User B sends immediately (OK)

# Test snapshot
def test_snapshot_endpoint():
    """Snapshot returns all locations"""
    # Create session with 2 users
    # Both send locations
    # Snapshot should have both

# Test audit logging
def test_audit_logging():
    """Session events logged to audit table"""
    # Create session - check audit
    # End session - check audit
    # Verify timestamps
```

**File**: `mobile/__tests__/background.test.js` (new)

```javascript
// Test background pause
describe('Background Pause Handling', () => {
  it('pauses tracking when app backgrounded', () => {
    // ...
  });
  
  it('resumes tracking when app returns to foreground', () => {
    // ...
  });
});
```

---

## 📝 Logging (Task 8)

### Add Request ID Tracking

**File**: `backend/app/core/logging.py` (create new)

```python
import uuid
from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar('request_id', default=None)

def get_request_id():
    return request_id_var.get() or str(uuid.uuid4())

class RequestIDMiddleware:
    async def __call__(self, request, call_next):
        request_id = request.headers.get('X-Request-ID', str(uuid.uuid4()))
        request_id_var.set(request_id)
        
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
```

Add to `main.py`:

```python
from app.core.logging import RequestIDMiddleware

app.add_middleware(RequestIDMiddleware)
```

Then use in logs:
```python
logger.info(f"[{get_request_id()}] Location update received", extra={"request_id": get_request_id()})
```

---

## ✅ Week 4 Deliverables

### By End of Week

1. **Backend**
   - [ ] Redis TTL location storage working (120s)
   - [ ] Snapshot endpoint returns live locations
   - [ ] Per-user throttling enforced (1 per 2s)
   - [ ] Audit logging on session lifecycle
   - [ ] All tests passing

2. **Mobile**
   - [ ] App pauses location sharing when backgrounded
   - [ ] Resume works cleanly on foreground
   - [ ] UI controls for pause/resume
   - [ ] "Sharing Paused" state visible

3. **Demo**
   - [ ] Show location expires after TTL
   - [ ] Show throttling rejection
   - [ ] Show pause/resume controls
   - [ ] Show audit logs in DB

---

## 🚀 Implementation Order

1. Start with **Task 1** (Redis TTL) - core privacy feature
2. Then **Task 2** (Snapshot endpoint) - depends on Task 1
3. Then **Task 3** (Throttling) - improves Task 1
4. Then **Task 4** (Audit logging) - compliance, independent
5. Parallel: **Task 5** (Background pause) - mobile
6. Then **Task 6** (Privacy UI) - depends on Task 5
7. Finally **Task 7-8** (Tests + Logging)

---

## 📊 Estimated Time

| Task | Complexity | Time | Status |
|------|-----------|------|--------|
| Task 1: TTL Storage | Medium | 1-2h | Ready |
| Task 2: Snapshot | Medium | 1-2h | Ready |
| Task 3: Throttling | Easy | 30m | Ready |
| Task 4: Audit Logging | Easy | 30m | Ready |
| Task 5: Background Pause | Medium | 1-2h | Ready |
| Task 6: Privacy UI | Easy | 1h | Ready |
| Task 7: Unit Tests | Medium | 1-2h | Ready |
| Task 8: Structured Logging | Easy | 30m | Ready |
| **Total** | | **8-12h** | |

---

## 💡 Tips

- Keep Redis keys simple and TTL consistent (120s)
- Test throttling with multiple concurrent WebSocket connections
- Background pause is tricky on iOS - use AppState listener
- Audit logging can be async (fire-and-forget compatible)
- Write tests as you go, not at the end

---

**Status**: Ready to start! Begin with Task 1 (Redis TTL Storage).
