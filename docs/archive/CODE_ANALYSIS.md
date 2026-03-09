# MeetUp Codebase - Comprehensive Analysis

## 📋 Overview

**MeetUp** is a real-time location sharing application with privacy-first principles. It enables two users to coordinate meetings by sharing their live GPS locations through WebSocket connections.

### Key Features
- Real-time location streaming via WebSocket
- User authentication (Supabase JWT)
- Meet request system (send/accept/reject)
- Active session management with proximity tracking
- Presence updates (online/offline status)
- Multi-platform support (Mobile - React Native, Web - HTML/JS)

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     MeetUp System                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐      ┌──────────────┐      ┌────────────┐ │
│  │  Mobile App  │      │  Web Client  │      │  Desktop   │ │
│  │(React Native)│      │   (Leaflet)  │      │  Debugger  │ │
│  └──────┬───────┘      └──────┬───────┘      └──────┬─────┘ │
│         │                     │                     │        │
│         └─────────────────────┼─────────────────────┘        │
│                               │ WebSocket                    │
│  ┌────────────────────────────┴────────────────────────────┐ │
│  │         FastAPI Backend (Python)                        │ │
│  ├──────────────────────────────────────────────────────────┤ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │ │
│  │  │ REST API │  │ WebSocket│  │ Connection Manager   │  │ │
│  │  │ Endpoints│  │ Gateway  │  │ (Realtime Broadcast) │  │ │
│  │  └──────────┘  └──────────┘  └──────────────────────┘  │ │
│  │                                                          │ │
│  │  ├─ /users       (Profile management)                  │ │
│  │  ├─ /requests    (Meet request lifecycle)              │ │
│  │  ├─ /sessions    (Session lifecycle)                   │ │
│  │  └─ /ws/meetup   (Realtime location streaming)         │ │
│  └──────────────────────────────────────────────────────────┘ │
│         │                           │                         │
│         ▼                           ▼                         │
│  ┌──────────────┐         ┌──────────────┐                   │
│  │ PostgreSQL   │         │    Redis     │                   │
│  │+ PostGIS     │         │   (Cache)    │                   │
│  │              │         │              │                   │
│  │(Users,       │         │(Session      │                   │
│  │Requests,     │         │state,        │                   │
│  │Sessions)     │         │Presence)     │                   │
│  └──────────────┘         └──────────────┘                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Project Structure

### Backend (`/backend`)

#### Core Configuration
- **`app/core/config.py`**: Settings management using Pydantic
  - `DATABASE_URL` - PostgreSQL connection string
  - `REDIS_URL` - Redis cache connection
  - `SUPABASE_KEY` - JWT secret for token verification

- **`app/core/database.py`**: SQLAlchemy engine and session setup
  - Creates SQLAlchemy engine connected to PostgreSQL
  - Provides `get_db()` dependency for route handlers
  - Uses declarative base for ORM models

#### Database Models (`/app/models`)

1. **`user.py` - User Model**
   - `id` (UUID, Primary Key)
   - `email` (String, Unique, Indexed)
   - `created_at` (DateTime, server-managed)
   - `profile_data` (JSONB, flexible user metadata)

2. **`meet_request.py` - MeetRequest Model**
   - `id` (UUID, Primary Key)
   - `requester_id` (FK → User)
   - `receiver_id` (FK → User)
   - `status` (Enum: PENDING, ACCEPTED, REJECTED)
   - `created_at` (DateTime)
   - Relationships: `requester`, `receiver` (User objects)

3. **`session.py` - Session & Participant Models**
   
   **Session**:
   - `id` (UUID, Primary Key)
   - `status` (Enum: PENDING, ACTIVE, ENDED)
   - `created_at`, `ended_at` (DateTime)
   - `end_reason` (String, nullable)
   - `participants` (Relationship → SessionParticipant list)
   
   **SessionParticipant**:
   - `session_id`, `user_id` (Composite Primary Key)
   - `status` (Enum: JOINED, LEFT)
   - `joined_at` (DateTime)
   - Relationships: `session`, `user`

4. **`audit.py`** - Audit event tracking (imported but not detailed in code shown)

5. **`base.py`** - Shared declarative base for all models

#### API Endpoints (`/app/api`)

**Router Structure** (`api.py`):
```
/api/v1/
├── /users
├── /requests
├── /sessions
└── /ws (WebSocket)
```

**1. Users Endpoint** (`endpoints/users.py`)
- `GET /users/me` - Get current user profile
  - Requires authentication (HTTPBearer token)
  - Returns: `{id, email, profile_data}`

