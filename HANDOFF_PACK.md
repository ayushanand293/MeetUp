# MeetUp Project Handoff Pack

**Last Updated:** 28 April 2026  
**Status:** OTP dev echo enabled; all backend tests passing (53/53); mobile UI implemented; ready for manual QA  
**Next Phase:** Wire real OTP provider (Twilio/AWS SNS); implement contacts-first Find Friends flow

---

## A) Repo Overview

### Tech Stack

**Backend:**
- Framework: FastAPI 0.104+
- Database: PostgreSQL 15 with PostGIS 3.3
- Caching/Sessions: Redis (Alpine)
- ORM: SQLAlchemy 2.0+
- Migrations: Alembic
- Authentication: JWT (HS256 by default, fallback to Supabase key)
- Rate Limiting: Redis INCR + EXPIRE (Fail-Closed)
- Metrics: In-memory counters + Redis store (backend/app/core/metrics_store.py)
- Realtime: WebSocket + Redis pub/sub for multi-instance broadcast
- Code Quality: Ruff, MyPy, Bandit (disabled in beta; pip-audit in CI)

**Mobile:**
- Framework: React Native (Expo SDK 54.0.33)
- Package Manager: npm
- Navigation: React Navigation 7.x
- Location: expo-location 19.0.8
- Contacts: expo-contacts 15.0.11
- Crypto: expo-crypto 15.0.7 (SHA256 digests)
- HTTP: axios 1.13.4
- State: React Context + AsyncStorage (no Supabase session for OTP)
- Code Quality: ESLint, Prettier

**Database:**
- PostgreSQL 15 (PostGIS for location queries if needed)
- Schema version: c9a7b6f8e2d1_phone_auth_contacts_digest (latest)
- Key tables: users, meet_requests, sessions, session_participants, invites, user_blocks, analytics_events

**Infrastructure:**
- Docker Compose (db, redis, backend services)
- CI/CD: GitHub Actions (ci.yml)
- Deployment: Unknown (not documented)

### How to Run Locally

**1. Start all services:**
```bash
cd /Users/ayushanand/Projects/MeetUp
docker-compose up -d --build
```

Wait for services to be healthy:
```bash
docker-compose ps
# All services should show "healthy" or "Up"
```

**2. Run database migrations:**
```bash
docker-compose exec backend alembic upgrade head
```

**3. Seed test data (optional):**
```bash
docker-compose exec backend python seed.py
```

**4. Start mobile app:**
```bash
cd mobile
npm install  # if needed
npm start
# Scan QR code with Expo Go or run on simulator
```

**5. Backend health checks:**
```bash
curl http://localhost:8000/health
# Expected: {"status":"ok","environment":"development"}

curl http://localhost:8000/ready
# Expected: {"status":"ok","components":{"database":"ok","redis":"ok"}}
```

### Key Directories and Entrypoints

```
backend/
  app/
    main.py                          # FastAPI app, CORS, middleware setup
    api/
      api.py                         # Router includes all endpoints
      endpoints/
        auth.py                      # OTP start/verify, JWT issuance (67-210 lines)
        users.py                     # GET /me, POST /profile, user profile mgmt
        contacts.py                  # GET /hash_config, POST /match (digest matching)
        invites.py                   # POST /, GET /{token}, POST /{token}/redeem
        requests.py                  # POST /, GET /pending, GET /outgoing, POST /{id}/accept
        sessions.py                  # Session creation, end, snapshot, participants
        blocks.py                    # User blocking/unblocking
        metrics.py                   # GET /metrics (Prometheus format)
        analytics.py                 # POST /analytics/events
        realtime.py                  # WebSocket: /ws/{token}
    core/
      config.py                      # Settings: env vars, defaults, JWT/OTP/contacts configs
      database.py                    # SQLAlchemy engine, Base class
      redis.py                       # Redis async client, singleton
      rate_limit.py                  # enforce_rate_limit, check_rate_limit (fail-closed)
      metrics.py                     # Global Metrics instance
      metrics_store.py               # In-memory counters/gauges + Redis persistence
      scrub.py                       # Phone masking, JWT redaction, PII scrubbing
      identity.py                    # Phone normalization, hashing, digest derivation
      validation.py                  # Location validation, participant checks
      proximity.py                   # Distance calculations, auto-end logic
    models/
      user.py                        # User table: phone_e164, phone_hash, phone_digest, email, display_name
      meet_request.py                # MeetRequest: requester_id, receiver_id, status, expires_at
      invite.py                      # Invite: token (unique), request_id (nullable), expires_at
      user_block.py                  # UserBlock: user_id, blocked_user_id (unique pair)
      session.py                     # Session: initiator_id, status, end_reason, ended_at
      session_participant.py         # SessionParticipant: session_id, user_id, joined_at
      analytics_event.py             # AnalyticsEvent: event_type, user_id, payload (JSONB)
    realtime/
      connection_manager.py          # WebSocket connection pool, Redis pub/sub
      schemas.py                     # LocationUpdateEvent, PeerLocationEvent, etc.
  alembic/
    env.py                           # Migration execution
    versions/                        # Migration files (see D) Data Model section)
  tests/
    conftest.py                      # Pytest fixtures, test client, mocked Redis
    test_otp_auth.py                 # 5 tests: start, verify, rate limit, profile, dev echo
    test_authorization.py            # IDOR checks
    test_rate_limits.py              # Rate limit enforcement
    test_contacts_match.py           # Digest matching, cap, rate limit
    test_invite_accept_flow.py       # Token resolve, redeem, idempotency
    test_realtime.py                 # WebSocket connection, rate limit, broadcast
    test_metrics*.py                 # Metrics persistence and export
  requirements.txt                   # Python deps

mobile/
  index.js                           # Expo app entry
  src/
    App.jsx                          # Main navigation tree
    api/
      client.js                      # axios instance, BASE_URL={EXPO_PUBLIC_API_URL}
      authStorage.js                 # AsyncStorage: getAccessToken, setSession, clearSession
    context/
      AuthContext.js                 # OTP login, token management, deep link handling
    screens/
      LoginScreen.js                 # Phone input + OTP entry
      FriendListScreen.js            # Contacts matching, "On MeetUp" vs "Invite" sections
      AcceptRequestScreen.js         # Deep-link accept invite, show request context
      ActiveSessionScreen.js         # Location sharing, proximity-based auto-end
      SettingsScreen.js              # Profile: phone (display-only), name, email
    services/
      analyticsService.js            # Track events to /analytics/events
    components/                      # UI components (map, location, status, etc.)
  app.json                           # Expo config, scheme: "meetup://" for deep links
  eas.json                           # EAS build config (if using Expo)

docs/
  config.md                          # Environment variable documentation
  SECURITY.md                        # Security requirements, scanning commands
  ops_predeploy.md                   # Pre-deployment checklist

scripts/
  beta_smoke.sh                      # Quick smoke test (OTP, invites, realtime)
  simulate_movement.sh               # Generate fake location updates
  run_session_cleanup.sh             # Trigger session expiry worker (if async)
```

