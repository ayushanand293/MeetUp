# MeetUp Implementation Plan - Mobile Completion

**Date**: February 26, 2026  
**Backend Status**: ✅ COMPLETE (through Week 3)  
**Mobile Status**: 🟡 SCAFFOLDING DONE, REALTIME FEATURES PENDING

---

## 📊 Current Status Overview

### ✅ What's Complete (Backend + Week 3)

#### Backend API (Week 1-2)
- ✅ REST endpoints for user management, requests, sessions
- ✅ Supabase JWT authentication
- ✅ Database models (users, sessions, meet_requests, participants)
- ✅ WebSocket gateway at `/api/v1/ws/meetup`
- ✅ Real-time broadcasting (location_update → peer_location)
- ✅ Presence tracking (online/offline events)
- ✅ Comprehensive WebSocket tests

#### Backend Infrastructure (Week 3)
- ✅ Redis pub/sub for multi-instance broadcasting
- ✅ Location validation (4-tier: coords, accuracy, timestamp, jump detection)
- ✅ Rate limiting (10 msgs/sec per user:session)
- ✅ Metrics collection (connections, messages, errors)
- ✅ Docker Compose setup (PostgreSQL + PostGIS + Redis + FastAPI)

#### Web Debugger (Week 2)
- ✅ Full Leaflet.js map integration
- ✅ WebSocket connection/reconnection
- ✅ Real-time marker updates for self and peers
- ✅ Connection status display
- ✅ Event logging console

#### Mobile Scaffolding (Weeks 1-2)
- ✅ App structure with React Navigation
- ✅ Auth context (Supabase login/logout/session)
- ✅ Axios HTTP client with JWT interceptor
- ✅ Screen navigation (Auth Stack → Main Stack)
- ✅ All screens created (placeholder implementations)
- ✅ Supabase auth fully working
- ✅ Logo branding

---

## 🚀 What's Left to Implement (Mobile Realtime Features)

### Phase 1: Location Services Setup (2-3 days)

#### Task 1.1: Location Permissions
**Status**: ❌ NOT STARTED  
**Files**: `mobile/src/services/locationService.js` (NEW)

**What to do**:
```javascript
// Create location service module
- Request Location permissions (iOS + Android)
- Handle permission grants/denials
- Check if location services enabled
- Get current user's device location once
- Return location as {lat, lon, accuracy_m}
```

**Dependencies to add to `package.json`**:
```json
"expo-location": "^16.0.0"
```

**Acceptance Criteria**:
- [ ] Can request location permission on app startup
- [ ] Falls back gracefully if user denies
- [ ] Can get current GPS location
- [ ] Handles missing location (simulator/test)

---

#### Task 1.2: Continuous Location Tracking
**Status**: ❌ NOT STARTED  
**Files**: `mobile/src/services/locationService.js`

**What to do**:
```javascript
// Add background location tracking
- watchPosition() for continuous updates every 2 seconds
- Throttle updates (only if moved >5m or 2s elapsed)
- Handle geolocation errors gracefully
- Allow stop/start of tracking
- Export simple API: startTracking(), stopTracking(), getCurrentLocation()
```

**Acceptance Criteria**:
- [ ] Location updates every 2s
- [ ] Continues in background (app suspended)
- [ ] Stops when session ends
- [ ] Handles GPS loss gracefully

---

### Phase 2: WebSocket Real-time Connection (3-4 days)

#### Task 2.1: WebSocket Client Service
**Status**: ❌ NOT STARTED  
**Files**: `mobile/src/services/realtimeService.js` (NEW)

**What to do**:
```javascript
// Create WebSocket connection manager
- Handle connection to ws://api/v1/ws/meetup?token=X&session_id=Y
- Implement reconnection with exponential backoff (3s, 6s, 12s, max 30s)
- Buffer messages while disconnected, send on reconnect
- Handle all event types:
  * presence_update → notify peers online/offline
  * peer_location → update peer marker on map
  * session_ended → trigger cleanup + navigation
  * error → show error message to user
- Emit events for listeners to subscribe to
- Connection state management: connecting/connected/reconnecting/disconnected/error
```

**Dependencies**:
- No new packages needed (native WebSocket)

