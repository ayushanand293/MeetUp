# MeetUp Web App - Week 4 Fallback

Real-time location sharing web fallback using snapshot polling.

## Features

- ✅ Supabase Auth (email/password login)
- ✅ Live map with Leaflet.js
- ✅ Snapshot polling every 2 seconds (fallback for WebSocket)
- ✅ Real-time peer location updates with accuracy circles
- ✅ Pause/Resume polling
- ✅ End session functionality
- ✅ Last-seen timestamp for peer locations
- ✅ Responsive design (mobile + desktop)

## Setup

### 1. Install dependencies

```bash
cd web
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

The default values point to localhost backend and shared Supabase project.

### 3. Start development server

```bash
npm run dev
```

App opens at `http://localhost:5173`

## Usage

1. **Login**: Sign in with Supabase credentials
2. **Enter Session ID**: Paste the session UUID from your mobile app
3. **View Map**: See live locations of all session participants
4. **Controls**:
   - ⏸ Pause: Stop polling (useful to freeze view)
   - ⏹ End Session: Terminate the session
   - Logout: Sign out and return to login

## Architecture

```
src/
├── components/
│   ├── LoginScreen.jsx     # Supabase auth UI
│   └── SessionMap.jsx      # Map view + polling
├── services/
│   ├── supabaseClient.js   # Auth functions
│   └── snapshotService.js  # API calls + polling
├── styles/
│   └── App.css             # Responsive styling
├── App.jsx                 # Main app logic
└── main.jsx                # React entry point
```

### Snapshot Polling Flow

```
App starts → Login successful → Enter session_id
  ↓
Initial fetch: GET /api/v1/sessions/{id}/snapshot
  ↓
Poll every 2 seconds: Update map markers + timestamps
  ↓
User can: Pause polling, Resume polling, End session, Logout
```

## API Endpoints Used

- `POST /api/v1/auth/login` - Supabase (via SDK)
- `GET /api/v1/sessions/{session_id}/snapshot` - Fetch latest locations
- `PUT /api/v1/sessions/{session_id}/end` - End session

## Deployment

### Build for production

```bash
npm run build
```

Output: `dist/` folder with static files

### Deploy to Vercel (recommended)

```bash
vercel --prod
```

### Deploy to Netlify

```bash
npm run build
netlify deploy --prod --dir=dist
```

## Testing Locally

1. **Terminal 1**: Start backend
   ```bash
   docker-compose up -d
   ```

2. **Terminal 2**: Start web app
   ```bash
   cd web && npm run dev
   ```

3. **Terminal 3**: Start mobile app or use test WebSocket client
   ```bash
   # Create a session via API
   curl -X POST http://localhost:8000/api/v1/sessions \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"destination_lat": 28.5355, "destination_lng": 77.0892, "mode": "WALK"}'
   ```

4. Open browser: `http://localhost:5173`
   - Login with test credentials
   - Paste the session UUID
   - See live locations!

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Cannot find module" | Run `npm install` again |
| CORS errors | Check backend CORS config (.env CORS_ORIGINS) |
| Map doesn't load | Ensure Leaflet CSS is loaded in index.html |
| No locations showing | Check if mobile app is sending updates |
| "Not a participant" error | Ensure you're logged in as same user who created session |

## Performance Notes

- Polling interval: 2 seconds (configurable in snapshotService.js)
- Markers + circles render instantly (L.circleMarker)
- Map auto-zooms to show all participants
- Stale locations (expired > 120s) show as null
- Battery usage: Moderate (HTTP polling every 2s)

## Browser Support

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- Mobile browsers: ✅ Full support

## Future Improvements

- [ ] WebSocket fallback (primary WS, fallback to polling)
- [ ] Marker clustering for >10 users
- [ ] Session history replay
- [ ] Distance calculation display
- [ ] Offline mode with service worker
