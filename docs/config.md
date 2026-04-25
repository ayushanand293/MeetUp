# Client Configuration & Environment Parity

The MeetUp mobile client requires a few environment variables to function correctly. This ensures we don't accidentally leak development fallback behavior into production.

## Environment Variables

### `EXPO_PUBLIC_API_BASE_URL`
- **Description:** The root URL of the backend API (e.g. `https://meetup-api.example.com/api/v1`).
- **Required:** **Yes in Production.** Optional in Development (`__DEV__`).
- **Dev Behavior:** If omitted in dev, the client uses `Constants.expoConfig?.hostUri` to find your local dev machine IP, then falls back to Android emulator IP (`10.0.2.2`) or localhost.
- **Prod Behavior:** If omitted in a production build, the app will throw a fatal error on launch: `CRITICAL: EXPO_PUBLIC_API_BASE_URL is not set for production build.`

### `EXPO_PUBLIC_CLIENT_LOCATION_FOREGROUND_ONLY`
- **Description:** Whether to only track location while the app is foregrounded. True saves battery and uses simpler permission flow.
- **Required:** No
- **Default:** `true`

### `EXPO_PUBLIC_CLIENT_ANALYTICS_ENABLED`
- **Description:** Toggle analytics tracking.
- **Required:** No
- **Default:** `true`

## Example Usage

### Local Testing (iOS Simulator / Android Emulator)
You typically do *not* need to set the base URL unless your backend runs on a non-standard port/host.
```bash
npx expo start
```

### Local Testing (Physical Device on LAN)
Expo automatically detects your host IP and the app uses it via `Constants.expoConfig.hostUri`.
If this fails, manually set the URI:
```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.50:8000/api/v1 npx expo start
```

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.meetup.example.com/api/v1 eas build --profile production
```

## Production Security Hardening

To ensure production readiness, the backend supports strict CORS and environment-based behavior.

### `ENVIRONMENT`
- **Options:** `development`, `production`
- **Behavior:** 
  - If `development`, CORS defaults to `*` if `CORS_ORIGINS` is empty.
  - If `production`, CORS defaults to a strict set of local origins (localhost) unless `CORS_ORIGINS` is explicitly provided.

### `CORS_ORIGINS`
- **Format:** JSON list of strings (e.g. `["https://app.meetup.com"]`)
- **Required:** Highly recommended in production.
- **Enforcement:** The backend will reject any request from an origin not in this list.

### `ANALYTICS_ENABLED`
- **Default:** `true`
- **Note:** Can be disabled to stop all database ingestion of client events.

### `METRICS_BACKEND`
- **Options:** `redis`, `memory`
- **Default:** `redis`
- **Description:** 
  - `redis`: Metrics are shared across all processes (Uvicorn, Pytest, Workers) via a shared Redis instance. This is required for unified monitoring in production and dev clusters.
  - `memory`: Metrics are local to the current process. Counters incremented in tests will not be visible to the web server.
  - **Failover:** In development, if Redis is unreachable but `METRICS_BACKEND=redis`, the system falls back to `memory` automatically.

## Observability & Metrics

### Viewing Metrics
- **JSON:** `GET /api/v1/metrics`
- **Prometheus:** `GET /api/v1/metrics?format=prometheus`

### Verification (Cross-Process)
To verify that metrics are working across processes:
1. Start the server: `docker compose up -d`
2. Run a test that increments metrics:
   ```bash
   docker compose exec -T backend pytest tests/test_metrics_cross_process.py
   ```
3. Verify via curl:
   ```bash
   curl -s "http://localhost:8000/api/v1/metrics?format=prometheus"
   ```
   You should see your test metrics reflected in the output.
