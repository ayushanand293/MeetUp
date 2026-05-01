# UI Handoff: Meet At A Common Point

This handoff is for continuing the UI work on the MeetUp app after the backend and minimum viable mobile flow were added.

## Feature Summary

Users can now attach an optional destination place to a meet request. After the other person accepts, the active session shows:

- Current user marker
- Friend marker
- Destination marker
- In-app route from current user to destination
- In-app route from friend to destination, when friend location is available
- Distance and ETA to the destination for both people, best effort

Sessions still start only after explicit accept. The destination is copied from the request into the session and cannot be edited after session start.

## Current UX Flow

1. User opens `Find Friends` or `Quick Friends`.
2. User selects a friend.
3. App opens the meet request screen.
4. User can optionally search for a meeting place.
5. User selects a place result.
6. User sends the meet request.
7. Receiver sees the place in the incoming request card.
8. Receiver accepts.
9. Active session opens with both live locations and destination route UI.

## Main UI Files

- `mobile/src/screens/RequestScreen.js`
  - Current place picker UI lives here.
  - Handles debounced search against `/places/search`.
  - Sends optional `destination` in the request payload.

- `mobile/src/screens/FriendListScreen.js`
  - Matched contact `Meet` now opens `RequestScreen` instead of immediately sending a request.

- `mobile/src/screens/AcceptRequestScreen.js`
  - Incoming request card shows destination name/address when present.

- `mobile/src/screens/ActiveSessionScreen.js`
  - Fetches session snapshot to get `destination`.
  - Renders destination marker in the WebView Leaflet map.
  - Draws route polylines to destination.
  - Shows the destination card with distance/ETA.

- `mobile/src/services/orsService.js`
  - Existing OpenRouteService client.
  - Used for route polyline, distance, and duration.
  - Falls back to direct-line distance if ORS is unavailable.

## Current UI State

The current UI is intentionally simple and functional. It is ready for a design pass.

Areas likely worth redesigning:

- Meeting place picker on `RequestScreen`
- Place search loading, empty, and error states
- Selected destination chip/card
- Incoming request destination preview
- Active session destination card
- Route legend or visual explanation for the two route lines
- Bottom panel density on small phones

Current route styling:

- Solid route line: current user to destination
- Dashed route line: friend to destination
- Destination pin: custom Leaflet div icon

## Backend API Contract

### Search Places

```http
GET /api/v1/places/search?q=cafe&lat=37.7&lon=-122.4&limit=10
Authorization: Bearer <token>
```

Response:

```json
[
  {
    "name": "Cafe Name",
    "address": "One-line address",
    "lat": 37.7936,
    "lon": -122.3958,
    "provider": "osm",
    "place_id": "12345"
  }
]
```

Notes:

- Requires auth.
- Rate limited server-side.
- Provider is currently OpenStreetMap Nominatim behind an abstraction.
- Do not log or expose full coordinates/addresses in analytics.

### Create Request With Destination

```http
POST /api/v1/requests/
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "to_user_id": "uuid",
  "destination": {
    "name": "Cafe Name",
    "address": "One-line address",
    "lat": 37.7936,
    "lon": -122.3958,
    "provider": "osm",
    "place_id": "12345"
  }
}
```

`destination` is optional. Existing request creation without a destination still works.

### Session Snapshot

```http
GET /api/v1/sessions/{session_id}/snapshot
Authorization: Bearer <token>
```

Response now includes:

```json
{
  "session_id": "uuid",
  "session_status": "ACTIVE",
  "locations": {},
  "destination": {
    "name": "Cafe Name",
    "address": "One-line address",
    "lat": 37.7936,
    "lon": -122.3958,
    "provider": "osm",
    "place_id": "12345"
  },
  "timestamp": "..."
}
```

`destination` can be `null`.

## Important Product Constraints

Do not regress these existing flows:

- OTP auth
- Contacts matching
- Meet request -> accept -> active session
- Invite/deep-link accept
- WebSocket realtime location
- Rate limiting fail-closed
- Block/force-end behavior
- No retained location history
- Existing metrics
- Background location during active session

Sessions must still start only after explicit accept.

No PII in logs or metrics. Avoid user IDs, phone numbers, emails, addresses, coordinates, request IDs, session IDs, or place IDs in analytics/logs.