**2. Meet Requests Endpoint** (`endpoints/requests.py`)
- `POST /requests/` - Create meet request
  - Body: `receiver_id` (UUID)
  - Returns: MeetRequest object with PENDING status
  - Validation: Can't request self, prevents duplicate pending requests

- `GET /requests/pending` - List incoming requests
  - Returns: Array of pending requests with requester info
  - Query: Filters for `receiver_id == current_user && status == PENDING`

- `POST /requests/{request_id}/accept` - Accept request
  - Validates: User is receiver, request exists, status is PENDING
  - Action: Changes status to ACCEPTED
  - Note: Mentions session creation should be triggered here

**3. Sessions Endpoint** (`endpoints/sessions.py`)
- `POST /sessions/from-request/{request_id}` - Create session from accepted request
  - Validates: Request is ACCEPTED, user is requester or receiver
  - Creates: MeetSession (ACTIVE status)
  - Adds: Two SessionParticipant records
  - Returns: `{session_id, status}`

- `GET /sessions/active` - Get active session for user
  - Query: Finds first active session where user is JOINED participant
  - Returns: `{session_id, joined_at}` or `null`

- `POST /sessions/{session_id}/end` - End active session
  - Body: `{reason: string}`
  - Validates: User is participant, session is ACTIVE
  - Updates: Session status to ENDED, sets end_reason and ended_at
  - Returns: `{status: "ended"}`

**4. WebSocket Endpoint** (`endpoints/realtime.py`)
- `WebSocket /ws/meetup` - Real-time location streaming
  - Query Params: `token` (JWT), `session_id` (UUID)
  - Authentication: Validates JWT, extracts `user_id` from `sub` claim
  - Connection Flow:
    1. Validate token and session_id format
    2. Verify JWT signature using SUPABASE_KEY
    3. Register websocket with ConnectionManager
    4. Broadcast ONLINE presence to session participants
  - Message Handling Loop:
    - Receives JSON-encoded events
    - Parses event type (LOCATION_UPDATE, END_SESSION, etc.)
    - Broadcasts peer_location to other participants (excludes sender)
    - Sends error events for parsing failures
  - Disconnection: Cleans up websocket, broadcasts OFFLINE

#### Realtime System (`/app/realtime`)

**ConnectionManager** (`connection_manager.py`):
- **Responsibilities**: Manage WebSocket connections per session
- **Data Structures**:
  - `active_sessions`: Dict[UUID, List[WebSocket]] - Map of sessions to connections
  - `ws_to_user`: Dict[WebSocket, UUID] - Reverse lookup for user_id
  
- **Methods**:
  - `connect()` - Accept connection, register, broadcast ONLINE presence
  - `disconnect()` - Clean up websocket, broadcast OFFLINE presence
  - `broadcast()` - Send message to all users in session (with optional exclusion)
  - `broadcast_presence()` - Specialized method to send presence updates

**Event Schemas** (`schemas.py`):

Event Types:
```
Client → Server:
- LOCATION_UPDATE: {"type": "location_update", "payload": {lat, lon, accuracy_m, timestamp}}
- END_SESSION: {"type": "end_session", "payload": {reason}}

Server → Client:
- PEER_LOCATION: {"type": "peer_location", "payload": {user_id, lat, lon, accuracy_m, timestamp}}
- PRESENCE_UPDATE: {"type": "presence_update", "payload": {user_id, status: "online"|"offline", last_seen}}
- SESSION_ENDED: {"type": "session_ended", "payload": {reason, ended_at}}
- ERROR: {"type": "error", "payload": {code, message}}
```

#### Authentication (`api/deps.py`)
- `get_current_user()` - Dependency for protected routes
  - Uses HTTPBearer authentication scheme
  - Decodes JWT token using SUPABASE_KEY
  - Extracts user_id from `sub` claim, email from `email` claim
  - Auto-creates user on first login if not in database
  - Raises 403 HTTPException on invalid token

#### Tests (`/tests`)
- `test_flow.py` - (Not detailed in shown code)
- `test_realtime.py` - WebSocket tests
  - `test_websocket_connection_no_token()` - Validates auth required
  - `test_websocket_broadcast()` - Verifies message broadcasting works
  - `test_websocket_echo_prevention()` - Ensures sender doesn't receive own message
  - `test_websocket_presence()` - Validates online/offline presence events

#### Configuration & Deployment
- **`main.py`**: FastAPI app initialization
  - CORS middleware (currently allows all origins - should restrict in production)
  - Routes: `/` (welcome), `/health` (healthcheck), `/api/v1/*` (API router)
  - Health check at `/health` returns `{status: "ok"}`

