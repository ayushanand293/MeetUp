# MeetUp - Quick Reference Guide

## 🎯 What is MeetUp?

A **real-time location sharing app** that helps two users coordinate meetings by sharing their live GPS positions through a WebSocket connection.

### User Journey
```
1. Register/Login (Supabase Auth)
   ↓
2. View friend list & send meet request
   ↓
3. Receiver accepts request
   ↓
4. System creates session with both users
   ↓
5. Users see each other's location on map in real-time
   ↓
6. When close enough OR manually → Session ends
```

---

## 🏢 Tech Stack

### Backend
- **Framework**: FastAPI (Python async web framework)
- **Database**: PostgreSQL + PostGIS (geospatial queries)
- **Cache**: Redis
- **Realtime**: WebSocket
- **Auth**: Supabase JWT
- **Deployment**: Docker + Docker Compose

### Frontend
- **Mobile**: React Native + Expo (iOS/Android)
- **Web**: HTML/JS with Leaflet maps (debugging tool)
- **Auth**: Supabase client library
- **HTTP**: Axios with interceptors

---

## 📁 Key Files to Know

### Backend Core
```
backend/
├── app/main.py                 # FastAPI app setup
├── app/core/config.py          # Settings/env vars
├── app/core/database.py        # SQLAlchemy setup
├── app/models/                 # Database models
│   ├── user.py                 # User profile
│   ├── meet_request.py         # Request system
│   ├── session.py              # Sessions + participants
│   └── audit.py                # Audit trail
├── app/api/
│   ├── api.py                  # Router setup
│   ├── deps.py                 # Auth dependency
│   └── endpoints/
│       ├── users.py            # GET /users/me
│       ├── requests.py         # POST/GET /requests
│       ├── sessions.py         # POST/GET /sessions
│       └── realtime.py         # WebSocket /ws/meetup
└── app/realtime/
    ├── connection_manager.py    # WebSocket connection pool
    └── schemas.py              # Event types & validation
```

### Mobile App
```
mobile/
├── App.js                      # Entry point (Auth wrapper)
├── src/
│   ├── context/AuthContext.js  # Auth state management
│   ├── api/
│   │   ├── client.js           # Axios setup with JWT
│   │   └── supabase.js         # Supabase client
│   ├── navigation/AppNavigator.js  # Screen routing
│   └── screens/
│       ├── LoginScreen.js      # Email/Phone auth
│       ├── HomeScreen.js       # Main hub
│       ├── FriendListScreen.js # Browse users
│       ├── RequestScreen.js    # Send request
│       ├── AcceptRequestScreen.js  # View incoming
│       └── ActiveSessionScreen.js  # Real-time map
└── package.json
```

### Web Debugger
```
web/
└── client.html                 # Standalone HTML debugger
                               # - Connect to WebSocket
                               # - See real-time location updates
                               # - Test events
```

### Infrastructure
```
backend/
├── Dockerfile                  # Backend container
├── docker-compose.yml          # Full stack orchestration
├── requirements.txt            # Python dependencies
├── seed.py                     # Test data generator
├── alembic/                    # Database migrations
└── tests/test_realtime.py      # WebSocket tests
```

---

## 🔑 API Endpoints