---

## B) Core Product Behavior (Current)

### User Flows Implemented

**1. OTP Phone Authentication (Currently Implemented)**
```
User enters +E.164 phone → Send OTP → Backend stores OTP hash in Redis (5 min TTL)
→ User enters 6-digit code (dev_otp_code from /otp/start if DEV_ECHO_ENABLED)
→ Backend verifies against Redis hash → Creates or finds User record
→ Issues JWT token (24 hour TTL) → Token stored in AsyncStorage
→ User navigates to app
```

**2. Contacts-First Find Friends (Code Implemented, Integration Pending)**
```
User opens "Find Friends" → Mobile loads contacts → Client computes SHA256 digests
("v1:+15551234567") → POST /contacts/match with up to 500 digests
→ Backend matches digests against user phone_digest column
→ Returns list of User objects (only phone last 4 digits exposed) with "On MeetUp" flag
→ User can tap "Invite" to trigger invite creation OR accept if already friends
```

**3. Invite/Deep-link Accept Flow (Implemented)**
```
User A creates invite → Backend generates URL-safe token (24 hr expire)
→ User A shares link (meetup://invites?token=abc123)
→ User B opens link → Mobile intercepts deep link → Calls GET /invites/{token} (public)
→ Returns invite_id, request_id (nullable), expires_at, redeemed_at
→ If request_id present, shows request details ("User A wants to meet")
→ User B taps "Accept" → POST /invites/{token}/redeem (requires auth)
→ Backend atomically: marks invite as redeemed, creates session, returns session_id
→ Mobile navigates to ActiveSessionScreen
```

**4. Session Request Flow**
```
User A sends request to User B → Creates MeetRequest (10 min TTL, PENDING status)
→ User B sees in pending list → Taps "Accept" → Creates session from request
→ Both users in ActiveSessionScreen → Share locations via WebSocket
→ Session ends: manual (both tap "End") OR proximity (auto-end if >X meters for Y seconds)
→ Session marked as ENDED with end_reason (MANUAL or PROXIMITY_THRESHOLD)
```

### Deep Link Formats Currently Supported

**Format 1: Invite Token Deep Link**
```
meetup://invites?token={URL_safe_base58_token}

Example: meetup://invites?token=5KQwXEb9CWFq2

Behavior:
1. Mobile intercepts via Linking.addEventListener
2. Calls GET /invites/{token} (NO auth required - public resolution)
3. Receives: invite_id, request_id (nullable), expires_at, redeemed_at
4. Calls POST /invites/{token}/redeem (WITH auth - creates session atomically)
5. Routes to: AcceptRequestScreen (if request_id) or HomeScreen
6. Tracks: deep_link_opened, deep_link_route_prepared, deep_link_invite_resolution_failed
```

**Format 2: Magic Link (Planned, Not Yet Wired)**
```
meetup://auth?access_token={jwt}&refresh_token={...}
meetup://auth?code={oauth_code}

Current Status: Placeholder in AuthContext, not fully implemented
```

### Session Lifecycle Rules

**Session Creation:**
- Triggered by: `POST /requests/{request_id}/accept` or `POST /invites/{token}/redeem`
- Status: ACTIVE
- Participants: initiator_id + receiver_id (exactly 2)
- Started: Immediately, recorded in session.created_at

**Session Duration:**
- **Manual End:** Either participant taps "End Session" → `POST /sessions/{session_id}/end` → Status=ENDED, end_reason=MANUAL
- **Proximity-Based Auto-End:** If both participants >Xm apart for Ys → Backend auto-ends → Status=ENDED, end_reason=PROXIMITY_THRESHOLD
  - Default threshold: Unknown (check backend/app/core/proximity.py)
  - Window: Unknown (check adaptive_threshold_m function)
- **Max Duration:** Unknown (not documented; check session.py for max_duration field)
- **TTL:** Unknown

**Participant Presence:**
- WebSocket connection required to receive real-time updates
- Location updates every ~N seconds (configurable, default unknown)
- Disconnection does NOT immediately end session (resilient to network glitches)
- Server tracks last_known_location for up to 600 seconds (LAST_LOCATION_TTL_SECONDS in realtime.py:46)

### Foreground vs Background Location Behavior

**Foreground (App in focus):**
- expo-location queries device GPS every N seconds
- Updates sent via WebSocket to peers in real-time
- Rendered on map in ActiveSessionScreen

