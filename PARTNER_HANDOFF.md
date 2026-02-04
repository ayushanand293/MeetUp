# Partner Handoff (Mobile/Frontend) - Week 2 (Realtime) 🚀

The Backend Realtime Gateway is **ready**.

## 1. Quick Start (Test Data) ⚡️

We created a seed script to give you 2 Users + 1 Active Session instantly.
run:
```bash
docker-compose exec backend python seed.py
```
This prints:
- `SESSION_ID` (UUID)
- `TOKEN_ALICE` (JWT)
- `TOKEN_BOB` (JWT)

## 2. Realtime Gateway

*   **URL**: `ws://localhost:8000/api/v1/ws/meetup` (Note the `/api/v1` prefix!)
*   **Query Params**:
    *   `token`: Your Supabase JWT.
    *   `session_id`: The UUID of the session.

Example URL:
`ws://localhost:8000/api/v1/ws/meetup?token=...&session_id=...`

## 3. Protocol
See `PROTOCOL.md` for the full JSON schema.

**Key Events**:
1.  **Presence**: You will receive `presence_update` (status: online) immediately when the other user connects.
2.  **Location**: Send `location_update` every ~2s. You will receive `peer_location` when the other user moves.

## 4. Tools for You 🛠️

### A. Simple HTML Client (`web/client.html`)
We built a simple web debugger for you.
1.  Open `web/client.html` in Chrome.
2.  Paste the Session ID and Token from the seed script.
3.  Click Connect.
4.  **Use this to verify your mobile app works**: If your app sends location, this web page should see it move!

### B. Seed Script (`backend/seed.py`)
Use this whenever you reset the database or need fresh test users.

## 5. Web Fallback
The `web/client.html` file IS a working implementation of the map view. You can use it as a reference for the React Native implementation (it uses Leaflet JS, but the logic is the same).
