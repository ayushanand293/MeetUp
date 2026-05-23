# MeetUp Beta QA Matrix

| Feature | Step | Expected Result | Pass / Fail |
| --- | --- | --- | --- |
| **Branch & Environment** | Verify branch is `feature/Updates` or `main`. | `git status` shows clean tree. | [ ] |
| | Confirm EXPO_PUBLIC_API_BASE_URL is missing. | Hard error preventing React initialization. | [ ] |
| | Add EXPO_PUBLIC_API_BASE_URL. | App loads without configuration errors. | [ ] |
| **Migrations** | Run `alembic upgrade head`. | DB creates `invites`, `analytics_events` safely. | [ ] |
| **Invites (Deep Links)** | Launch App with dummy phone number, hit "Create Session". | `meetup://invite?token=...` link triggers OS modal. | [ ] |
| | Simulator B clicks deep-link. | Deep link launches directly into Waiting/Active screen. | [ ] |
| | Token redemption endpoint. | Token TTL marked consumed; fallback screens map correctly. | [ ] |
| **Peer Offline UX** | Put Peer B in Background mode for > 15s. | Peer A sees "Sharing paused (resuming...)" UI banner. | [ ] |
| | Bring Peer B to Foreground. | Peer A banner persists precisely until first successful Location emit, then vanishes cleanly. | [ ] |
| | Put Peer B in Background for > 60s. | Peer A receives `Connection paused...` overlay, pin remains cached. | [ ] |
| **Proximity Teardown** | Spoof Peer A and Peer B locations to < 50m distance. | Map triggers "Arrived!" success teardown; session terminates for both OS. | [ ] |
| **Observability Analytics** | Check Docker Console / backend logging strings. | No missing user_id keys; `location_end_to_end_latency_ms` flushed properly. | [ ] |
| | Run `curl -s localhost:8000/api/v1/metrics`. | `{"counters": ..., "gauges": ...}` exports valid JSON metrics map. | [ ] |