**Background (App backgrounded):**
- Behavior: Unknown
- Likely: expo-location continues with lower frequency OR stops entirely
- Risk: Stale location data if user leaves app during session
- Mitigation: Unknown (not documented)

---

## C) Backend API Inventory (Current)

### Authentication

| Path | Method | Auth | Rule | Implementation |
|------|--------|------|------|---|
| `/auth/otp/start` | POST | None | Public | backend/app/api/endpoints/auth.py:93-134 |
| `/auth/otp/verify` | POST | None | Public | backend/app/api/endpoints/auth.py:135-206 |
| `/auth/session/validate` | POST | JWT | Current user | backend/app/api/endpoints/auth.py:66-88 |
| `/auth/session/signout-other-devices` | POST | JWT | Current user | backend/app/api/endpoints/auth.py:207+ |

**Rate Limits (Backend/app/core/config.py):**
- OTP_START_LIMIT_PER_PHONE: 5/min
- OTP_START_LIMIT_PER_IP: 20/min
- OTP_VERIFY_LIMIT_PER_PHONE: 10/min
- OTP_VERIFY_LIMIT_PER_IP: 30/min

### Users

| Path | Method | Auth | Rule | Implementation |
|------|--------|------|------|---|
| `/users/me` | GET | JWT | Current user info | backend/app/api/endpoints/users.py:19-29 |
| `/users/profile` | POST | JWT | Update own profile (display_name, email) | backend/app/api/endpoints/users.py:30-61 |
| `/users/search` | GET | JWT | Search users by display_name | backend/app/api/endpoints/users.py:62+ |

### Contacts (Digest Matching)

| Path | Method | Auth | Rule | Implementation |
|------|--------|------|------|---|
| `/contacts/hash_config` | GET | None | Public config (hash version) | backend/app/api/endpoints/contacts.py:21-25 |
| `/contacts/match` | POST | JWT | Match digests against verified users | backend/app/api/endpoints/contacts.py:26-67 |

**Rate Limits:**
- CONTACTS_MATCH_LIMIT_PER_MINUTE: 30/user/min
- CONTACTS_MATCH_MAX_DIGESTS: 500 per request

### Meet Requests

| Path | Method | Auth | Rule | Implementation |
|------|--------|------|------|---|
| `/requests/` | POST | JWT | Create request to target user (10 min expiry) | backend/app/api/endpoints/requests.py:73-159 |
| `/requests/pending` | GET | JWT | List incoming requests for current user | backend/app/api/endpoints/requests.py:160-188 |
| `/requests/outgoing` | GET | JWT | List outgoing requests by current user | backend/app/api/endpoints/requests.py:189-220 |
| `/requests/{request_id}/accept` | POST | JWT | Accept request → create session | backend/app/api/endpoints/requests.py:221+ |

**Rate Limits:**
- Create request: Unknown (check code for enforce_rate_limit call)

### Sessions

| Path | Method | Auth | Rule | Implementation |
|------|--------|------|------|---|
| `/sessions/from-request/{request_id}` | POST | JWT | Create session from accepted request | backend/app/api/endpoints/sessions.py:62-135 |
| `/sessions/active` | GET | JWT | List all active sessions for user (initiator or participant) | backend/app/api/endpoints/sessions.py:136-175 |
| `/sessions/{session_id}/end` | POST | JWT | End session manually | backend/app/api/endpoints/sessions.py:176-231 |
| `/sessions/{session_id}/invite` | POST | JWT | Create invite link for session | backend/app/api/endpoints/sessions.py:232-265 |
| `/sessions/{session_id}/invite/redeem` | POST | JWT | Redeem invite → add third party to session | backend/app/api/endpoints/sessions.py:266-305 |
| `/sessions/{session_id}/snapshot` | GET | JWT + Participant check | Get latest state (participants, locations, end_reason) | backend/app/api/endpoints/sessions.py:306-348 |
| `/sessions/{session_id}/history` | GET | JWT | Get session history for user (past sessions) | backend/app/api/endpoints/sessions.py:349-407 |
| `/sessions/{session_id}/im-here` | POST | JWT + Participant check | Heartbeat (prevent timeout) | backend/app/api/endpoints/sessions.py:408-463 |
| `/sessions/{session_id}/participants` | GET | JWT + Participant check | List session participants with last known location | backend/app/api/endpoints/sessions.py:464+ |

**Rate Limits:**
- Session end: Likely unlimited (no enforce_rate_limit visible)
- Snapshot: Likely unlimited

### Invites

| Path | Method | Auth | Rule | Implementation |
|------|--------|------|------|---|
| `/invites/` | POST | JWT | Create invite (24 hr token, optional request_id) | backend/app/api/endpoints/invites.py:49-92 |
| `/invites/{token}` | GET | None | Public resolve (no auth) → returns invite details | backend/app/api/endpoints/invites.py:93-103 |
| `/invites/{token}/redeem` | POST | JWT | Redeem invite → create session, mark redeemed | backend/app/api/endpoints/invites.py:104-142 |

**Rate Limits:**
- Create invite: enforce_rate_limit("invite_create", user_id, 10, 60)

### Blocks

| Path | Method | Auth | Rule | Implementation |
|------|--------|------|------|---|
| `/blocks/` | POST | JWT | Block a user (idempotent) | backend/app/api/endpoints/blocks.py:20-47 |
| `/blocks/{blocked_user_id}` | DELETE | JWT | Unblock a user | backend/app/api/endpoints/blocks.py:48-65 |
| `/blocks/` | GET | JWT | List blocked user IDs | backend/app/api/endpoints/blocks.py:66-74 |

### Realtime (WebSocket)

| Path | Method | Auth | Rule | Implementation |
|------|--------|------|------|---|
| `/ws/{token}` | WS | JWT in token | Session participant → receive peer locations, session end events | backend/app/api/endpoints/realtime.py:1-200+ |

