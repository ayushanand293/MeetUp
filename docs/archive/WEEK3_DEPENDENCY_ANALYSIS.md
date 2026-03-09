# Week 3: Scale Proof - Dependency Analysis

## Can You Do Week 3 Without Blocking Your Partner?

**Short Answer: YES ✅** — Nearly all your Week 3 work is internal backend refactoring. The WebSocket protocol stays unchanged, so mobile can work with either old or new backend.

---

## Dependency Breakdown

### 🟢 NO DEPENDENCY (Can do independently)

#### Backend Tasks (Your Work)
1. **Redis pub/sub channel per session_id** ✅
   - Internal refactor
   - ConnectionManager still exports same interface
   - Protocol unchanged
   - Mobile: No changes needed

2. **Make realtime gateway stateless** ✅
   - Just moves session state to Redis instead of memory
   - Broadcast behavior identical
   - Protocol unchanged
   - Mobile: No changes needed

3. **Support docker-compose scaling** ✅
   - 2 instances behind load balancer or same port
   - Completely transparent to clients
   - Same WebSocket URL
   - Mobile: No changes needed

4. **Server-side validation (timestamps, coords, jumps)** ✅
   - Backend rejects invalid messages
   - Doesn't change what mobile sends
   - Mobile: No changes needed (can improve validation later)

5. **Rate limiting in Redis** ✅
   - Silently enforces limits
   - Returns `error` event if limit exceeded (already in protocol)
   - Mobile: Already handles error events

6. **Metrics skeleton** ✅
   - Pure backend monitoring
   - No client-side impact
   - Mobile: No changes needed

7. **ARCHITECTURE.md documentation** ✅
   - Reference docs
   - Mobile: No changes needed

**Subtotal: 7/7 completely independent** ✅

#### Web & Mobile Tasks (Partner's Work - No Dependencies on Your Changes)
- Mobile reconnect logic → Doesn't depend on Redis refactor
- Mobile last-seen display → Already in protocol
- Web reconnection → Same protocol
- These will work with OLD ConnectionManager too

---

## Critical: Keep These Unchanged

To ensure zero friction with mobile:

### ✅ Keep These Identical

1. **WebSocket Protocol** (`PROTOCOL.md`)
   ```
   Same events:
   - location_update (client → server)
   - peer_location (server → client)
   - presence_update (server → client)
   - session_ended (server → client)
   - error (server → client)
   ```
   No changes needed for Week 3!

2. **ConnectionManager Interface**
   ```python
   # Keep these method signatures identical:
   async def connect(session_id, user_id, websocket)
   async def disconnect(session_id, websocket)
   async def broadcast(session_id, message, exclude_user=None)
   async def broadcast_presence(session_id, user_id, status)
   ```

3. **Error Handling**
   - Still return `{type: "error", payload: {code, message}}`
   - Mobile already handles this

4. **Auth Flow**
   - Still use JWT token query param
   - Still validate with SUPABASE_KEY
   - No changes needed

---

## Implementation Strategy (To Maximize Parallelism)

### Phase A (This Week - Can Start Immediately)
**You work on**:
- [ ] Redis pub/sub implementation
- [ ] Stateless gateway refactor
- [ ] Multi-instance setup
- [ ] Validation layer
- [ ] Rate limiting

**Your Partner works on**:
- [ ] Mobile reconnect logic
- [ ] Last-seen timestamp display
- [ ] Web client reconnect parity

No blocking between you! ✅

### Phase B (Next Week - Integration)
**You work on**:
- [ ] Metrics
- [ ] ARCHITECTURE.md

**Your Partner**:
- [ ] Integration testing with new backend
- [ ] QA on reconnect scenarios

---

## Week 3 Dependency Matrix