- **`requirements.txt`**: Dependencies
  - FastAPI Framework
  - SQLAlchemy ORM
  - Alembic (Database migrations)
  - psycopg2-binary (PostgreSQL driver)
  - Redis
  - PyJWT (JWT handling)
  - Pytest (Testing)
  - Ruff (Linting)
  - Gunicorn (Production server)
  - MyPy (Type checking)

- **`docker-compose.yml`**: Service orchestration
  - PostgreSQL 15 with PostGIS extension
  - Redis Alpine
  - FastAPI backend service
  - Health checks for all services

---

### Mobile App (`/mobile`)

**Framework**: React Native with Expo 54 (Cross-platform iOS/Android)

#### Entry Point (`App.js`)
- Wraps app in SafeAreaProvider (handles notches/safe areas)
- AuthProvider wraps AuthContext
- Logs Supabase URL for debugging
- Shows redirectUrl for OAuth flow

#### Configuration
**`package.json`**:
- React 19.1.0, React Native 0.81.5
- Key Dependencies:
  - `@supabase/supabase-js` - Auth & real-time DB
  - `axios` - HTTP client
  - `@react-navigation/native` - Navigation framework
  - `async-storage` - Local persistence
  - `expo-*` - Expo utilities

#### Authentication (`src/context/AuthContext.js`)
- **Auth Methods**:
  - Email/Password (sign up, sign in, reset password)
  - Phone (OTP flow)
  - Magic links

- **Context Values**:
  - `session` - Current Supabase session
  - `user` - Current user object
  - `loading` - Auth state loading indicator
  - Methods: `signInWithEmail()`, `signUpWithEmail()`, `signInWithPhone()`, `verifyPhoneOTP()`, `signOut()`, `resetPassword()`

- **Features**:
  - Deep link handling for magic link authentication
  - Auth state change listener
  - Async storage integration
  - Loading state management

#### API Client (`src/api/client.js`)
- **Base URL Logic**:
  - iOS simulator: `http://localhost:8000/api/v1`
  - LAN/Physical device: Extracts IP from Expo debugger host
  - Android emulator: `http://10.0.2.2:8000/api/v1`
  - Fallback: `http://localhost:8000/api/v1`

- **Supabase Client** (`src/api/supabase.js`):
  - Initialized with EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY

- **Interceptor**:
  - Automatically adds Supabase JWT token to Authorization header
  - Handles 401 responses (token refresh)

#### Navigation (`src/navigation/AppNavigator.js`)
**Stack Structure**:

1. **AuthStack** (shown when not logged in):
   - Login → Register → ForgotPassword

2. **MainStack** (shown when logged in):
   - Home (Hub screen)
   - FriendList (Browse users)
   - Request (Send meet request)
   - AcceptRequest (View incoming requests)
   - ActiveSession (Realtime location sharing)

#### Screens

**1. LoginScreen** (`src/screens/LoginScreen.js`)
- **Dual Tab System**:
  - Email/Password tab
  - Phone OTP tab

- **Email Features**:
  - Login with email/password
  - Forgot password link
  - Loading indicator
  - Error handling with user-friendly messages

- **Phone Features**:
  - Send OTP to phone
  - Verify OTP code
  - Focused error messages

- **UI**: ScrollView with keyboard avoidance, form validation

**2. HomeScreen** (`src/screens/HomeScreen.js`)
- **Layout**:
  - Welcome message with user email
  - Navigation buttons:
    - "View Friends" → FriendListScreen
    - "Incoming Requests" → AcceptRequestScreen
  - Sign out button

- **Styling**: Clean card-based layout with color-coded buttons

**3. ActiveSessionScreen** (`src/screens/ActiveSessionScreen.js`)
- **Status Display**:
  - Green indicator showing "Session Active"
  - Friend name and email from route params
  - Info message about location sharing

- **Features**:
  - "End Session" button with confirmation dialog
  - Returns to Home after ending
  - Receives friend data via route params

- **Current Limitation**: Map view not fully implemented (placeholder text)

**4. Other Screens** (Mentioned but partial implementation):
- `RegisterScreen.js` - User registration
- `ForgotPasswordScreen.js` - Password recovery
- `FriendListScreen.js` - Browse & send requests
- `RequestScreen.js` - Send request to specific user
- `AcceptRequestScreen.js` - Accept incoming requests

---

### Web Client (`/web/client.html`)

**Purpose**: Realtime debugger for testing WebSocket connections

