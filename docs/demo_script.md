# MeetUp 2-Device Demo Script

## Setup

Backend staging checks:

```bash
curl -fsS https://api-staging.your-domain.com/health
curl -fsS https://api-staging.your-domain.com/ready
```

Mobile build/runtime env:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api-staging.your-domain.com/api/v1
EXPO_PUBLIC_CLIENT_ANALYTICS_ENABLED=true
EXPO_PUBLIC_CLIENT_LOCATION_FOREGROUND_ONLY=false
EXPO_PUBLIC_ORS_KEY=<optional-openrouteservice-key>
```

Use two devices and two different phone accounts:
- Device A: Alice
- Device B: Bob

MeetUp sessions are 1:1 in this demo narrative.

## Flow 1: Matched Contact Request

1. Sign in on both devices with phone OTP.
   - Backend: `POST /api/v1/auth/otp/start`, `POST /api/v1/auth/otp/verify`
   - Files: `backend/app/api/endpoints/auth.py`, `mobile/src/context/AuthContext.js`

2. On Device A, open Find Friends and allow contacts.
   - The client normalizes phone numbers and sends versioned SHA-256 digests to `/api/v1/contacts/match`.
   - Files: `mobile/src/screens/FriendListScreen.js`, `backend/app/api/endpoints/contacts.py`

3. Tap Bob under "On MeetUp", optionally choose a meet-at-place destination, and send the request.
   - Request endpoint: `POST /api/v1/requests/`
   - Place search endpoint: `GET /api/v1/places/search`
   - Files: `mobile/src/screens/RequestScreen.js`, `backend/app/api/endpoints/requests.py`, `backend/app/api/endpoints/places.py`

4. On Device B, open requests and accept.
   - Accept endpoint: `POST /api/v1/requests/{request_id}/accept`
   - Expected result: backend creates one active 1:1 session and Device B navigates to Active Session.
   - Files: `mobile/src/screens/AcceptRequestScreen.js`, `backend/app/api/endpoints/requests.py`

5. On both devices, grant location permission and show the active session.
   - Foreground realtime WS: `/api/v1/ws/meetup?token=<JWT>&session_id=<UUID>`
   - Background update endpoint: `POST /api/v1/sessions/{session_id}/location`
   - Files: `mobile/src/screens/ActiveSessionScreen.js`, `mobile/src/services/realtimeService.js`, `mobile/src/services/backgroundLocation.js`, `backend/app/api/endpoints/realtime.py`, `backend/app/api/endpoints/sessions.py`

6. Move one device or use configured mock coordinates. Confirm peer marker/location freshness changes.

7. If an ORS key is configured, switch route mode and show route/distance updates.
   - File: `mobile/src/services/orsService.js`
   - Fallback: without `EXPO_PUBLIC_ORS_KEY`, the app falls back to direct distance/line behavior.

8. End the meetup from either device.
   - Endpoint: `POST /api/v1/sessions/{session_id}/end`
   - WS event: `session_ended`

## Flow 2: Unmatched Invite Link

Use this if Bob is not in Alice's matched contacts.

1. On Device A, tap Invite for an unmatched contact.
   - Endpoint: `POST /api/v1/invites`
   - Link format: `meetup://invite?token=<token>`
   - File: `backend/app/api/endpoints/invites.py`

2. Open the link on Device B.
   - Deep link handling resolves `/api/v1/invites/{token}`.
   - If needed, Device B signs in first, then redeems the token with `POST /api/v1/invites/{token}/redeem`.
   - Files: `mobile/src/context/AuthContext.js`, `mobile/src/screens/AcceptRequestScreen.js`

3. Device B accepts the invite and enters the active 1:1 session.

Deprecated compatibility note:
- `POST /api/v1/sessions/{session_id}/invite` and `POST /api/v1/sessions/{session_id}/invite/redeem` still exist in `backend/app/api/endpoints/sessions.py` as deprecated compatibility endpoints. Do not use them in the demo or new docs; use `/api/v1/invites`.

## Network Failure Fallbacks

If WebSocket does not connect:
1. Confirm readiness:
   ```bash
   curl -fsS https://api-staging.your-domain.com/ready
   ```
2. Confirm nginx or platform proxy supports WebSocket upgrade headers.
3. Confirm mobile uses `EXPO_PUBLIC_API_BASE_URL=https://.../api/v1`.
4. Reopen `ActiveSessionScreen` to trigger reconnect.
5. Check backend WS close/auth logs for policy violations.

If contact matching does not show the peer:
1. Confirm both accounts have verified phone numbers.
2. Confirm the phone in contacts normalizes to E.164.
3. Continue demo with invite link flow.

If background updates do not appear:
1. Keep both apps foregrounded and demonstrate WebSocket realtime.
2. Explain that background sharing is best-effort and only starts during an active session with OS permission.

If ORS routing fails:
1. Continue with direct line/distance behavior.
2. Explain ORS is optional and controlled by `EXPO_PUBLIC_ORS_KEY`.
