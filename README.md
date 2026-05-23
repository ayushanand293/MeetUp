# MeetUp

MeetUp is a phone-first, contacts-first app for private 1:1 live meetups. It lets two people request or invite each other, then share temporary realtime location only during an accepted active session.

The repo contains a FastAPI/Postgres/Redis backend and an Expo React Native mobile app, with Docker Compose for local verification and staging-style deployment.

## Features

- Phone OTP auth with backend-issued JWT sessions.
- Contacts-first friend discovery using on-device phone normalization and versioned contact digests.
- Matched meet request flow: request, accept, active 1:1 session.
- Unmatched invite flow: `meetup://invite?token=<token>` deep link, redeem, active 1:1 session.
- Realtime foreground location over WebSocket with Redis pub/sub fanout.
- Active-session background location updates through Expo background location and a bounded HTTP endpoint.
- Optional meet-at-place destination selection and OpenRouteService routing.
- Health/readiness endpoints, Prometheus-compatible metrics, analytics ingestion, and backend test coverage.

## Architecture

```text
Expo mobile app
  |  HTTPS REST + WSS realtime
  v
FastAPI backend
  |-- Postgres: users, requests, sessions, invites, blocks, analytics
  |-- Redis: OTPs, rate limits, pub/sub, last-known locations, metrics
```

More details:
- [Interviewer quickstart](docs/INTERVIEWER_QUICKSTART.md)
- [Deployment runbook](docs/ops_predeploy.md)
- [Demo script](docs/demo_script.md)
- [Interview story](docs/interview_story.md)
- [Security notes](docs/SECURITY.md)
- [Configuration](docs/config.md)

## One-Command Local Run

```bash
docker compose up -d --build
```

Then verify:

```bash
docker compose exec -T backend alembic upgrade head
docker compose exec -T backend pytest -q
./scripts/beta_smoke.sh
```

Backend endpoints:
- `GET http://localhost:8000/health`
- `GET http://localhost:8000/ready`
- `GET http://localhost:8000/api/v1/metrics?format=prometheus`

## Mobile Setup

```bash
cd mobile
npm install
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1 npm run start
```

For a physical device on LAN, use your machine IP:

```bash
EXPO_PUBLIC_API_BASE_URL=http://YOUR_LAN_IP:8000/api/v1 npm run start
```

Optional routing:

```bash
EXPO_PUBLIC_ORS_KEY=<openrouteservice-key>
```

## Demo Mode

Local demo uses the smoke script and seeded users rather than real SMS delivery:

```bash
./scripts/beta_smoke.sh
```

The backend OTP sender is currently a provider placeholder in `backend/app/api/endpoints/auth.py`. `OTP_DEV_ECHO_ENABLED=true` can echo OTPs in non-production environments only; real public deployment needs an SMS provider wired before `OTP_DEV_ECHO_ENABLED=false` is usable for sign-in.

## Security And Privacy

- 1:1 sessions start only after explicit request acceptance or invite redemption.
- REST endpoints enforce ownership/participant checks for requests, sessions, locations, snapshots, and force-end operations.
- WebSocket connections validate JWT, active auth session, active session membership, and block relationships.
- Redis-backed rate limits fail closed for OTP, contacts, places, requests, invites, WebSocket location, and background location.
- Active coordinates are stored as Redis last-known keys with TTL; durable coordinate history is not stored.
- Logs scrub JWTs, secrets, phone numbers, and precise coordinates.

## Tests And CI

Backend:

```bash
docker compose exec -T backend pytest -q
```

Mobile lint:

```bash
cd mobile
npm run lint
```

CI is defined in `.github/workflows/ci.yml`. It starts Docker services, waits for `/health`, runs migrations, runs the full backend test suite, runs the smoke flow, runs `pip-audit`, and runs web lint/build.

## Repository Structure

```text
backend/              FastAPI service, Alembic migrations, pytest suite
mobile/               Expo React Native app
web/                  Small web/debug client
docs/                 Current docs plus archived historical docs
scripts/              Smoke and helper scripts
docker-compose.yml    Local Postgres, Redis, backend
```