**Acceptance Criteria**:
- [ ] Connects successfully to backend WS
- [ ] Reconnects on disconnect (with backoff)
- [ ] Handles all 5 event types
- [ ] State updates trigger UI re-renders
- [ ] Shows connection status: "Connected" / "Reconnecting" / "Disconnected"

---

#### Task 2.2: Location Streaming to Peers
**Status**: ❌ NOT STARTED  
**Files**: `mobile/src/services/realtimeService.js`

**What to do**:
```javascript
// Add location broadcasting
- Send location_update event every 2s when connected:
  {
    type: "location_update",
    payload: {lat, lon, accuracy_m, timestamp}
  }
- Throttle sends to prevent rate limiting
- Only send if actually connected
- Stop sending when session ends
```

**Acceptance Criteria**:
- [ ] Sends location every 2s to peers
- [ ] Format matches PROTOCOL.md exactly
- [ ] Respects rate limit (10/sec) without errors
- [ ] Web debugger can receive and display updates

---

### Phase 3: Map UI Integration (3-4 days)

#### Task 3.1: Map Library Setup
**Status**: ❌ NOT STARTED  
**Files**: `mobile/src/screens/ActiveSessionScreen.js` (REPLACE)

**Dependencies to add**:
```json
"react-native-maps": "^1.7.0"
or
"expo-maps": "^0.4.0"
```

**What to do**:
```javascript
// Choose map library (react-native-maps is more mature)
// Option A: Use react-native-maps (proven for location apps)
// Option B: Use expo-maps (Expo-native)
// We recommend: react-native-maps (better docs, more stable)
```

**Acceptance Criteria**:
- [ ] Map renders on ActiveSessionScreen
- [ ] Can zoom/pan map
- [ ] No crashes on startup/rotation

---

#### Task 3.2: Self Marker (Blue)
**Status**: ❌ NOT STARTED  
**Files**: `mobile/src/screens/ActiveSessionScreen.js`

**What to do**:
```javascript
// Render user's own location
- Get location from locationService.getCurrentLocation()
- Place blue marker at user's position
- Show accuracy circle (blue, semi-transparent)
- Center map on user
- Update every 2s as location changes
- Show small badge with user's name
```

**Acceptance Criteria**:
- [ ] Blue marker shows at device GPS location
- [ ] Accuracy circle matches device accuracy
- [ ] Updates smoothly as you move
- [ ] Shows user's own name/avatar

---

#### Task 3.3: Peer Marker (Colored)
**Status**: ❌ NOT STARTED  
**Files**: `mobile/src/screens/ActiveSessionScreen.js`

**What to do**:
```javascript
// Render peer's location
- Listen to websocket peer_location events
- Place colored marker (different color per peer)
- Show peer's name/avatar
- Update position smoothly when location changes
- Show "last seen X seconds ago" if stale (>5s)
```

**Acceptance Criteria**:
- [ ] Peer marker appears on map after connecting
- [ ] Updates position when WS sends peer_location
- [ ] Shows peer's name
- [ ] Can see both markers on same map

---

#### Task 3.4: Connection Status Badge
**Status**: ❌ NOT STARTED  
**Files**: `mobile/src/screens/ActiveSessionScreen.js`

**What to do**:
```javascript
// Show connection status to user
- Badge/indicator at top showing: "Connected" / "Reconnecting..." / "Disconnected"
- Green dot when connected
- Orange dot when reconnecting
- Red dot when disconnected (with retry button)
- Auto-show error if can't reconnect after 30s
```

**Acceptance Criteria**:
- [ ] Status updates in real-time
- [ ] Clear visual indication of connection state
- [ ] Retry button works
- [ ] Toast/alert shows if session lost

---

### Phase 4: Session End & Cleanup (1-2 days)

#### Task 4.1: End Session on Button Press
**Status**: ⚠️ PARTIAL (UI exists, no backend call)  
**Files**: `mobile/src/screens/ActiveSessionScreen.js`

