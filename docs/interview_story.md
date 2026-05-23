# MeetUp Interview Story

## 30-Second Pitch

MeetUp is a phone-first, contacts-first live meetup app for 1:1 meetups. You sign in with OTP, find friends from your contacts without uploading raw phone numbers for matching, send a meet request or invite link, and once accepted both people enter a temporary live session with realtime location, optional meet-at-place routing, background sharing only while active, and clear end-session controls.

## 2-Minute Architecture Story

The backend is FastAPI with Postgres for durable state and Redis for ephemeral state. Postgres stores users, requests, sessions, participants, invites, blocks, and analytics events. Redis handles OTPs, rate limits, realtime pub/sub, last-known active locations with TTL, and shared metrics.

The mobile app is Expo React Native. Auth is custom phone OTP. Contacts are normalized on-device, hashed as versioned digests, and sent to `/api/v1/contacts/match`; raw contact numbers are not sent for matching. A matched contact uses `POST /api/v1/requests/` and `POST /api/v1/requests/{id}/accept`. An unmatched contact gets a `meetup://invite?token=...` deep link through `/api/v1/invites`.

The active session uses WebSocket at `/api/v1/ws/meetup` for foreground realtime location, presence, route mode, and session-ended events. Background sharing uses Expo background location and sends bounded HTTP updates to `/api/v1/sessions/{session_id}/location`. Active coordinates are stored as Redis last-known values with TTL, not as durable location history.

Key files:
- `backend/app/api/endpoints/auth.py`
- `backend/app/api/endpoints/contacts.py`
- `backend/app/api/endpoints/requests.py`
- `backend/app/api/endpoints/invites.py`
- `backend/app/api/endpoints/realtime.py`
- `backend/app/realtime/connection_manager.py`
- `mobile/src/screens/ActiveSessionScreen.js`
- `mobile/src/services/realtimeService.js`
- `mobile/src/services/backgroundLocation.js`

## Security Story

- Explicit acceptance: a 1:1 session starts only after request acceptance or invite redemption.
- IDOR protection: request accept/decline, session snapshot, participants, location, end, and force-end endpoints verify ownership or participant access before returning or mutating state.
- WS gating: WebSocket validates JWT, active OTP auth session, active session participation, and block relationships before accepting the connection.
- Rate limits fail closed: Redis-backed rate limits reject when over limit or when the limiter cannot validate safely. This protects OTP, contacts, places, request creation, invites, WebSocket location, and background HTTP location.
- No location history: realtime and background locations are stored as `loc:{session_id}:{user_id}` Redis keys with a TTL for active sessions. Durable session history stores metadata, not coordinate history.
- Log scrubbing: JWTs, secrets, phone numbers, and precise coordinates are scrubbed through `backend/app/core/scrub.py`.

Relevant files:
- `backend/app/api/endpoints/sessions.py`
- `backend/app/api/endpoints/realtime_helpers.py`
- `backend/app/core/rate_limit.py`
- `backend/app/core/scrub.py`
- `backend/app/worker/session_cleanup.py`

## Reliability Story

- Redis pub/sub: `ConnectionManager` publishes session messages through Redis so backend instances can forward events to their local WebSocket clients.
- TTL last-known state: active location and route-mode state is ephemeral, so stale realtime state ages out naturally.
- Client reconnect: mobile realtime service uses a grace window, exponential backoff with jitter, heartbeat, and bounded queueing.
- Background updates only while active: background sharing starts from `ActiveSessionScreen` after an active session is resolved and stops on session end, cleanup, logout, or auth invalidation.
- Last-seen freshness: active session UI tracks peer presence and stale update timing, with user-facing handling for temporary disconnects.
- Health/readiness: `/health` verifies service liveness and `/ready` verifies database and Redis.

Relevant files:
- `backend/app/main.py`
- `backend/app/realtime/connection_manager.py`
- `mobile/src/services/realtimeService.js`
- `mobile/src/services/backgroundLocation.js`
- `mobile/src/screens/ActiveSessionScreen.js`

## Resume Bullets

- Built a FastAPI, Postgres, and Redis backend for 1:1 live meetup sessions with WebSocket participant gating, Redis pub/sub fanout, TTL-based last-known location state, and health/readiness endpoints.
- Implemented phone-first OTP authentication with JWT sessions, Redis OTP storage, active-session invalidation, and fail-closed rate limiting.
- Designed privacy-conscious contacts discovery in Expo React Native using on-device E.164 normalization and versioned SHA-256 contact digests.
- Shipped matched request and unmatched invite flows with deep links, token resolution/redeem endpoints, idempotent acceptance behavior, and active-session recovery.
- Added meet-at-place support with backend destination validation, place search, session destination propagation, and optional OpenRouteService route rendering.
- Hardened beta readiness with authorization tests, rate-limit tests, realtime tests, retention tests, analytics safety checks, Docker Compose deployment, and Prometheus-compatible metrics export.

## Deprecated Endpoint Note

Use `/api/v1/invites` for invite creation and redemption. The session-scoped invite endpoints in `backend/app/api/endpoints/sessions.py` are marked deprecated compatibility endpoints and should not be presented as the current product path.
