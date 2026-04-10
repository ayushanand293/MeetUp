# MeetUp 📍

> **Real-time location sharing — privacy-first, built to scale.**

MeetUp is a full-stack mobile + backend platform that lets two people share their live location with each other and automatically detect when they've met. It combines a FastAPI WebSocket backend with a React Native mobile client, using Redis pub/sub for multi-instance broadcasting and PostgreSQL with PostGIS for persistent geospatial data.

---

## Table of Contents

- [What It Does](#what-it-does)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Architecture Overview](#architecture-overview)
- [Key Features](#key-features)
- [WebSocket Protocol](#websocket-protocol)
- [REST API Endpoints](#rest-api-endpoints)
- [Getting Started](#getting-started)
- [Testing](#testing)
- [Code Quality](#code-quality)
- [Deployment](#deployment)
- [Additional Documentation](#additional-documentation)

---

## What It Does

MeetUp solves a simple but surprisingly hard problem: **"I'm on my way — where are you?"**

Instead of sending a static pin, both users share live GPS location in a private session. The app:
1. Shows real-time positions on a map as each person moves
2. Calculates live distance between the two users
3. Detects proximity (≤ 50m) and triggers an **"I'm Here"** confirmation flow
4. Automatically ends the session and celebrates once both confirm they've met

The session is ephemeral — no location history is stored after it ends. Privacy is built in by design.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Mobile** | React Native (Expo), React Navigation |
| **Backend API** | Python 3.11, FastAPI |
| **Realtime** | WebSockets (FastAPI native), Redis Pub/Sub |
| **Database** | PostgreSQL 15 + PostGIS extension |
| **Cache / Broker** | Redis |
| **Auth** | Supabase JWT (verified server-side via `pyjwt`) |
| **Migrations** | Alembic |
| **Containerisation** | Docker + Docker Compose |
| **Linting** | Ruff (Python), ESLint + Prettier (JS) |
| **Testing** | Pytest (backend), manual E2E (mobile) |

---

## Project Structure

```
MeetUp/
├── backend/                  # FastAPI service
│   ├── app/
│   │   ├── api/              # REST route handlers
│   │   │   └── endpoints/    # users, sessions, requests, metrics, realtime
│   │   ├── core/             # Config, database, auth helpers
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── realtime/         # WebSocket gateway & ConnectionManager
│   │   └── worker/           # Background workers (e.g. session cleanup)
│   ├── alembic/              # Database migration scripts
│   ├── tests/                # Pytest test suite
│   ├── seed.py               # Creates test users + session for local dev
│   ├── Dockerfile
│   └── requirements.txt
│
├── mobile/                   # React Native (Expo) app
│   └── src/
│       ├── screens/          # All app screens (Home, Session, Auth, etc.)
│       ├── components/       # Reusable UI components
│       ├── services/         # locationService, realtimeService, analyticsService
│       ├── context/          # AuthContext (JWT, deep-link handling)
│       ├── navigation/       # AppNavigator (tab + stack navigation)
│       └── api/              # HTTP API client wrappers
│
├── web/
│   └── client.html           # Standalone WebSocket debug client
│
├── scripts/                  # lint.sh, setup_hooks.sh
├── docker-compose.yml
├── ARCHITECTURE.md           # Deep-dive into multi-instance design
├── PROTOCOL.md               # WebSocket message specification
└── QUICK_START.md            # Setup for new contributors
```

---

## Architecture Overview

The backend is designed for **horizontal scaling** from day one. Multiple API instances run behind a load balancer; they never share in-process memory. All cross-instance communication goes through Redis.

```
         Mobile / Web clients
               │
        HTTP + WebSocket
               │
     ┌─────────┴─────────┐
     │   Load Balancer   │  (nginx / cloud LB)
     └─────────┬─────────┘
               │
  ┌────────────┼────────────┐
  │            │            │
API-1        API-2        API-N      ← Stateless FastAPI instances
  │            │            │
  └────────────┼────────────┘
               │
         ┌─────▼─────┐
         │   Redis   │  ← Pub/Sub (session:*), rate-limit keys, presence TTLs
         └─────┬─────┘
               │
         ┌─────▼──────────┐
         │  PostgreSQL    │  ← Persistent storage (users, sessions, requests, audit)
         │  + PostGIS     │
         └────────────────┘
```

When User A (connected to API-1) sends a location update:
1. API-1 validates the message (coordinates, accuracy, timestamp, jump detection)
2. API-1 **publishes** the event to `session:{uuid}` on Redis
3. **All** API instances subscribed to that channel receive it
4. Each instance forwards the payload to any local WebSocket connections in that session
5. User B (connected to API-2) receives the location update in real time

> Full design docs → [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Key Features

### 🔐 Auth & Identity
- JWT-based auth, issued by Supabase, verified server-side on every request and WebSocket upgrade
- User registration and login handled on the mobile client; backend is stateless

### 🤝 Meet Requests
- Users can search friends and send a **meet request**
- Deep-link support: `meetup://request/{requestId}` opens the request inbox directly
- Accept/reject flow with inline status feedback and WhatsApp-friendly invite sharing

### 📡 Live Location Session
- Both users join a shared **session** by ID (or via deep-link `meetup://session/{sessionId}`)
- Location updates stream over WebSocket at up to **10 updates/sec per user** (rate-limited server-side)
- Server validates every location packet:
  - Coordinates within valid bounds (lat: ±90, lon: ±180)
  - Accuracy between 0.1m – 100m
  - Timestamp within ±5 minutes of server time
  - Speed check: rejects jumps > 300 km/h (impossible movement detection)

### 🗺️ Distance Intelligence
- Live distance bar shows current separation
- Status changes as users approach: *Far away* → *Getting close* → *Nearly there*
- **"I'm Here"** CTA unlocks at ≤ 50m with a pulse animation

### ✅ Proximity End Flow
- User taps "I'm Here" → 60-second confirmation timer starts
- Both users must confirm within the window
- Session auto-ends; a celebration animation plays
- Fallback: manual confirm path if timer edge-cases occur

### 🔒 Privacy Controls
- **Pause Sharing**: stops broadcasting GPS while keeping the session alive
- App **automatically pauses** on background and resumes on foreground
- Stale/expired peer location states shown clearly in UI (TTL-aware)

### 🔁 Reconnect Resilience (Week 6)
- Grace-window countdown before exponential retry kicks in
- Status badge updates through grace → reconnect → live states
- Snapshot re-sync automatically on reconnect
- URL continuity: retries always use the original backend base URL

### 📊 Observability
- `GET /api/v1/metrics` returns per-instance counters and gauges (WS connections, messages, rate-limit hits, validation errors)
- Alerting thresholds documented in ARCHITECTURE.md

---

## WebSocket Protocol

**Connection URL**
```
ws://<host>/api/v1/ws/meetup?token=<JWT>&session_id=<UUID>
```

### Client → Server

| Message | Description |
|---|---|
| `location_update` | Broadcast current GPS position |
| `end_session` | Manually close the session |

```json
// location_update
{
  "type": "location_update",
  "payload": {
    "lat": 12.9716,
    "lon": 77.5946,
    "accuracy_m": 5.0,
    "timestamp": "2026-04-10T09:00:00Z"
  }
}
```

### Server → Client

| Message | Description |
|---|---|
| `peer_location` | Another participant's updated position |
| `presence_update` | A user joined or left the session |
| `session_ended` | Session closed (user action or proximity) |
| `error` | Validation failure, rate limit, etc. |

```json
// error example
{
  "type": "error",
  "payload": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many updates"
  }
}
```

> Full payload schemas → [PROTOCOL.md](./PROTOCOL.md)

---

## REST API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/users/register` | Register a new user |
| `GET` | `/api/v1/users/{id}` | Fetch user profile |
| `POST` | `/api/v1/requests` | Send a meet request |
| `GET` | `/api/v1/requests` | List incoming / outgoing requests |
| `POST` | `/api/v1/requests/{id}/accept` | Accept a meet request |
| `POST` | `/api/v1/sessions` | Create a new session |
| `GET` | `/api/v1/sessions/{id}` | Get session details |
| `DELETE` | `/api/v1/sessions/{id}` | End a session |
| `POST` | `/api/v1/sessions/{id}/im-here` | Confirm proximity ("I'm Here") |
| `POST` | `/api/v1/invite/redeem` | Redeem a deep-link invite token |
| `GET` | `/api/v1/metrics` | Per-instance observability counters |
| `WS` | `/api/v1/ws/meetup` | Realtime location WebSocket |

---

## Getting Started

### Prerequisites
- Docker & Docker Compose
- Node.js ≥ 18 (for mobile development)
- A Supabase project (for JWT secret)

### 1 — Environment Setup

```bash
cp .env.example .env
```

Open `.env` and fill in:
- `SUPABASE_URL` — your Supabase project URL
- `SUPABASE_KEY` — your Supabase **JWT Secret** (used for server-side token verification)

### 2 — Start the Stack

```bash
docker-compose up -d --build
```

This starts PostgreSQL (with PostGIS), Redis, and the FastAPI backend.

### 3 — Run Migrations & Seed Data

```bash
# Apply DB schema (first run only)
docker-compose exec backend alembic upgrade head

# Create test users (Alice & Bob) + an active session
docker-compose exec backend python seed.py
```

**Save the output!** It contains the `Session ID` and JWT tokens for Alice and Bob — you'll need these to test the WebSocket.

### 4 — Verify with the Web Debugger

1. Open `web/client.html` in your browser (no server needed — it's a plain HTML file)
2. Paste Alice's JWT token and the Session ID
3. Click **Connect**
4. Open a second tab for Bob and do the same
5. Move Alice's location — Bob's tab should update in real time

### 5 — Run the Mobile App

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go or run on a simulator.

---

## Testing

### Backend

```bash
# All tests
docker-compose exec backend pytest

# With output
docker-compose exec backend pytest -v

# Specific file
docker-compose exec backend pytest tests/test_realtime.py
```

### Quick Validation (from project root)

```bash
python quick_validation_test.py
```

Runs a lightweight connectivity check without Docker.

---

## Code Quality

### Run All Linters

```bash
./scripts/lint.sh
```

### Backend (Python — Ruff)

```bash
docker-compose exec backend ruff check .
docker-compose exec backend ruff format .
```

### Mobile (JavaScript — ESLint + Prettier)

```bash
cd mobile
npm run lint        # check
npm run lint:fix    # auto-fix
npm run format      # prettier
```

### Pre-commit Hooks (Recommended)

```bash
./scripts/setup_hooks.sh
```

Installs git hooks that automatically lint and format on every commit:
- ✅ Python (Ruff check + format)
- ✅ JavaScript (ESLint + Prettier)
- ✅ Trailing whitespace & large file checks

**Manual run**:
```bash
pre-commit run --all-files
```

**Skip** (not recommended):
```bash
git commit --no-verify
```

---

## Deployment

The system is designed for multi-instance deployment. A reference `docker-compose.yml` runs 3 backend instances behind nginx for local load-balancer testing:

```bash
# Scale to N instances (with external nginx)
docker-compose up -d --scale backend=3
```

Each instance is fully stateless — scale up or down without downtime. Redis handles all cross-instance coordination.

**Scalability estimates (per instance, 4 CPU / 8 GB RAM):**

| Metric | Limit |
|---|---|
| WebSocket connections | ~1,000 |
| Concurrent sessions | ~500 |
| Location updates / sec | ~5,000 |
| Broadcast latency | < 50ms |

---

## Additional Documentation

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Full multi-instance design, failure modes, scaling strategy |
| [PROTOCOL.md](./PROTOCOL.md) | Complete WebSocket message specification |
| [QUICK_START.md](./QUICK_START.md) | Condensed onboarding for new contributors |
| [FRONTEND_PROGRESS_README.md](./FRONTEND_PROGRESS_README.md) | Week-by-week mobile feature tracker |

---

## License

Private project. All rights reserved.