**WebSocket Message Format:**
- Incoming: `{"type": "location_update", "lat": 37.7749, "lon": -122.4194, "accuracy_m": 5}`
- Outgoing (broadcast): `{"type": "peer_location", "user_id": "uuid", "lat": ..., "lon": ..., "accuracy_m": ...}`
- Server-initiated: `{"type": "session_ended", "reason": "PROXIMITY_THRESHOLD"}`

**Rate Limits:**
- Messages: RATE_LIMIT_MESSAGES_PER_SEC = 10 msgs/sec per connection (realtime.py:42)
- Fail-Closed: If Redis down, connection rejected

### Monitoring & Observability

| Path | Method | Auth | Rule | Implementation |
|------|--------|------|------|---|
| `/health` | GET | None | Shallow health check | backend/app/main.py:47-49 |
| `/ready` | GET | None | Deep readiness (DB + Redis) | backend/app/main.py:51-73 |
| `/metrics` | GET | None | Prometheus format metrics | backend/app/api/endpoints/metrics.py:60-77 |
| `/analytics/events` | POST | None | Client event ingestion (analytics only) | backend/app/api/endpoints/metrics.py:78-95 |

---

## D) Data Model / Migrations

### Current Schema

**Table: users** (backend/app/models/user.py)
```sql
id                UUID PRIMARY KEY
phone_e164        VARCHAR(20) UNIQUE NOT NULL (E.164 format, e.g., +15551234567)
phone_verified_at TIMESTAMP NULL (Set on successful OTP verify)
phone_hash        VARCHAR(64) UNIQUE NOT NULL (SHA256(PHONE_HASH_PEPPER || phone_e164))
phone_digest      VARCHAR(64) UNIQUE NOT NULL (SHA256("v1:" || phone_e164))
email             VARCHAR UNIQUE NULL (Optional, can be set/cleared via profile)
display_name      VARCHAR(80) NULL
profile_data      JSONB DEFAULT {} (Flexible profile extension)
created_at        TIMESTAMP NOT NULL DEFAULT NOW()
```

**Table: meet_requests**
```sql
id          UUID PRIMARY KEY
requester_id   UUID NOT NULL FK users.id
receiver_id    UUID NOT NULL FK users.id
status      ENUM(PENDING, ACCEPTED, REJECTED, EXPIRED) DEFAULT PENDING
created_at  TIMESTAMP NOT NULL DEFAULT NOW()
expires_at  TIMESTAMP NOT NULL DEFAULT NOW() + 10 minutes
```

**Table: sessions**
```sql
id              UUID PRIMARY KEY
initiator_id    UUID NOT NULL FK users.id (Who started the session)
status          ENUM(ACTIVE, ENDED) DEFAULT ACTIVE
end_reason      VARCHAR NULL (MANUAL, PROXIMITY_THRESHOLD, TIMEOUT)
ended_at        TIMESTAMP NULL
created_at      TIMESTAMP NOT NULL DEFAULT NOW()
```

**Table: session_participants**
```sql
id              UUID PRIMARY KEY
session_id      UUID NOT NULL FK sessions.id
user_id         UUID NOT NULL FK users.id
joined_at       TIMESTAMP NOT NULL DEFAULT NOW()
left_at         TIMESTAMP NULL
```

**Table: invites**
```sql
id              UUID PRIMARY KEY
created_by      UUID NOT NULL FK users.id
recipient       VARCHAR NOT NULL (Display name or phone of recipient)
request_id      UUID NULL FK meet_requests.id (Optional, links invite to a request)
token           VARCHAR UNIQUE NOT NULL (Cryptographic token for deep link)
expires_at      TIMESTAMP NOT NULL DEFAULT NOW() + 24 hours
redeemed_at     TIMESTAMP NULL (Set when accept flow completes)
created_at      TIMESTAMP NOT NULL DEFAULT NOW()
```

**Table: user_blocks**
```sql
id              UUID PRIMARY KEY
user_id         UUID NOT NULL FK users.id (Who is blocking)
blocked_user_id UUID NOT NULL FK users.id (Who is blocked)
UNIQUE(user_id, blocked_user_id)
```

**Table: analytics_events**
```sql
id              UUID PRIMARY KEY
user_id         UUID NULL FK users.id
event_type      VARCHAR NOT NULL (e.g., "otp_start", "session_created", "location_update")
payload         JSONB DEFAULT {} (Event-specific data)
created_at      TIMESTAMP NOT NULL DEFAULT NOW()
```

### Migrations & Version History

| File | Migration Name | Status | What It Does |
|------|---|---|---|
| `058f0ed488ad_initial_tables.py` | initial_tables | Applied | Creates base: users, meet_requests, sessions, session_participants, analytics_events |
| `1f2a3b4c5d6e_add_analytics_events.py` | add_analytics_events | Applied | Adds analytics_events table |
| `6a9d9f4d2b10_add_invites_table.py` | add_invites_table | Applied | Adds invites table with token uniqueness |
| `89c299ca0e48_add_expired_to_requeststatus_enum.py` | add_expired_to_requeststatus_enum | Applied | Adds EXPIRED status to RequestStatus enum |
| `d3f5f0469bdd_add_user_blocks_table.py` | add_user_blocks_table | Applied | Adds user_blocks table for blocking feature |
| `fbaf08a8faec_add_expires_at_to_meet_requests.py` | add_expires_at_to_meet_requests | Applied | Adds expires_at to meet_requests (10 min TTL) |
| `c9a7b6f8e2d1_phone_auth_contacts_digest.py` | phone_auth_contacts_digest | Applied | **Latest**: Adds phone_e164, phone_verified_at, phone_hash, phone_digest, display_name; alters email to nullable |