Allowed aggregate metrics only:

- `destination_selected_total`
- `destination_requests_sent_total`
- `destination_sessions_started_total`

## Running Backend Locally

From repo root:

```bash
cd /Users/<your-name>/Projects/MeetUp
docker compose up -d
docker compose exec backend alembic upgrade head
docker compose exec backend pytest -q
```

Health check:

```bash
curl http://localhost:8000/health
```

Backend logs:

```bash
docker compose logs backend -f
```

## Mobile Environment

Edit:

```text
mobile/.env
```

Required for phone testing:

```env
EXPO_PUBLIC_API_BASE_URL=http://YOUR_MAC_IP:8000/api/v1
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_KEY=...
EXPO_PUBLIC_ORS_KEY=...
```

Find Mac Wi-Fi IP:

```bash
ipconfig getifaddr en0
```

Example:

```env
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.42:8000/api/v1
```

Important:

- Do not use `localhost` for a physical Android phone. On the phone, `localhost` means the phone itself.
- Mac and Android phone should be on the same Wi-Fi.
- If ORS key is missing, destination route falls back to a straight line.

## Running On Android Phone As A Development Build

### One-Time Setup

Install:

- Node.js 18+
- Android Studio
- Android SDK Platform Tools

On Android phone:

1. Enable Developer Options.
2. Enable USB Debugging.
3. Plug phone into Mac with USB.
4. Accept the RSA debugging prompt on the phone.

Check device:

```bash
adb devices
```

You should see the phone listed as `device`.

### Install The Dev Build

From mobile folder:

```bash
cd /Users/<your-name>/Projects/MeetUp/mobile
npm install
npx expo run:android --device
```

If that command does not show a picker, use:

```bash
npm run android
```

This builds and installs the native development build on the phone. Keep the phone plugged in for the first install.

### Start Metro

```bash
npx expo start --dev-client -c
```

Open the installed MeetUp app on Android.

If it does not find Metro automatically:

1. Tap the dev build screen's manual URL option.
2. Enter:

```text
http://YOUR_MAC_IP:8081
```

Example:

```text
http://192.168.1.42:8081
```

After the dev build is installed, USB is not required for normal testing as long as:

- Metro is running
- Phone and Mac are on the same Wi-Fi
- The phone can reach `http://YOUR_MAC_IP:8081`
- The app can reach `http://YOUR_MAC_IP:8000/api/v1`

## Android Background Location Notes

For active session background sharing:

1. Start an active session.
2. Android may ask for location permission.
3. Open Android Settings for the app.
4. Set location permission to `Allow all the time`, if available.
5. Disable aggressive battery restrictions for reliable QA.

The destination feature does not change the background location service. It only adds destination data and route rendering on top of active sessions.

## Manual QA For UI Work

Use two logged-in users, ideally:

- Android phone: User A
- iOS simulator, Android emulator, or another phone: User B

Checklist:

1. User A creates a request without destination.
   - Existing flow should still work.

2. User A creates a request with destination.
   - Search results load.
   - Selecting a result creates a clear selected state.
   - Clearing the result works.
   - Sending request includes destination.

3. User B views incoming request.
   - Destination name/address is visible.
   - Accept/decline behavior is unchanged.

4. User B accepts.
   - Active session starts.
   - Destination marker appears.
   - Both user markers appear when locations are available.

5. Route rendering.
   - Solid route from current user to destination.
   - Dashed route from friend to destination.
   - Distance/ETA values appear when ORS succeeds.
   - Direct-line fallback appears when ORS fails.

6. Background check.
   - Start active session.
   - Background the app for 2 minutes.
   - Reopen app.
   - Location updates and destination UI should still be present.

## Useful Commands

Backend:

```bash
docker compose up -d
docker compose exec backend alembic upgrade head
docker compose exec backend pytest -q
docker compose logs backend -f
```

Mobile:

```bash
cd mobile
npx expo start --dev-client -c
npx expo run:android --device
npm run lint
```

Reset Metro cache:

```bash
npx expo start --dev-client -c
```

Check Android devices:

```bash
adb devices
```

Use USB reverse as an optional fallback while plugged in:

```bash
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8000 tcp:8000
```

With `adb reverse`, a plugged-in Android phone can sometimes use:

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

But for normal wireless testing, prefer the Mac IP.