**What to do**:
```javascript
// Replace placeholder button action with real implementation
- Send end_session event via WebSocket:
  {
    type: "end_session",
    payload: {reason: "USER_ACTION"}
  }
- Call POST /sessions/{sessionId}/end
- Wait for session_ended event from server
- Clean up: stop location tracking, close WebSocket
- Navigate back to Home
- Show success toast
```

**Acceptance Criteria**:
- [ ] Sends end_session WS event
- [ ] Calls backend /sessions/{id}/end
- [ ] Stops tracking location
- [ ] Peers see session_ended event
- [ ] Returns to home screen

---

#### Task 4.2: Handle Session Ended Event
**Status**: ❌ NOT STARTED  
**Files**: `mobile/src/screens/ActiveSessionScreen.js`

**What to do**:
```javascript
// Listen for server-sent session_ended
- When server sends session_ended event
- Stop location tracking
- Close WebSocket gracefully
- Show "Session ended: PROXIMITY_REACHED" or reason
- Auto-navigate to Home after 2s
```

**Acceptance Criteria**:
- [ ] Receives session_ended event
- [ ] Shows reason to user
- [ ] Cleans up resources
- [ ] Returns to home

---

### Phase 5: Error Handling & Polish (2 days)

#### Task 5.1: Network Error Handling
**Status**: ❌ NOT STARTED  
**Files**: `mobile/src/screens/ActiveSessionScreen.js`

**What to do**:
```javascript
// Handle network failures gracefully
- No internet → Show offline banner, attempt reconnect
- WS closes → Reconnect with backoff
- Rate limited → Show "Too many updates" message
- Invalid location → Warn user ("turn on GPS")
- Session not found → "Session ended by peer"
```

**Acceptance Criteria**:
- [ ] No crashes on network loss
- [ ] User informed of issues
- [ ] Auto-reconnect attempts visible
- [ ] Can manually retry

---

#### Task 5.2: Permission Handling
**Status**: ❌ NOT STARTED  
**Files**: `mobile/src/screens/ActiveSessionScreen.js`

**What to do**:
```javascript
// Handle location permission edge cases
- User never granted location → Show permission request on screen
- User revoked permissions → Show "Grant location permission" button
- Simulator/emulator (no GPS) → Use mock location or handle gracefully
- User disables location services → Warn at top of screen
```

**Acceptance Criteria**:
- [ ] Works if permission granted
- [ ] Shows helpful message if not granted
- [ ] Can request permission from screen
- [ ] Handles iOS privacy prompts

---

## 📋 Implementation Order (Recommended)

### Week 1 (Mobile Phase 1-2)
1. **Task 1.1** - Location permissions (2 days)
2. **Task 1.2** - Continuous tracking (1 day)
3. **Task 2.1** - WebSocket client (2 days)
4. **Task 2.2** - Location streaming (1 day)

### Week 2 (Mobile Phase 3-4)
5. **Task 3.1** - Map library setup (1 day)
6. **Task 3.2** - Self marker (1.5 days)
7. **Task 3.3** - Peer marker (1.5 days)
8. **Task 3.4** - Connection status (1 day)
9. **Task 4.1** - End session (1 day)
10. **Task 4.2** - Handle session_ended (0.5 day)

### Week 3 (Polish + QA)
11. **Task 5.1** - Error handling (1 day)
12. **Task 5.2** - Permission handling (1 day)
13. Testing & bug fixes (3 days)

---

## 🎯 Acceptance Criteria Summary

### End Goal: Full Mobile Feature Parity with Web
- [ ] User can log in
- [ ] Can see friend list
- [ ] Can send meet request
- [ ] Can accept incoming request
- [ ] Session starts with map visible
- [ ] Self location (blue marker) shows on map
- [ ] Peer location (colored marker) updates in real-time
- [ ] Connection status ("Connected" / "Reconnecting" / etc) displays
- [ ] Can see peer moving on map as they move
- [ ] Can end session (button + server notification)
- [ ] Handles GPS permission requests
- [ ] Reconnects on network interruption
- [ ] Shows helpful errors
- [ ] Smooth animations/transitions

---

## 🛠️ Dependencies Summary

### New NPM Packages to Install

```bash
cd mobile
npm install expo-location react-native-maps
```

### Backend Endpoints Already Implemented