| Your Task | Blocks Mobile? | Blocks Web? | Blocks Partner? | Notes |
|-----------|---|---|---|---|
| Redis pub/sub | ❌ No | ❌ No | ❌ No | Internal refactor |
| Stateless gateway | ❌ No | ❌ No | ❌ No | Same interface externally |
| Multi-instance support | ❌ No | ❌ No | ❌ No | Transparent to clients |
| Validation | ❌ No | ❌ No | ❌ No | Silent enforcement |
| Rate limiting | ❌ No | ❌ No | ❌ No | Already in protocol (error event) |
| Metrics | ❌ No | ❌ No | ❌ No | Backend only |
| ARCHITECTURE.md | ❌ No | ❌ No | ❌ No | Docs only |
| **Partner's Tasks** |
| Reconnect logic | — | — | ✅ Might improve | Works with both old & new backend |
| Last-seen display | — | — | ✅ Improves UX | Already in protocol |
| Web reconnect | — | — | ✅ Might improve | Works with both old & new backend |

---

## Timeline Recommendation

**Week 3 (Parallel Work)**:
- **Day 1-2**: You start Redis pub/sub refactor + validation
- **Day 2-3**: Partner starts reconnect logic
- **Day 3-4**: You finish stateless gateway + multi-instance
- **Day 4-5**: Parallel integration testing
- **Day 5**: Partner finishes UI enhancements, you finish docs

**No sequence dependencies** — You can all work in parallel!

---

## Testing Strategy (To Verify No Regressions)

To ensure your refactor doesn't break mobile:

1. **Keep tests in `test_realtime.py` passing**:
   ```bash
   docker-compose exec backend pytest tests/test_realtime.py -v
   ```
   These tests don't know about Redis internals, only behavior.

2. **Protocol compliance**:
   - All events still have same JSON structure
   - All error codes documented
   - Use `web/client.html` to test manually

3. **Backward compatibility**:
   - Old mobile client should work with new backend
   - New mobile client should work with old backend (protocol unchanged)

---

## Gotchas to Avoid

### ❌ DON'T:
1. Change the WebSocket event format
   ```
   ❌ DON'T: {type: "location_update", payload: {lat, lon, v2_schema}}
   ✅ DO: Keep same {type, payload} structure
   ```

2. Change how errors are reported
   ```
   ❌ DON'T: {error: "RATE_LIMIT"}
   ✅ DO: {type: "error", payload: {code: "RATE_LIMIT_EXCEEDED", message: "..."}}
   ```

3. Remove event types
   ```
   ❌ DON'T: Remove presence_update
   ✅ DO: Keep all events, even if rarely used
   ```

4. Change Redis keys/structure in a way that affects protocol
   ```
   ❌ DON'T: Move user_id to a different field
   ✅ DO: Keep peer_location.payload.user_id exactly as is
   ```

### ✅ DO:
1. Refactor `ConnectionManager` internally however you want
2. Change `__init__`, helper methods, private attributes freely
3. Add validation/rate-limiting transparently
4. Use Redis however fits
5. Add metrics/logging liberally

---

## Success Criteria for Week 3

**Backend (You)**:
- [ ] Tests still pass with Redis pub/sub
- [ ] 2 instances can run and sync messages
- [ ] Validation rejects bad data gracefully
- [ ] Rate limiting enforces with error backoff
- [ ] ARCHITECTURE.md documents the new setup

**Integration (With Partner)**:
- [ ] Mobile works with new backend (no changes needed)
- [ ] Web debugger works with new backend (no changes needed)
- [ ] Demo shows 2 backend instances seamlessly serving clients

**Zero Incompatibilities**: Protocol unchanged = zero breaking changes ✅

---

## Implementation Checklist for You

### Part 1: Redis Integration
- [ ] Add Redis connection to `app/core/database.py` (or new `redis.py`)
- [ ] Update `ConnectionManager`:
  - [ ] Replace in-memory `active_sessions` with Redis HSET
  - [ ] Subscribe to session channels on first connection
  - [ ] Publish to channels on broadcast
  - [ ] Keep `ws_to_user` dict in-memory (per-instance)
- [ ] Keep broadcast interface identical

### Part 2: Stateless Gateway
- [ ] Remove global `manager` singleton assumption
- [ ] Can instantiate multiple ConnectionManagers per instance
- [ ] Redis pub/sub makes them all see same messages
- [ ] Each instance only knows its own WebSocket connections

