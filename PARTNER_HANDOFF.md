# Partner Handoff (Mobile/Frontend) - Week 1

The Backend v1 is ready. Here is what you need to connect your mobile app.

## 1. Connection Details

- **Base URL**: `http://localhost:8000` (Android Emulator: `http://10.0.2.2:8000`)
- **Auth Provider**: Supabase
    - **Note**: The backend verifies Supabase JWTs. You must configure your mobile app with the same Supabase Project URL/Key as the backend (or just use the tokens if testing against a real Supabase instance).

## 2. API Endpoints (REST)

All endpoints require the `Authorization: Bearer <SUPABASE_JWT>` header.

### User
- `GET /api/v1/users/me`: Get current user profile.

### Meet Requests
- `GET /api/v1/requests/pending`: List incoming requests.
- `POST /api/v1/requests/?receiver_id=<UUID>`: Send a meet request.
    - **Note**: Since we don't have a "User Search" API yet, you can create a second user via Supabase and grab their UUID manually for testing, or use "Static Data" as per the plan.
- `POST /api/v1/requests/{request_id}/accept`: Accept a request.

### Sessions
- `POST /api/v1/sessions/from-request/{request_id}`: Turn an accepted request into an active session.
- `GET /api/v1/sessions/active`: Check if the user is in an active session.

## 3. Recommended Dev Workflow

1.  **Start Backend**: `docker-compose up`
2.  **Auth**: Login on mobile via Supabase.
3.  **Test Flow**:
    -   Hardcode a `receiver_id` (a second user's UUID) in your "Request Location" button for now.
    -   Call `POST /requests`.
    -   Login as that second user (or use a simulator instance).
    -   See request in `GET /requests/pending`.
    -   Accept it.
    -   Transition UI to "Active Session" placeholder.

## 4. Pending items for Week 2
- Realtime location streaming (WebSockets) is coming next week. For now, just show a "Session Active" static screen.