#### Features
- **Connection Panel**:
  - WebSocket URL input
  - Session ID input
  - JWT Token input
  - Connect/Disconnect toggle
  - Status indicator (online/offline)

- **Map Display**:
  - Leaflet.js map (CartoDB light tiles)
  - Default location: Bangalore (12.9716, 77.5946)
  - My marker (blue) - current user location
  - Peer markers (random colors) - other participants
  - Zoom to fit function

- **Message Handling**:
  - `peer_location` - Update peer marker position
  - `presence_update` - Log online/offline status
  - `session_ended` - Log session end
  - Generic error handling

- **Broadcasting**:
  - Auto-broadcasts location every 2 seconds
  - Updates my marker on map
  - Sends JSON location_update events

- **Logging**:
  - Console log with timestamps
  - Color-coded message types (SUCCESS, WARNING, ERROR)
  - Max 50 log entries in view

---

## 🔄 Data Flow Examples

### User Registration & Login Flow
```
1. User enters email/password in LoginScreen
2. Calls Supabase Auth API via AuthContext.signInWithEmail()
3. Receives JWT token & refresh token
4. AuthProvider stores in Supabase session
5. Navigation auto-switches to MainStack
6. Axios interceptor automatically adds JWT to all API requests
```

### Meet Request Flow
```
1. User A navigates to FriendListScreen
2. Finds User B, clicks "Request"
3. Calls POST /api/v1/requests/ with receiver_id = B
4. Backend creates MeetRequest with status=PENDING
5. User B sees notification "Incoming Requests"
6. User B goes to AcceptRequestScreen
7. User B clicks Accept → POST /api/v1/requests/{id}/accept
8. Backend updates status to ACCEPTED
9. Either user can now call POST /api/v1/sessions/from-request/{request_id}
10. ActiveSessionScreen starts, session created with both participants
```

### Real-time Location Sharing Flow
```
1. ActiveSessionScreen mounts with session_id in params
2. Establishes WebSocket connection:
   - URL: ws://localhost:8000/api/v1/ws/meetup?token={JWT}&session_id={UUID}
3. Backend validates JWT, registers socket in ConnectionManager
4. Backend broadcasts PRESENCE_UPDATE (ONLINE) to other participants
5. Every ~2 seconds, app sends location_update event:
   {
     "type": "location_update",
     "payload": {
       "lat": 37.7749,
       "lon": -122.4194,
       "accuracy_m": 5.0,
       "timestamp": "2024-02-25T10:00:00Z"
     }
   }
6. Backend receives location, broadcasts to others as:
   {
     "type": "peer_location",
     "payload": {
       "user_id": "{uuid}",
       "lat": 37.7749,
       "lon": -122.4194,
       "accuracy_m": 5.0,
       "timestamp": "2024-02-25T10:00:00Z"
     }
   }
7. App receives peer_location, updates map marker
8. When session ends, sends end_session event
9. Backend broadcasts session_ended to all participants
```

---

## 🗄️ Database Schema

### Tables

| Table | Columns | Purpose |
|-------|---------|---------|
| `users` | id, email, created_at, profile_data | User profiles |
| `meet_requests` | id, requester_id, receiver_id, status, created_at | Request lifecycle |
| `sessions` | id, status, created_at, ended_at, end_reason | Session metadata |
| `session_participants` | session_id, user_id, status, joined_at | Track who's in session |
| `audit_events` | (not fully detailed) | Audit trail |

### Relationships
```
User (1) ←→ (Many) MeetRequest
  └─ requester_id → User.id
  └─ receiver_id → User.id

Session (1) ←→ (Many) SessionParticipant
  └─ participants relationship

SessionParticipant (Many) ←→ User (1)
  └─ user_id → User.id
  └─ session_id → Session.id
```

---

## 🔐 Security Considerations

### Current Implementation
✅ **Good Practices**:
- JWT authentication on all protected endpoints
- WebSocket token validation before accepting connection
- Supabase-managed user authentication
- User auto-creation on first login with provided email

⚠️ **Areas for Improvement**:
1. **CORS**: Currently allows all origins (`["*"]`) - should be restricted to specific domains in production
2. **Token Rotation**: No refresh token mechanism visible in WebSocket layer
3. **Rate Limiting**: No rate limiting on HTTP endpoints (see test for "RATE_LIMIT_EXCEEDED")
4. **Proximity Logic**: Not implemented - sessions don't auto-end when users are close
5. **Session Security**: No session-level authorization beyond user participation check

---

## 🚀 Deployment & Infrastructure