**Run migrations:**
```bash
docker-compose exec backend alembic upgrade head
```

### Retention Policy

| Table | TTL / Cleanup | Implementation | Status |
|-------|---|---|---|
| users | Indefinite (no cleanup) | N/A | Permanent |
| meet_requests | 10 minutes (EXPIRED status) | Manual check on query, or background job | Unknown if background job runs |
| sessions | Indefinite (but tracked with end_reason and ended_at) | N/A | Permanent |
| session_participants | Indefinite | N/A | Permanent |
| invites | 24 hours (expires_at) | Manual check on query, or background cleanup | Unknown if cleanup runs |
| user_blocks | Indefinite | N/A | Permanent |
| analytics_events | Likely 30-90 days (Unknown) | Background cleanup (not visible) | Unknown retention window |

**TODO for next agent:** Check for background cleanup worker in `backend/app/worker/` or scheduled tasks.

### Indexes & Constraints

```sql
-- users
UNIQUE INDEX users_phone_e164_idx ON users(phone_e164)
UNIQUE INDEX users_phone_hash_idx ON users(phone_hash)
UNIQUE INDEX users_phone_digest_idx ON users(phone_digest)
UNIQUE INDEX users_email_idx ON users(email)

-- meet_requests
INDEX meet_requests_requester_id_idx ON meet_requests(requester_id)
INDEX meet_requests_receiver_id_idx ON meet_requests(receiver_id)

-- invites
UNIQUE INDEX invites_token_idx ON invites(token)
INDEX invites_created_by_idx ON invites(created_by)
INDEX invites_request_id_idx ON invites(request_id)

-- user_blocks
UNIQUE INDEX user_blocks_unique_pair_idx ON user_blocks(user_id, blocked_user_id)
```

---

## E) Realtime + Rate Limiting

### WebSocket Authentication & Participant Gating

**Connection Setup (realtime.py):**
1. Client connects to `ws://localhost:8000/api/v1/ws/{token}`
2. Token is JWT (extracted from query param or header)
3. Server verifies JWT signature using AUTH_JWT_SECRET (or SUPABASE_KEY)
4. Decoded JWT: { sub (user_id), phone_e164, email, iat, exp, iss, device_id (optional) }
5. On invalid/expired token: Connection rejected with 403 Unauthorized
6. On valid token: Connection accepted → `track_ws_connection_open(session_id)`

**Participant Gating (realtime.py):**
- On every message received: Check `is_session_participant_sync(user_id, session_id)` 
- If user NOT in session_participants table: Reject message → `{"type": "error", "message": "not_participant"}`
- If user IS participant: Process location_update

### Redis Pub/Sub Usage

**Broadcasting Session Updates:**
1. When participant A sends location_update → Server validates
2. Server publishes to Redis channel: `session:{session_id}:updates`
3. All backend instances subscribed to `session:{session_id}:updates` receive event
4. Each instance broadcasts to connected WebSocket clients in that session
5. Multi-instance resilience: If instance goes down, Redis queue persists during reconnect window

**Session End Notifications:**
1. When session.status → ENDED (either manual or proximity auto-end)
2. Server publishes `{"type": "session_ended", "reason": "..."}` to Redis channel
3. All participants receive notification immediately (or on next poll)

**Fail-Closed Behavior:**
- If Redis unavailable: `get_redis()` call in realtime.py throws exception
- Exception caught → Connection rejected
- Rate limiter also fails closed (check_rate_limit returns False if Redis down)

### WebSocket Rate Limiting (Short-Window)

**Configuration (realtime.py:42-43):**
```python
RATE_LIMIT_MESSAGES_PER_SEC = 10
RATE_LIMIT_WINDOW_SEC = 1
```

**Enforcement (realtime.py:120+):**
```
For each incoming message:
  key = f"ws_ratelimit:{user_id}:{session_id}"
  allowed = await check_rate_limit(
    "ws_location_update",
    key,
    RATE_LIMIT_MESSAGES_PER_SEC,
    RATE_LIMIT_WINDOW_SEC
  )
  if not allowed:
    return {"type": "error", "detail": "Rate limit exceeded"}
```

**Fail-Closed:** If Redis down, all messages rejected → Connection becomes unusable until Redis recovers.

### REST Rate Limiting

**OTP Endpoints:**
- `/auth/otp/start`: 5/min per phone + 20/min per IP (config.py:17-18)
- `/auth/otp/verify`: 10/min per phone + 30/min per IP (config.py:19-20)
- Implementation: `enforce_rate_limit()` in auth.py:99-105, 152-159
- Fail-Closed: Returns 429 if Redis down

**Contacts Endpoint:**
- `/contacts/match`: 30/min per authenticated user (config.py:24)
- Implementation: contacts.py:37-42
- Fail-Closed: Returns 429 if Redis down

**Invites:**
- `/invites/`: 10/min per user (invites.py:50)
- Fail-Closed: Returns 429 if Redis down

---

## F) Observability

### Metrics Endpoints

| Path | Format | Audience |
|------|--------|----------|
| `/metrics` | Prometheus text format | Prometheus scraper / monitoring stack |
| `/analytics/events` | JSON POST | Client event ingestion (no response body) |

### Metric Names Emitted (backend/app/core/metrics.py)