✅ `POST /api/v1/requests/` - Send request  
✅ `POST /api/v1/requests/{id}/accept` - Accept request  
✅ `POST /api/v1/sessions/from-request/{id}` - Create session  
✅ `GET /api/v1/sessions/active` - Get active session  
✅ `POST /api/v1/sessions/{id}/end` - End session  
✅ `WS /api/v1/ws/meetup` - Real-time location streaming  

### Backend Protocol Already Implemented

✅ Connection with JWT + session_id  
✅ location_update sending  
✅ peer_location receiving  
✅ presence_update (online/offline)  
✅ session_ended event  
✅ error event  
✅ Rate limiting (10/sec)  

---

## 📚 Reference Documents

- **PROTOCOL.md** - WebSocket event schemas (all events documented)
- **PARTNER_HANDOFF.md** - Week 2 backend handoff (still relevant)
- **WEEK2_STATUS.md** - Detailed backend completion status
- **WEEK3_TESTING_REPORT.md** - Scale proof implementation
- **web/client.html** - Reference implementation (JavaScript, use as guide)

---

## 🧪 Testing Strategy

### Local Testing (Before Deployment)

1. **Seed test data**:
   ```bash
   docker-compose exec backend python seed.py
   # Get: SESSION_ID, TOKEN_ALICE, TOKEN_BOB
   ```

2. **Test with web client first**:
   ```
   Open web/client.html in two browser tabs
   Paste SESSION_ID and tokens
   Verify location updates work
   This validates backend is working
   ```

3. **Test mobile individually**:
   ```bash
   npm start  # In mobile/
   # Grant location permission
   # Login with test credentials
   # Send request to self or hardcode test
   # Accept to start session
   # Watch map update with mock location data
   ```

4. **Test both together**:
   ```
   Web client tab 1 (Alice)
   Mobile app (Bob)
   Both connect to same session
   Send locations from both
   Verify cross-platform sync
   ```

---

## 📊 File Structure After Implementation

```
mobile/
├── src/
│   ├── services/                  # NEW
│   │   ├── locationService.js     # NEW - GPS handling
│   │   └── realtimeService.js     # NEW - WebSocket client
│   ├── screens/
│   │   └── ActiveSessionScreen.js # REWRITE - Add map + realtime
│   ├── api/
│   │   ├── client.js              # EXISTING - HTTP requests
│   │   └── supabase.js            # EXISTING - Auth
│   ├── context/
│   │   └── AuthContext.js         # EXISTING - Keep as is
│   └── navigation/
│       └── AppNavigator.js        # EXISTING - Keep as is
├── app.json                       # DONE - Logo updated
├── package.json                   # UPDATE - Add expo-location, react-native-maps
└── README.md                      # UPDATE - Add testing instructions
```

---

## 🚀 Quick Start Checklist

- [ ] Read PROTOCOL.md to understand WebSocket events
- [ ] Look at web/client.html to see reference implementation
- [ ] Install location + maps packages
- [ ] Start Phase 1: Location services
- [ ] Test with web client in parallel
- [ ] Proceed to Phase 2: WebSocket
- [ ] Build map UI in Phase 3
- [ ] Final polish in Phase 5

---

## 💡 Pro Tips

1. **Use web/client.html as reference** - It's a working implementation in JavaScript, shows exactly what the mobile app needs to do
2. **Test location with MockLocation/EmuGPS** - Simulators can't get real GPS, use mock location tools
3. **Start simple** - Get basic WS connection working before adding map
4. **Test with two devices** - One web (easy to debug), one mobile (real GPS)
5. **Commit frequently** - Each task should be a separate git commit
6. **Use git branches** - `feat/mobile-location`, `feat/mobile-websocket`, etc.

---

## 📞 Questions to Answer Before Starting

1. Which map library? → **Recommend: react-native-maps** (more mature, better docs)
2. Mock location in dev? → **Yes**, use Expo DevTools or simulator location spoofing
3. How to store currentUser + sessions? → **Use React Context** (already set up for auth)
4. Handle background tracking? → **Use expo-task-manager** (optional for Week 2, required for Week 3)
5. Test on physical device? → **Yes, eventually** (iOS TestFlight or Android APK)

