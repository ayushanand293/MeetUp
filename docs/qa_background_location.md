# Background Location QA

Background sharing is best effort and runs only while a meetup session is active. The backend stores only last-known location in Redis with TTL; it does not write location history to Postgres.

## Preconditions

- Backend, Redis, and DB are running.
- Two test users can complete phone OTP login.
- A meet request can be accepted to create one active 1:1 session.
- Use physical devices for final iOS/Android verification.

## Test Cases

### 1. Active Session Background Updates

1. User A sends a meet request to User B.
2. User B accepts.
3. Both users land in the active session screen.
4. Grant foreground and background location permission when prompted.
5. Background User A's app for 2 minutes.
6. Keep User B's app foregrounded.
7. Expected: User B continues receiving User A location updates roughly every 15-30 seconds.
8. Expected: User B sees `Updated Ns ago`; if updates are delayed beyond 60 seconds, the UI notes OS power setting delay.

### 2. Session End Stops Background Sharing

1. Start an active session.
2. Background User A's app.
3. End the session from User B, or have both users tap `I'm here`.
4. Expected: User A stops background sharing.
5. Expected: Android foreground service notification disappears.
6. Expected: No additional `POST /sessions/{id}/location` requests are sent after the session is ended.

### 3. Background Permission Denied

1. Start an active session.
2. Grant foreground location permission.
3. Deny background location permission.
4. Expected: Foreground sharing still works.
5. Expected: A non-blocking banner says background sharing is off and the user should keep the app open for live updates.

### 4. Android Foreground Service Notification

1. Start an active session on Android.
2. Grant background permission.
3. Background the app.
4. Expected: Android shows a persistent notification:
   - `MeetUp is sharing your location`
   - `Active meetup in progress`
5. End the session.
6. Expected: Notification is removed.

### 5. Battery Saver / OS Throttling

1. Enable battery saver or low power mode.
2. Start an active session and background one device.
3. Expected: Updates may be slower than the normal 15-30 second window.
4. Expected: The peer UI eventually displays that updates may be delayed by OS power settings.

## Useful Commands

```bash
docker compose exec -T backend pytest -q tests/test_background_location.py
cd mobile
npm run lint
```
