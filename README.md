# MeetUp Backend 🚀

Real-time location sharing system with privacy-first principles.

## ⚡️ Quickstart

### 1. Environment Setup
Create your local environment file.
```bash
cp .env.example .env
```
> **Action Required**: Open `.env` and fill in:
> - `SUPABASE_URL`: Your project URL.
> - `SUPABASE_KEY`: Your **JWT Secret** (Required for Auth verification).

### 2. Run Infrastructure
Start Postgres, Redis, and the Backend API.
```bash
docker-compose up -d --build
```
*Wait for the containers to be healthy.*

### 3. Database & Seeding
Auto-generate tables and create test users (Alice & Bob).
```bash
# Apply Migrations (First run only)
docker-compose exec backend alembic upgrade head

# Seed Test Data (Users + Active Session)
docker-compose exec backend python seed.py
```
**Save the output!** It contains the `Session ID` and `JWT Tokens` you need for testing.

---

## 🛠️ Verification Tools

### Mobile/Frontend Integration
See [PARTNER_HANDOFF.md](./PARTNER_HANDOFF.md) for endpoints and protocols.

### Web Debugger
We included a simple HTML client to verify the WebSocket connection.
1. Running the stack (`docker-compose up`).
2. Open `web/client.html` in your browser.
3. Paste the credentials from `seed.py`.
4. Connect and see real-time updates.

---

## 🏗️ Architecture
- **API**: FastAPI (Auth, User Management, Session Logic)
- **Realtime**: WebSocket Gateway (`/api/v1/ws/meetup`)
- **DB**: PostgreSQL + PostGIS (Geospatial data)
- **Cache**: Redis (Session state, Presence)

## 🧪 Testing
```bash
docker-compose exec backend pytest
```