### Docker Compose Stack
- **PostgreSQL 15 + PostGIS**: Geospatial queries support
- **Redis**: Session caching and presence state
- **FastAPI Backend**: Uvicorn with hot reload (development)
- **Health Checks**: All services monitored

### Environment Variables Required
```
DATABASE_URL=postgresql://user:password@db:5432/meetup
REDIS_URL=redis://redis:6379/0
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-jwt-secret
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=meetup
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Seed & Testing
- `seed.py`: Creates test users (Alice & Bob) + active session, generates JWTs
- `pytest`: Run with `docker-compose exec backend pytest`
- HTML Client: Open `web/client.html` to manually test WebSocket

---

## 📊 Code Quality

### Project Standards
- **Linting**: Ruff configured with E, W, F, I, B, C4, UP rules
- **Type Checking**: MyPy with strict settings (disallow_untyped_defs)
- **Python Version**: 3.11 (modern async/await support)
- **Testing**: Pytest framework with WebSocket tests

### Code Organization
✅ **Strengths**:
- Clear separation of concerns (API, Models, Realtime, Core)
- Dependency injection for database sessions
- Schema-based validation (Pydantic)
- Modular router structure

❌ **Potential Issues**:
- Limited test coverage (only realtime tested)
- No integration tests for REST endpoints
- Error handling could be more comprehensive
- Logging is sparse (only in WebSocket endpoint)

---

## 🎯 Feature Completeness Matrix

| Feature | Backend | Mobile | Web | Status |
|---------|---------|--------|-----|--------|
| User Auth | ✅ Supabase | ✅ Full | N/A | Complete |
| User Profile | ✅ REST | 🟡 Basic | N/A | Partial |
| Meet Requests | ✅ Full CRUD | ❌ Not implemented | N/A | Backend only |
| Session Creation | ✅ REST | ❌ Not implemented | N/A | Backend only |
| Location Sharing | ✅ WebSocket | 🟡 Screen exists | ✅ Full | Partial |
| Map Display | ✅ PostGIS ready | ❌ No map libs | ✅ Leaflet | Mobile missing |
| Proximity Detection | ❌ Not implemented | N/A | N/A | Not started |
| Presence Tracking | ✅ Implemented | 🟡 Receives | ✅ Receives | Good |
| Session End | ✅ REST + WS | 🟡 Screen only | N/A | Partial |

---

## 🔧 Known Limitations & TODOs

1. **Mobile Map Integration**: ActiveSessionScreen doesn't display map or location markers
2. **Meet Request UI**: Mobile screens for sending/accepting requests not implemented
3. **Real Geospatial Queries**: PostGIS configured but not used for proximity logic
4. **Session Auto-End**: No automatic session termination when users reach proximity
5. **Redis Integration**: Connected but not actively used in current code
6. **Error Recovery**: Limited retry logic for failed WebSocket connections
7. **Offline Support**: No offline queue for location updates
8. **Production CORS**: Needs proper domain allowlist before public deploy
9. **Comprehensive Logging**: Would benefit from structured logging (e.g., using Python logging module)
10. **Performance**: No pagination for meet request lists or friend lookups

---

## 📈 Suggested Improvements

**Priority 1 (Critical)**:
- Implement mobile map display in ActiveSessionScreen
- Add proximity-based session auto-end logic
- Restrict CORS to specific origins in production
- Add comprehensive error handling in all WebSocket handlers

**Priority 2 (Important)**:
- Implement remaining mobile screens (RequestScreen, FriendListScreen, AcceptRequestScreen)
- Add structured logging throughout backend
- Implement rate limiting on API endpoints
- Add session-level authorization checks

**Priority 3 (Enhancement)**:
- Use Redis for caching meet requests and user lists
- Add pagination to API endpoints
- Implement location history tracking
- Add metrics/analytics endpoint
- Create admin dashboard for monitoring sessions
- Add mobile push notifications for incoming requests

---

## 📚 Documentation References

- **PROTOCOL.md**: WebSocket message format specification
- **PARTNER_HANDOFF.md**: Integration guide for mobile/frontend teams
- **README.md**: Quick start & architecture overview
- **Migrations**: Alembic migrations in `alembic/versions/`

---

## 🎓 Summary

MeetUp is a well-structured real-time location sharing application with a solid backend foundation using FastAPI, PostgreSQL, and WebSocket. The mobile app framework is set up but needs implementation of key screens and map integration. The architecture supports scalability through Docker containerization and uses industry-standard tools (Supabase, Redis, PostGIS). Main gaps are in mobile UI implementation and proximity-based features.