### REST Endpoints (HTTP)

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/v1/users/me` | ✅ Bearer | Get current user |
| POST | `/api/v1/requests/` | ✅ Bearer | Send meet request |
| GET | `/api/v1/requests/pending` | ✅ Bearer | List incoming requests |
| POST | `/api/v1/requests/{id}/accept` | ✅ Bearer | Accept request |
| POST | `/api/v1/sessions/from-request/{id}` | ✅ Bearer | Create session from accepted request |
| GET | `/api/v1/sessions/active` | ✅ Bearer | Get user's active session |
| POST | `/api/v1/sessions/{id}/end` | ✅ Bearer | End session |

### WebSocket Endpoint

```
ws://localhost:8000/api/v1/ws/meetup?token={JWT}&session_id={UUID}
```

**Client → Server Events**:
- `location_update` - Send GPS coordinates with accuracy
- `end_session` - User manually ends session

**Server → Client Events**:
- `peer_location` - Other user's location update
- `presence_update` - User came online/went offline
- `session_ended` - Broadcast session end to all
- `error` - Operation failed

---

## 🗄️ Database Models

### User
```python
User {
  id: UUID (Primary Key)
  email: String (Unique, Indexed)
  created_at: DateTime (auto)
  profile_data: JSONB (flexible)
}
```

### MeetRequest
```python
MeetRequest {
  id: UUID
  requester_id: UUID → User.id
  receiver_id: UUID → User.id
  status: "PENDING" | "ACCEPTED" | "REJECTED"
  created_at: DateTime
}
```

### Session + SessionParticipant
```python
Session {
  id: UUID
  status: "PENDING" | "ACTIVE" | "ENDED"
  created_at: DateTime
  ended_at: DateTime (nullable)
  end_reason: String (nullable)
}

SessionParticipant {
  session_id: UUID → Session.id
  user_id: UUID → User.id
  status: "JOINED" | "LEFT"
  joined_at: DateTime
}
```

---

## 🔐 Authentication Flow

```
Mobile App
    ↓
1. User enters email/password
    ↓
2. Calls Supabase Auth API
    ↓
3. Receives JWT + Refresh Token
    ↓
4. App stores in Supabase session
    ↓
5. All HTTP requests: Authorization: Bearer {JWT}
    ↓
6. Backend verifies JWT signature using SUPABASE_KEY
    ↓
7. Auto-creates user if first login
    ↓
✅ User authenticated & session active
```

---

## 📡 Real-time Location Sharing Flow

```
User A (Alice)                          User B (Bob)
    ↓                                       ↓
1. Click "Active Session"          1. Click "Active Session"
    ↓                                       ↓
2. WebSocket connects              2. WebSocket connects
   token=JWT_A                         token=JWT_B
   session_id=<UUID>                  session_id=<UUID>
    ↓                                       ↓
3. Backend validates JWT           3. Backend validates JWT
    ↓                                       ↓
4. ConnectionManager registers         ↓
    ↓                                       ↓
5. Broadcast: Bob is ONLINE ←-→ Broadcast: Alice is ONLINE
    ↓                                       ↓
6. Every 2 sec: Send location_update   Every 2 sec: Send location_update
   {lat: 37.77, lon: -122.41, ...}      {lat: 37.78, lon: -122.42, ...}
    ↓                                       ↓
7. Backend receives ← → Backend receives
    ↓                                       ↓
8. Broadcast to others as peer_location
    ↓                                       ↓
9. Receive Bob's location       9. Receive Alice's location
    ↓                                       ↓
10. Update map marker (Bob)       10. Update map marker (Alice)
    ↓                                       ↓
11. Users see each other         11. Users see each other
```

---

## 🚀 Getting Started (Development)

### 1. Environment Setup
```bash
cd /Users/ayushanand/Projects/MeetUp
cp backend/.env.example backend/.env
# Edit backend/.env with:
#   SUPABASE_URL=https://your-project.supabase.co
#   SUPABASE_KEY=your-jwt-secret
```

### 2. Start Services
```bash
docker-compose up -d --build
# Wait for healthy services
```

### 3. Initialize Database
```bash
docker-compose exec backend alembic upgrade head
docker-compose exec backend python seed.py
```

**Output**:
```
SESSION_ID: <uuid>
TOKEN_ALICE: eyJ0eXAiOiJKV1QiLCJhbGc...
TOKEN_BOB: eyJ0eXAiOiJKV1QiLCJhbGc...
```

### 4. Test WebSocket (Option A: Web Debugger)
```
1. Open web/client.html in browser
2. Paste SESSION_ID and TOKEN_ALICE
3. Click Connect → See "Session Active"
4. Send manual location updates
```

### 5. Test WebSocket (Option B: Run Tests)
```bash
docker-compose exec backend pytest tests/test_realtime.py -v
```

### 6. Development (Hot Reload)
```bash
docker-compose logs -f backend
# Edit code, changes auto-reload
```

---

## 📊 Complete Request-Response Examples

### Example 1: Send Meet Request

**Request**:
```bash
POST /api/v1/requests/
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "receiver_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response**:
```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "requester_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "receiver_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PENDING",
  "created_at": "2024-02-25T10:30:00Z"
}
```

