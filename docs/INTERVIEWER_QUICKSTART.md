# Interviewer Quickstart

This is the shortest reliable path to run and inspect MeetUp locally.

## 1. Start The Stack

```bash
docker compose up -d --build
docker compose exec -T backend alembic upgrade head
```

Expected migration summary:

```text
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
```

## 2. Verify Backend

```bash
curl -fsS http://localhost:8000/health
curl -fsS http://localhost:8000/ready
```

Expected readiness:

```json
{"status":"ok","components":{"database":"ok","redis":"ok"}}
```

## 3. Run Tests

```bash
docker compose exec -T backend pytest -q
```

Current expected result:

```text
65 passed
```

## 4. Run Smoke

```bash
./scripts/beta_smoke.sh
```

Expected final line:

```text
Smoke test suite completed successfully!
```

## 5. Run Mobile

```bash
cd mobile
npm install
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1 npm run start
```

For a physical device:

```bash
EXPO_PUBLIC_API_BASE_URL=http://YOUR_LAN_IP:8000/api/v1 npm run start
```

Mobile lint currently reports warnings, mostly hook dependency and style warnings. It reports 0 errors in the current cleanup pass and is not blocking functionality.

## 6. Demo Flow

Use two devices/accounts:

1. Sign in with phone OTP.
2. Device A opens Find Friends.
3. Device A sends a meet request or invite link.
4. Device B accepts.
5. Both enter one active 1:1 session.
6. Move either device and observe realtime peer location.
7. End the session.

Full walkthrough: [demo_script.md](demo_script.md)

## Important Notes

- Real SMS delivery is not implemented yet; the OTP sender is a provider placeholder.
- `OTP_DEV_ECHO_ENABLED=true` can echo OTPs only outside production.
- Current invite path is `/api/v1/invites`; session-scoped invite endpoints are deprecated compatibility endpoints.
- OpenRouteService routing is optional and controlled by `EXPO_PUBLIC_ORS_KEY`.
