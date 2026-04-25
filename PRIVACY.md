# MeetUp Privacy Policy Notes

- Foreground-only location sharing for MVP.
- The app requests only "While Using the App" permission for location.
- Raw location history is not stored in Postgres.
- Last-known location is stored in Redis with a 10-minute TTL only.
- Session metadata is retained for 30 days, then purged by cleanup jobs.
- Request metadata may also be purged after 30 days.
- Analytics events are optional and can be disabled via client/server feature flags.
