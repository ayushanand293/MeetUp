# Contributing

Thanks for helping keep MeetUp easy to run and review. Keep changes small, testable, and aligned with the current phone-first, contacts-first 1:1 session flow.

## Backend

Start the local stack:

```bash
docker compose up -d --build
docker compose exec -T backend alembic upgrade head
```

Run backend tests:

```bash
docker compose exec -T backend pytest -q
```

Run the smoke flow:

```bash
./scripts/beta_smoke.sh
```

## Mobile

Install dependencies and start Expo:

```bash
cd mobile
npm install
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1 npm run start
```

For a physical device, replace `localhost` with your machine's LAN IP.

Run lint:

```bash
cd mobile
npm run lint
```

Mobile lint currently has warning-level findings; do not mix broad warning cleanup into product changes.

## Pull Requests

- Include the commands you ran.
- Keep docs updated when env vars, scripts, endpoints, or demo flows change.
- Avoid committing secrets, real phone numbers, precise personal locations, or private contact data.
