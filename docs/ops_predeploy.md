# Pre-Deployment Readiness Guide

## Environment Variable Contract

| Variable | Dev Default | Prod Status | Description |
|----------|-------------|-------------|-------------|
| `DATABASE_URL` | N/A | **Required** | Postgres connection string |
| `REDIS_URL` | N/A | **Required** | Redis connection string |
| `ENVIRONMENT` | `development` | `production` | Switches CORS and Logging levels |
| `METRICS_BACKEND` | `redis` | `redis` | Storage for cross-process metrics |
| `CORS_ORIGINS` | `[]` | **Recommended** | List of allowed origins |
| `SUPABASE_URL` | N/A | **Required** | For JWT validation |
| `SUPABASE_KEY` | N/A | **Required** | For JWT validation (local) |

## Pre-Deployment Verification Runbook

Run the following command in the root directory:
```bash
docker compose exec -T backend ./scripts/predeploy_checklist.sh
```

## Migration Readiness
To verify migration state from a clean state:
1. `docker compose down -v`
2. `docker compose up -d db redis`
3. `docker compose exec backend alembic upgrade head`
4. Confirm tables exist:
   ```bash
   docker compose exec db psql -U postgres -d meetup -c "\dt"
   ```

## Background Location Readiness

Before shipping a mobile build that supports active-session background sharing:

1. Confirm `mobile/app.json` includes the `expo-location` plugin with iOS and Android background location enabled.
2. Confirm iOS permission strings clearly state location is shared only during an active meetup.
3. Confirm Android build includes the foreground service notification:
   - Title: `MeetUp is sharing your location`
   - Body: `Active meetup in progress`
4. Run backend protection tests:
   ```bash
   docker compose exec -T backend pytest -q tests/test_background_location.py
   ```
5. Run mobile lint:
   ```bash
   cd mobile
   npm run lint
   ```
6. Complete `docs/qa_background_location.md` on both iOS and Android physical devices. Simulators are useful for smoke checks but do not fully represent OS background throttling.
