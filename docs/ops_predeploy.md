# Pre-Deployment Readiness Guide

This guide is the staging-first deployment runbook for the current MeetUp backend and mobile app. It does not introduce new product behavior; it documents the existing FastAPI, Postgres, Redis, Expo, and WebSocket deployment surface.

## Environment Variable Contract

### Backend

Required for staging/production:

| Variable | Example | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `postgresql://meetup:...@db:5432/meetup` | Required by `backend/app/core/config.py` |
| `REDIS_URL` | `redis://redis:6379/0` | Required for OTPs, rate limits, pub/sub, metrics |
| `ENVIRONMENT` | `production` | Controls CORS default and log level |
| `AUTH_JWT_SECRET` | strong random secret | Required for OTP-issued JWTs unless falling back to `SUPABASE_KEY` |
| `AUTH_JWT_ALGORITHM` | `HS256` | Default in code |
| `AUTH_ACCESS_TOKEN_TTL_SECONDS` | `86400` | Default in code |
| `PHONE_HASH_PEPPER` | strong random pepper | Required for stable server-side phone hashes |
| `CORS_ORIGINS` | `["https://api-staging.example.com"]` | JSON list parsed by Pydantic |
| `METRICS_BACKEND` | `redis` | Redis is the default shared metrics backend |
| `ANALYTICS_ENABLED` | `true` | Controls `/api/v1/analytics/events` ingestion |
| `OTP_DEV_ECHO_ENABLED` | `false` | Must stay false in production |

Optional or provider-dependent:

| Variable | Notes |
|----------|-------|
| `SUPABASE_URL` | Needed only for Supabase ES256 JWKS validation paths |
| `SUPABASE_KEY` | Needed for Supabase HS256/legacy token fallback or if `AUTH_JWT_SECRET` is unset |
| `OTP_TTL_SECONDS`, `OTP_DIGITS`, `OTP_*_LIMIT_*` | Defaults are defined in `backend/app/core/config.py` |
| `CONTACTS_HASH_VERSION`, `CONTACTS_MATCH_*` | Defaults are defined in `backend/app/core/config.py` |

Current limitation: `backend/app/api/endpoints/auth.py` has a placeholder OTP sender. A real SMS provider must be wired before a real public deployment with `OTP_DEV_ECHO_ENABLED=false`.

### Mobile

Required for staging/production builds:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api-staging.example.com/api/v1
EXPO_PUBLIC_CLIENT_ANALYTICS_ENABLED=true
EXPO_PUBLIC_CLIENT_LOCATION_FOREGROUND_ONLY=false
```

Optional:

```bash
EXPO_PUBLIC_ORS_KEY=<openrouteservice-key>
```

Files that consume these names:
- `mobile/src/api/client.js`
- `mobile/src/config.js`
- `mobile/src/services/orsService.js`

## Recommended Staging Deployment

Recommendation: use a single VM with Docker Compose, nginx, and TLS for staging. It matches the current repo shape and keeps migration, Redis, Postgres, and WebSocket behavior explicit.

Managed platforms such as Render, Fly, or Railway are viable later if they provide Postgres, Redis, migration jobs, and WebSocket upgrade support.

## Single VM Checklist

1. Provision an Ubuntu VM.

2. Install Docker, Compose plugin, nginx, and certbot:

   ```bash
   sudo apt update
   sudo apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx
   sudo usermod -aG docker $USER
   ```

3. Clone and pull the branch:

   ```bash
   git clone <repo-url> MeetUp
   cd MeetUp
   git checkout feature/frontend_v1
   git pull --ff-only origin feature/frontend_v1
   ```

4. Create a root `.env` with the backend variables above.

5. Start backing services:

   ```bash
   docker compose up -d --build db redis
   ```

6. Run migrations before exposing the backend:

   ```bash
   docker compose up -d --build backend
   docker compose exec -T backend alembic upgrade head
   ```

7. Configure nginx with WebSocket upgrade support:

   ```nginx
   server {
       server_name api-staging.example.com;

       location / {
           proxy_pass http://127.0.0.1:8000;
           proxy_http_version 1.1;

           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;

           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";

           proxy_read_timeout 3600;
           proxy_send_timeout 3600;
       }
   }
   ```

8. Issue TLS certificate:

   ```bash
   sudo certbot --nginx -d api-staging.example.com
   sudo nginx -t
   sudo systemctl reload nginx
   ```

9. Verify health/readiness:

   ```bash
   curl -fsS https://api-staging.example.com/health
   curl -fsS https://api-staging.example.com/ready
   ```

   Expected readiness:

   ```json
   {"status":"ok","components":{"database":"ok","redis":"ok"}}
   ```

10. Verify metrics:

    ```bash
    curl -fsS 'https://api-staging.example.com/api/v1/metrics?format=prometheus'
    ```

11. Verify WebSocket behind TLS with two authenticated devices:

    ```text
    wss://api-staging.example.com/api/v1/ws/meetup?token=<JWT>&session_id=<UUID>
    ```

    Expected behavior: both 1:1 participants enter `ActiveSessionScreen`, foreground location updates propagate, route-mode changes propagate, and ending the session broadcasts `session_ended`.

## Safe Migration Policy

1. Take a database snapshot before production-like deploys.
2. Run `alembic upgrade head` before sending traffic to the new app version.
3. If migration fails, halt deploy.
4. Rollbacks should restore the pre-deploy database snapshot. Downgrade migrations are not guaranteed for every release.

## Rollback Plan

Application rollback:

```bash
git checkout <previous-known-good-commit-or-tag>
docker compose up -d --build backend
```

Database rollback:
- Restore the pre-deploy DB snapshot.
- Prefer migrate-forward fixes only after the service is stabilized.

Redis rollback:

```bash
docker compose restart redis
```

Redis restart will disrupt OTPs, rate-limit windows, metrics, active pub/sub, and last-known active locations, but durable sessions remain in Postgres.

## Pre-Deployment Verification Runbook

From repo root:

```bash
docker compose up -d --build
docker compose exec -T backend alembic upgrade head
docker compose exec -T backend pytest -q
./scripts/beta_smoke.sh
```

Mobile lint:

```bash
cd mobile
npm run lint
```

Note: lint currently exits successfully with warnings; treat lifecycle-related hook warnings in `ActiveSessionScreen` as review items before broad release.

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

## Metrics Semantics

Metrics exports both `counters` and `gauges` maps. The current code increments/decrements `ws_connections_active` and `sessions_active` inside the counters map. They behave like active-count counters but are not Prometheus gauges unless the implementation changes to call `set_gauge`.

Relevant files:
- `backend/app/core/metrics.py`
- `backend/app/core/metrics_store.py`
- `backend/app/api/endpoints/metrics.py`
