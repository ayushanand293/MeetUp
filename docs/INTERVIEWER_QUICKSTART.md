# Interviewer Quickstart

If you have 2 minutes: watch the demo video: [demo_video.md](demo_video.md).

If you want to verify locally (10 minutes): run quickcheck.

## Local Verification

1. Clone and choose a stable revision:

   ```bash
   git clone https://github.com/ayushanand293/MeetUp.git
   cd MeetUp
   git checkout interview-ready-v1
   ```

   If the tag is not available yet, use `git checkout main`.

2. Start the stack:

   ```bash
   docker compose up -d --build
   ```

3. Run the single verification gate:

   ```bash
   ./scripts/interviewer_quickcheck.sh
   ```

   Expected result: migrations complete, backend tests pass, and the smoke flow ends with `Smoke test suite completed successfully!`.

4. Optional mobile launch:

   ```bash
   cd mobile
   npm install
   EXPO_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1 npm run start
   ```

   Simulators are recommended for interview review. For a physical device, use your machine's LAN IP instead of `localhost`.

OTP SMS provider is stubbed; local demo uses the documented demo path through quickcheck and smoke.

ORS routing is optional; if `EXPO_PUBLIC_ORS_KEY` is not set, the app still works and shows destination + distance/open-in-maps instead of in-app routing.

Full two-device walkthrough: [demo_script.md](demo_script.md)