---

### Example 2: Accept Request & Create Session

**Step 1: Accept Request**:
```bash
POST /api/v1/requests/f47ac10b-58cc-4372-a567-0e02b2c3d479/accept
Authorization: Bearer eyJhbGc...
```

**Response**:
```json
{"status": "accepted"}
```

**Step 2: Create Session**:
```bash
POST /api/v1/sessions/from-request/f47ac10b-58cc-4372-a567-0e02b2c3d479
Authorization: Bearer eyJhbGc...
```

**Response**:
```json
{
  "session_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "status": "ACTIVE"
}
```

---

### Example 3: WebSocket Location Message

**Client sends** (Alice to server):
```json
{
  "type": "location_update",
  "payload": {
    "lat": 37.7749,
    "lon": -122.4194,
    "accuracy_m": 5.0,
    "timestamp": "2024-02-25T10:30:00Z"
  }
}
```

**Server broadcasts to Bob**:
```json
{
  "type": "peer_location",
  "payload": {
    "user_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "lat": 37.7749,
    "lon": -122.4194,
    "accuracy_m": 5.0,
    "timestamp": "2024-02-25T10:30:00Z"
  }
}
```

---

## ⚠️ Current Implementation Gaps

| Feature | Status | Notes |
|---------|--------|-------|
| User Auth | ✅ Complete | Supabase + Auto-create |
| Meet Requests | ✅ Backend only | Mobile UI not implemented |
| Session Creation | ✅ Backend only | Mobile UI not implemented |
| Location Sharing | 🟡 Partial | WebSocket works, mobile map UI missing |
| Map Display | ❌ Missing | Backend: PostGIS ready, Mobile: no map library |
| Proximity Detection | ❌ Not started | PostGIS available but logic not implemented |
| Session Auto-End | ❌ Not implemented | Manual end only |
| Offline Support | ❌ Missing | No message queue |

---

## 💡 Quick Debug Tips

### WebSocket Connection Issues
1. Verify token is valid: `jwt.io` decoder
2. Check session_id format: Must be valid UUID
3. Test with web debugger first (`web/client.html`)
4. Check backend logs: `docker-compose logs -f backend`

### Database Issues
1. Check migrations: `docker-compose exec backend alembic current`
2. View logs: `docker-compose logs db`
3. Connect directly: `docker-compose exec db psql -U user -d meetup`

### Mobile Connection Issues
1. Check base URL: Should match backend IP
2. Verify Supabase keys in `.env`
3. Test with Expo: `expo start --web` for quick testing
4. Check Android emulator network: May need `10.0.2.2` instead of `localhost`

---

## 📖 File Dependencies

```
Authentication Flow:
  LoginScreen → AuthContext → supabase-js
                             ↓ (stores JWT)
                         async-storage

API Calls:
  HomeScreen → client.js (axios)
                    ↓ (adds JWT header)
                 FastAPI
                    ↓
                 deps.py (verify JWT)
                    ↓
                 Database

WebSocket:
  ActiveSessionScreen → WebSocket API
                            ↓
                      realtime.py
                            ↓
                      connection_manager.py
                            ↓
                      broadcast to all in session
```

---

## 🎓 Learning Resources

- **PROTOCOL.md** - Message format specs
- **PARTNER_HANDOFF.md** - Integration guide
- **Alembic Docs** - Database migrations
- **FastAPI Docs** - Framework reference
- **React Native Docs** - Mobile framework
- **Leaflet.js Docs** - Web map library

---

## Version Info
- Python: 3.11
- FastAPI: Latest
- React Native: 0.81.5
- PostgreSQL: 15 + PostGIS 3.3
- Redis: Alpine
- Node/Expo: 54+

---

**Last Updated**: February 25, 2026
**Status**: Web & API working, Mobile partial, WebSocket fully tested