**Counters (incremented by 1 unless stated):**
```
otp_start_requests_total               # Each POST /otp/start
otp_verify_success_total               # Each successful POST /otp/verify
otp_verify_fail_total                  # Each failed POST /otp/verify
contacts_match_requests_total          # Each POST /contacts/match
ws_connections_opened                  # Each WebSocket connection established
ws_connections_active                  # +1 on open, -1 on close (gauge behavior)
sessions_created                       # Each new session
sessions_active                        # +1 on create, -1 on end (gauge behavior)
auto_end_count                         # Each proximity-triggered auto-end
manual_end_count                       # Each user-initiated end
session_start_latency_ms_total        # Sum of start latencies (divide by session_start_count for average)
session_start_count                    # Count of sessions started
message_received                       # Each WebSocket message received
rate_limit_hit                         # Each rate limit exceeded
validation_error                       # Each location validation failure
location_propagation_latency_ms        # Latency from client send to peer receive (ms)
```

**Gauges:**
```
ws_connections_active                  # Current active WebSocket connections
sessions_active                        # Current active sessions
```

### Metrics Backend Implementation

**Storage (backend/app/core/metrics_store.py):**
- Default: In-memory (Python dict with locks)
- Optional: Redis-backed (if METRICS_BACKEND=redis)
- Snapshots exported via `/metrics` endpoint every scrape

**Prometheus Scrape Config (Unknown):**
- Endpoint: `http://backend:8000/metrics`
- Interval: Likely 15s or 30s (not configured in repo; check Prometheus config)

**Grafana Dashboards:**
- Status: Unknown (no dashboard JSON files found in repo)
- TODO for next agent: Create Grafana dashboard if needed

### Export Format

```
# HELP otp_start_requests_total Counter of OTP start requests
# TYPE otp_start_requests_total counter
otp_start_requests_total 42

# HELP sessions_active Gauge of active sessions
# TYPE sessions_active gauge
sessions_active 3

# ... (all metrics in text format)
```

---

## G) CI/CD + Release Process

### GitHub Actions Workflows

**File: `.github/workflows/ci.yml`**

**Trigger:** Every push to main/master, every pull request

**Jobs:**

1. **backend-week4-tests** (ubuntu-latest, Python 3.11)
   - Checkout code
   - Start Docker services (db, redis, backend) with `--build`
   - Wait for backend health check (30 attempts × 2s = 60s timeout)
   - Run security + integration tests:
     ```
     pytest -q tests/test_otp_auth.py
     pytest -q tests/test_contacts_match.py
     pytest -q tests/test_invite_accept_flow.py
     pytest -q tests/test_authorization.py
     pytest -q tests/test_rate_limits.py
     pytest -q tests/test_metrics_store.py tests/test_metrics_cross_process.py
     ```
   - Run dependency security scan: `pip-audit --desc on`
   - Run legacy compatibility: `python test_week4_features.py`

2. **web-build** (ubuntu-latest, Node.js 20)
   - Checkout code
   - Install web deps: `npm ci`
   - Lint web: `npm run lint` (if script exists in web/package.json)
   - Build web: `npm run build` (if script exists)

**Mobile CI:** Not currently in CI/CD (would need EAS or similar for Expo)

### Beta Release Tag/Branch Policy

**Status:** Not documented in repo

**TODO for next agent:**
- Check for git tags matching `beta-*` or `release-*`
- Determine if beta releases automated or manual
- Set up EAS for mobile beta builds if needed

### Smoke Scripts & QA Docs

| File | Purpose | Status |
|------|---------|--------|
| `scripts/beta_smoke.sh` | Quick end-to-end test (OTP, invites, realtime) | Exists; executable |
| `test_otp_flow.sh` | Test OTP auth flow with dev echo | Exists; verified working |
| `docs/qa_invites.md` | Manual QA guide for invites | Exists |
| `docs/qa_contacts_and_invites.md` | Manual QA for contacts + invites | Unknown if exists |

**Run smoke test:**
```bash
chmod +x scripts/beta_smoke.sh
./scripts/beta_smoke.sh
```

---

## H) Security & Privacy Posture

### IDOR Fixes Implemented

**Test: backend/tests/test_authorization.py**

**Protected Endpoints (require session participation check):**
- `GET /sessions/{session_id}/snapshot` → Checks if current_user in session_participants
- `POST /sessions/{session_id}/end` → Checks if current_user is initiator_id
- `GET /sessions/{session_id}/participants` → Checks session participation
- `POST /sessions/{session_id}/im-here` → Checks session participation
- `POST /requests/{request_id}/accept` → Checks if current_user == receiver_id

**Protected Endpoints (ownership checks):**
- `POST /users/profile` → Only updates current user (sub from JWT)
- `POST /blocks/` → Only blocks for current user
- `DELETE /blocks/{blocked_user_id}` → Only unblocks for current user
- `GET /blocks/` → Returns only current user's blocks