### Part 3: Multi-Instance
- [ ] Docker Compose: 2x backend service
- [ ] Nginx/Load balancer routes `/ws/meetup` to any instance
- [ ] Test: Connect 2 clients to different instances, see cross-instance broadcast

### Part 4: Validation
- [ ] Add `app/core/validation.py`:
  - [ ] `validate_location(lat, lon, accuracy)` - reject invalid coords
  - [ ] `validate_timestamp(ts)` - reject too-old or future times
  - [ ] `detect_jump(prev_loc, new_loc)` - warn on impossible speed
- [ ] Apply in realtime.py endpoint before broadcasting

### Part 5: Rate Limiting
- [ ] Redis INCR with key `rate:{session}:{user}` (window: 1 second)
- [ ] Threshold: 10 messages/sec per user
- [ ] Return error event if exceeded
- [ ] Already in protocol: `{type: "error", payload: {code: "RATE_LIMIT_EXCEEDED", ...}}`

### Part 6: Metrics
- [ ] Add `app/core/metrics.py`:
  - [ ] Counter: active_sessions (increment on connect, decrement on disconnect)
  - [ ] Counter: total_ws_connections (increment once per connect)
  - [ ] Gauge: websocket_connections (connections right now)
  - [ ] Counter: messages_received (per event type)
  - [ ] In-memory OK for now (can export to Prometheus later)
- [ ] Expose at new endpoint: `GET /metrics` (JSON response)

### Part 7: Documentation
- [ ] Create `ARCHITECTURE.md`:
  - [ ] Diagram: API ↔ WS ↔ Redis ↔ DB
  - [ ] Explain session rooms (Redis pub/sub channels)
  - [ ] Explain stateless instances & horizontal scaling
  - [ ] Explain validation & rate limiting
  - [ ] Failure modes: Redis down, instance crash, network partition
  - [ ] Recovery: reconnect logic, message replay (if needed)

---

## Files to Create/Modify

```
backend/app/
├── core/
│   ├── database.py        (already exists, no changes needed)
│   ├── redis.py          (CREATE - Redis connection pool)
│   ├── validation.py     (CREATE - location validation)
│   ├── metrics.py        (CREATE - in-memory metrics)
│   └── config.py         (UPDATE - add REDIS_URL if not there)
├── api/
│   └── endpoints/
│       ├── realtime.py   (UPDATE - add validation, rate limiting)
│       └── metrics.py    (CREATE - GET /metrics endpoint)
└── realtime/
    ├── connection_manager.py  (REFACTOR - use Redis pub/sub)
    └── schemas.py            (no changes needed)

ARCHITECTURE.md            (CREATE - new file)
docker-compose.yml         (UPDATE - 2x backend service)
```

---

## Example Redis Architecture

```
Session 1 (uuid-1234):
  Redis Channel: session:uuid-1234
  
  Instance 1:
    ws_to_user: {ws1 → user-alice, ws2 → user-bob}
    Subscribe: session:uuid-1234
  
  Instance 2:
    ws_to_user: {ws3 → user-charlie}
    Subscribe: session:uuid-1234

Flow:
  Alice (Instance 1) sends location_update
    → realtime.py validates
    → ConnectionManager.broadcast() publishes to Redis session:uuid-1234
    → Instance 1 receives on channel, sends to ws2 (Bob)
    → Instance 2 receives on channel, sends to ws3 (Charlie)
    → All see update simultaneously
```

---

## Summary

✅ **Can you do Week 3 independently?** YES
- 7/7 of your tasks have zero dependency on mobile/web
- Protocol stays unchanged
- Mobile/web can continue in parallel
- No blocking points

✅ **Will it work together?** YES
- Tests will still pass
- Same JSON protocol
- Transparent refactor
- Better performance & scalability

🚀 **Recommended**: Start right away. Partner can start reconnect logic immediately too. You'll finish independently and integrate seamlessly.

**Time to integration**: Near zero — protocol compatibility is 100% maintained.
