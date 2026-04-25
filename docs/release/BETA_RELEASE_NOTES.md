# MeetUp Beta v0.1.0 Release Notes

Welcome to the Beta Release of MeetUp!

## Summary of Shipped Features
- **Proximity Detection & Automatic Teardown**: Auto-end session when within 50m of your peer.
- **Deep-Link Flow (Tasks 1 & 4)**: Robust Invite link sharing (`meetup://invite?token=...`) with proper database backing, 24-hour TTL, idempotency, and fallback screens.
- **Peer Offline Handling (Priority pass)**: Graceful disconnects that allow up to 60s of peer offline backgrounding without aggressively destroying map data.
- **Race Condition Resiliency**: Bulletproof UI banners for AppState changes to prevent the "Sharing paused (resuming...)" banner from prematurely vanishing.
- **Observability Gates**: Session Latency, Peer Propagations Latency, and E2E payload Latency natively recorded with full Prometheus /metrics output support.

## Breaking Changes
- `EXPO_PUBLIC_API_BASE_URL` is now an absolute **mandatory** environment variable for production builds. If missing, the app will refuse to fall back to `localhost` and will throw an initialization critical error.
- All legacy Session ID-based invite creation has been fully migrated to generic Request UUIDs.

## Known Issues
- Requires foreground location tracking only as background permissions are disabled deliberately by `EXPO_PUBLIC_CLIENT_LOCATION_FOREGROUND_ONLY` default.
- Background location delivery pauses successfully, but deep-sleep background multitasking OS termination hasn't been rigorously field-tested on all Android vendor hardware.

## How to Run:
**Dev / Docker**
1. Spin up dependencies: `docker-compose up -d --build`
2. Start the Expo mobile app: `cd mobile && npx expo start`
3. Export an API base URL (e.g. your LAN IP) before connecting a native app: `export EXPO_PUBLIC_API_BASE_URL="http://192.168.1.100:8000"`