**Public Endpoints (No check needed):**
- `GET /contacts/hash_config` → Public config
- `GET /invites/{token}` → Public (doesn't return sensitive data; hides raw phone)
- `/auth/otp/start`, `/auth/otp/verify` → Public (phone-based)
- `/health`, `/ready`, `/metrics` → Public

### Logging Scrubbing Rules

**Implementation: backend/app/core/scrub.py**

**Patterns Redacted:**
1. **JWTs:** `eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+` → `[REDACTED_JWT]`
2. **Secrets:** `(token|secret|key|password|bearer)=...` → `[REDACTED]`
3. **Phone Numbers:** `\+[1-9]\d{7,14}` → `+****7890` (last 4 visible)
4. **Coordinates:** `lat/lon=\d+\.\d+` → `[REDACTED_LOC]`

**Usage:**
```python
# In all log statements:
logger.info(scrub_sensitive(f"User {phone} started OTP"))
# Output: "User +****7890 started OTP"
```

**Enforcement:** Not automatic—must be manually applied to every log call. Risk: Developers may forget.

### CORS Policy

**Configuration (backend/app/main.py:22-35):**
```python
origins = settings.CORS_ORIGINS
if not origins:
    if settings.ENVIRONMENT == "development":
        origins = ["*"]  # Open in dev
    else:
        origins = [
            "http://localhost",
            "http://localhost:3000",
            "http://localhost:8081",
        ]
```

**Applied Middleware:**
```python
CORSMiddleware(
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Production Recommendation:**
- Set `CORS_ORIGINS` env var to explicit list: `["https://app.meetup.com", ...]`
- Currently defaults to localhost only (safe fallback)

### Security Scan Tooling & Results

**Dependency Scanning:**
- Tool: `pip-audit` (Python)
- Tool: `npm audit` (Node.js)
- Frequency: Every CI run (.github/workflows/ci.yml line 34)
- Result: Must pass with no HIGH/CRITICAL vulnerabilities

**Static Analysis (SAST/Linting):**
- Backend: Ruff (linting), MyPy (type checking)
- Mobile: ESLint
- Bandit: Mentioned in docs/SECURITY.md but NOT run in CI (disabled for beta)

**Latest Security Scan Results:**
- File: Unknown (not found in `docs/security_scan_results.md` or similar)
- TODO for next agent: Run `pip-audit` and `npm audit` locally and document results

### Abuse Controls

**User Blocking:**
- Endpoint: `POST /blocks/`, `DELETE /blocks/{blocked_user_id}`
- Effect: Blocked user cannot send requests or see blocked user in search (if implemented)
- Status: Block table exists; enforcement in request/search endpoints unknown

**Force Stop Sharing:**
- Endpoint: `POST /sessions/{session_id}/end` (manual end)
- Effect: Session marked ENDED; WebSocket disconnected; location sharing stops
- Idempotency: Safe to call multiple times

**Rate Limiting:**
- OTP: 5/min per phone (prevents brute-force)
- Contacts match: 30/min per user (prevents scraping)
- Invites: 10/min per user (prevents spam)

**Report System:**
- Status: Not implemented (no /reports endpoint)
- TODO: Add user report endpoint if abuse escalates

---

## I) "What's Next" Work (Planned but Not Implemented)

### Major Feature: Phone-Mandatory OTP + Contacts-Based Find Friends

**Completion Status:** Code implemented, environment wired, ready for manual QA

**Decision Log:**

1. **Authentication Model:** Phone-only (mandatory), Email optional
   - Rationale: Phone is inherent to location sharing; email adds friction
   - E.164 normalization enforced on input (backend/app/core/identity.py:normalize_phone_e164)

2. **Email Handling:** User can set/clear via `POST /users/profile`
   - Sent as: `{"display_name": "Alice", "email": "alice@example.com"}`
   - Cleared as: `{"email": null}` or `{"email": ""}`

3. **Contacts Privacy:** Client-side SHA256 digest only
   - No raw contacts uploaded
   - Digest format: `SHA256("v1:" + phone_e164)`
   - Server stores server-side HMAC: `SHA256(PHONE_HASH_PEPPER + digest)`
   - Rationale: Never expose raw phone in database; server can't reverse digest

4. **Hashing Approach:**
   - Client → digest: `SHA256("v{version}:" + phone_e164)` using expo-crypto
   - Server storage: User.phone_digest (unique, indexed)
   - Server rate limiter key: User.id (not phone)

5. **Rate Limits:**
   - Contacts match: 30/min per user
   - Reason: Prevents scraping entire database

6. **Device Binding:**
   - JWT payload includes optional `device_id` (set by client on first OTP verify)
   - Current enforcement: Concurrent login check partial (placeholder in /session/validate)
   - TODO: Full enforcement on next device login

### Exact TODOs Remaining (Ordered by Priority)

**PRIORITY 1 (Blocking Release):**
1. Wire real OTP provider (Twilio/AWS SNS/Firebase)
   - File: backend/app/api/endpoints/auth.py:54-56 (_send_otp is placeholder)
   - Test: test_otp_auth.py mocks _send_otp; real provider untested
2. Test mobile OTP flow end-to-end (manual QA with simulator + real phone provider)
3. Confirm deep-link scheme setup in mobile/app.json: `"scheme": "meetup://"`
4. Create manual QA checklist for contacts matching (6 test cases in earlier conversation)

**PRIORITY 2 (Needed for Beta Release):**
5. Implement enforce_rate_limit call for create_request endpoint (if missing)
6. Add background cleanup job for expired meet_requests and invites (10 min, 24 hr respectively)
7. Full device concurrency test: Log in from device A, then device B, verify session invalidation
8. Implement POST /session/signout-other-devices fully (currently partial)
9. Create analytics event tracking for full user flow (OTP → find friends → invite → session)

**PRIORITY 3 (Nice to Have for Beta):**
10. Add Grafana dashboard for metrics (counters, gauges, latencies)
11. Implement background session auto-end worker (if not already running)
12. Add retry logic for WebSocket reconnect on network failure
13. Set up EAS builds for mobile beta distribution (if using managed Expo)
14. Implement user report endpoint (if abuse becomes issue)

**PRIORITY 4 (Post-Release):**
15. Add SMS delivery tracking (bounces, opt-outs)
16. Implement email verification if email provider wired
17. Add Sentry/error tracking integration
18. Create admin dashboard for abuse moderation

---

## J) Verification Commands

### Quick Health Checks

**1. Backend Services Healthy**
```bash
# All services running
docker-compose ps

# Expected output:
# db           ... Up (healthy)
# redis        ... Up (healthy)
# backend      ... Up (healthy)
```

**2. Database & Redis Connected**
```bash
curl http://localhost:8000/ready
# Expected: {"status":"ok","components":{"database":"ok","redis":"ok"}}
```

**3. All Tests Pass**
```bash
docker-compose exec backend pytest -q
# Expected: 53 passed in Xs
```

### Full Test Suite (5 minutes)

```bash
cd /Users/ayushanand/Projects/MeetUp

# 1. Run all backend tests
docker-compose exec backend pytest -q

# 2. Run specific test categories
docker-compose exec backend pytest -q tests/test_otp_auth.py -v
docker-compose exec backend pytest -q tests/test_authorization.py -v
docker-compose exec backend pytest -q tests/test_rate_limits.py -v
docker-compose exec backend pytest -q tests/test_contacts_match.py -v
docker-compose exec backend pytest -q tests/test_invite_accept_flow.py -v
docker-compose exec backend pytest -q tests/test_realtime.py -v

# 3. Security scan
docker-compose exec backend pip-audit --desc on
```

### OTP Flow End-to-End (Automated)

```bash
cd /Users/ayushanand/Projects/MeetUp
chmod +x test_otp_flow.sh
./test_otp_flow.sh

# Expected output:
# ✅ OTP Code: 067779
# ✅ Access Token: eyJ...
# ✅ Full OTP flow completed!
```

### OTP Flow Manual (Mobile + Backend)

**Terminal 1 (Backend):**
```bash
cd /Users/ayushanand/Projects/MeetUp
docker-compose up
# Wait for "backend is healthy"
```

**Terminal 2 (Mobile):**
```bash
cd /Users/ayushanand/Projects/MeetUp/mobile
npm start
# Scan QR code or run on simulator
```

**Terminal 3 (Get OTP Code):**
```bash
curl -s http://localhost:8000/api/v1/auth/otp/start \
  -H 'Content-Type: application/json' \
  -d '{"phone_e164": "+15551234567"}' | jq '.dev_otp_code'
# Output: "067779"
```

**In Mobile App:**
1. Enter phone: `+15551234567`
2. Tap "Send OTP"
3. Wait for alert: "Code sent"
4. Paste OTP code: `067779`
5. Tap "Verify OTP"
6. Expected: Navigate to Friend List screen

### Contacts Matching Quick Test

```bash
# Step 1: Create user & get token
PHONE="+15551234567"
OTP_CODE=$(curl -s http://localhost:8000/api/v1/auth/otp/start \
  -H 'Content-Type: application/json' \
  -d "{\"phone_e164\": \"$PHONE\"}" | jq -r '.dev_otp_code')

TOKEN=$(curl -s http://localhost:8000/api/v1/auth/otp/verify \
  -H 'Content-Type: application/json' \
  -d "{\"phone_e164\": \"$PHONE\", \"otp_code\": \"$OTP_CODE\"}" | jq -r '.access_token')

# Step 2: Get hash config
curl -s http://localhost:8000/api/v1/contacts/hash_config | jq

# Step 3: Match digests
DIGEST=$(echo -n "v1:+15551234567" | sha256sum | cut -d' ' -f1)
curl -s http://localhost:8000/api/v1/contacts/match \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"version\": 1, \"digests\": [\"$DIGEST\"]}" | jq
```

### WebSocket Real-time Test (20 iterations)

```bash
# Start backend (if not running)
docker-compose exec backend python -c "
import asyncio
from app.realtime.test_utils import test_websocket_loop

asyncio.run(test_websocket_loop(iterations=20))
"
# Expected: 20 location updates broadcast and received
```

### Metrics Endpoint Check

```bash
curl http://localhost:8000/metrics | head -20

# Expected: Prometheus format output
# # HELP otp_start_requests_total Counter of OTP starts
# # TYPE otp_start_requests_total counter
# otp_start_requests_total 5
# ...
```

### Rate Limit Enforcement (Rapid OTP Attempts)

```bash
PHONE="+15551234567"

# Attempt 6 OTP starts (limit is 5/min)
for i in {1..6}; do
  curl -s http://localhost:8000/api/v1/auth/otp/start \
    -H 'Content-Type: application/json' \
    -d "{\"phone_e164\": \"$PHONE\"}" \
    -w "\n%{http_code}\n"
done

# Expected: 5 × 200 OK, then 1 × 429 Too Many Requests
```

### Mobile Lint & Build Check

```bash
cd /Users/ayushanand/Projects/MeetUp/mobile

# Lint
npm run lint

# Expected output: 0 errors, N warnings (expected inline-style warnings)

# Check dependencies
npm audit

# Expected: No vulnerabilities or low-severity only
```

### Docker Compose Service Status

```bash
docker-compose ps
docker-compose logs -f backend | grep -i error
docker compose exec -T db psql -U user -d meetup -c "SELECT COUNT(*) FROM users;"
docker compose exec -T redis redis-cli INFO stats
```

---

## Appendix: Quick Navigation

- **Backend entrypoint:** `backend/app/main.py`
- **API routes:** `backend/app/api/api.py`
- **OTP implementation:** `backend/app/api/endpoints/auth.py`
- **Contacts digest:** `backend/app/api/endpoints/contacts.py`
- **Database models:** `backend/app/models/`
- **Migrations:** `backend/alembic/versions/`
- **Tests:** `backend/tests/`
- **Mobile entrypoint:** `mobile/index.js` + `mobile/src/App.jsx`
- **Authentication context:** `mobile/src/context/AuthContext.js`
- **Environment variables:** `.env` (root) + `docs/config.md`
- **Security policy:** `docs/SECURITY.md`
- **CI/CD workflows:** `.github/workflows/ci.yml`

---

**End of Handoff Pack**

For questions, refer to:
1. Code comments (esp. backend/app/api/endpoints/*.py)
2. Test files (demonstrate expected behavior)
3. docs/ directory (design decisions, configs)
4. Conversation transcript: `/Users/ayushanand/Library/Application Support/Code/User/workspaceStorage/caa5a346921b52dce55b74a972499730/GitHub.copilot-chat/transcripts/d21a1f72-67d1-4780-9b49-878eb11ac569.jsonl`
