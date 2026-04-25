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

### Production Build
**MUST** include the production API URL.
```bash
EXPO_PUBLIC_API_BASE_URL=https://api.meetup.example.com/api/v1 eas build --profile production
```
