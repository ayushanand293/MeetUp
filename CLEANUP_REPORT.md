# Repository Cleanup Report

Date: 2026-05-23
Branch: `chore/repo-cleanup`
Base: `develop`

## Scope

This cleanup keeps product behavior unchanged. The work focused on removing stale artifacts, consolidating interviewer-facing docs, tightening ignore/config files, and verifying that backend, smoke, mobile, and web checks still pass.

## Snapshot

Initial branch: `develop`
Initial HEAD: `8b07005 Merge feature/frontend_v1 into develop`

Initial tracked inventory:

| Area | Files |
| --- | ---: |
| `backend/` | 89 |
| `mobile/` | 47 |
| `docs/` | 31 |
| `scripts/` | 4 |
| `.github/` | 1 |
| Other | 33 |
| Total | 205 |

Post-cleanup tracked inventory before commit:

| Area | Files |
| --- | ---: |
| `backend/` | 86 |
| `mobile/` | 47 |
| `docs/` | 38 |
| `scripts/` | 3 |
| `.github/` | 1 |
| Other | 23 |
| Total | 198 |

Largest tracked files remain expected project assets and lockfiles. The largest are `mobile/package-lock.json` (452K), `mobile/assets/meetup-illustration.png` (340K), `web/package-lock.json` (160K), and `mobile/assets/Meet up logo.png` (148K).

## Removed

### Stale validation and demo scripts

- `quick_validation_test.py`: removed hardcoded-token validation script that was not referenced by README, docs, scripts, or CI.
- `test_week3.py`: removed stale week-specific test harness with hardcoded JWTs; current backend tests cover active behavior.
- `scripts/demo_week1.sh`: removed old week-1 demo script that was superseded by `scripts/beta_smoke.sh`.
- `backend/scripts/proof_metrics.py`: removed old proof script not referenced by CI, docs, or smoke flows.
- `backend/scripts/test_ws.py`: removed stale websocket helper with dummy invalid token usage.

### Unneeded lockfiles

- `package-lock.json`: removed empty root lockfile because there is no root `package.json`.
- `backend/package-lock.json`: removed empty backend lockfile because the backend is Python-only.

### Local generated junk

Removed untracked local-only artifacts from the working tree and added ignore coverage so they do not reappear:

- `.DS_Store`
- `mobile/.expo/`
- `mobile/node_modules/`
- `web/node_modules/`
- `web/dist/`
- `backend/.pytest_cache/`
- `backend/.ruff_cache/`
- Python `__pycache__/` and `*.pyc`

## Archived

The following duplicate or historical docs were moved under `docs/archive/` and prefixed with an `ARCHIVED - 2026-05-23` header:

- `APP_FLOW.md`
- `ARCHITECTURE.md`
- `FRONTEND_PROGRESS_README.md`
- `HANDOFF_PACK.md`
- `PRIVACY.md`
- `PROTOCOL.md`
- `QUICK_START.md`
- `docs/ops.md`
- `docs/ui_handoff_meet_at_place.md`
- `docs/release/BETA_RELEASE_NOTES.md`
- `docs/release/GO_NO_GO_REPORT.md`

Current docs now center on:

- `README.md`
- `docs/INTERVIEWER_QUICKSTART.md`
- `docs/ops_predeploy.md`
- `docs/demo_script.md`
- `docs/interview_story.md`
- `docs/SECURITY.md`
- `docs/security_scan_results.md`
- `docs/config.md`

## Updated

- `README.md`: replaced stale long-form content with a concise interviewer-friendly overview, feature list, architecture diagram, local run command, demo mode, security/privacy posture, tests, and CI notes.
- `docs/INTERVIEWER_QUICKSTART.md`: added a 5-10 minute local run and two-device demo guide.
- `.gitignore`: expanded Python, Node, Expo, macOS, editor, build, cache, coverage, log, and temp ignore patterns.
- `.editorconfig`: added standard LF, final newline, indentation, and whitespace rules.
- `.env.example`, `mobile/.env.example`, `web/.env.example`: kept placeholders only and aligned mobile env names with the code.
- `docs/config.md`: aligned mobile env names with `mobile/src/api/client.js` and `mobile/src/config.js`; clarified that `ws_connections_active` and `sessions_active` are active-count entries in the counters map, not Prometheus gauges.
- `backend/seed.py`: kept the script because the web app references it, but updated seeded users to the phone-first schema.
- `backend/scripts/check_env.sh`: aligned required backend env checks with current config requirements.
- `web/package.json`: changed lint from mutating `eslint --fix` to read-only `eslint`.

## Behavior Changes

None intended. Product paths, API contracts, websocket behavior, session behavior, auth flow, and mobile navigation were not changed. The only code edits were maintenance-oriented:

- `backend/seed.py` now creates demo users with required phone-first fields.
- `backend/scripts/check_env.sh` now checks the current required deployment variables.
- `web/package.json` lint no longer mutates source files during CI.

## Verified Unused Before Removal

Before deleting tracked files, references were checked with `rg` across README, docs, scripts, CI, backend, mobile, and web code. A final reference check for removed filenames and stale env names returned no matches outside `docs/archive/`.

## Kept For Later

These items looked like possible cleanup candidates but were kept because they may still be useful or are still referenced:

- `backend/seed.py`: referenced by the web debug flow.
- `backend/scripts/simulate_movement.py`: useful manual/demo utility.
- `backend/scripts/run_session_cleanup.py`: operational utility.
- `test_otp_flow.sh`: manual OTP dev flow helper.
- `mobile/src/api/supabase.js` and related Supabase auth compatibility code: still imported by the mobile auth context.
- `web/`: still built by CI and useful as a debug/demo surface.

## Verification

### Docker Compose

Command:

```bash
docker compose up -d --build
```

Summary:

```text
Image meetup-backend Built
Container meetup-db-1 Running
Container meetup-redis-1 Running
Container meetup-backend-1 Recreated
Container meetup-db-1 Healthy
Container meetup-redis-1 Healthy
Container meetup-backend-1 Started
```

### Migrations

Command:

```bash
docker compose exec -T backend alembic upgrade head
```

Summary:

```text
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
```

### Backend Tests

Command:

```bash
docker compose exec -T backend pytest -q
```

Summary:

```text
.................................................................        [100%]
65 passed in 3.89s
```

### Smoke Test

Command:

```bash
./scripts/beta_smoke.sh
```

Summary:

```text
Service is up.
Seeding Database...
Invite created with token: cUAnowa6N_L2fsPtcgPpjPa0yp3CuU6S
Invite resolved.
Realtime tests executed.
Smoke test suite completed successfully!
```

### Mobile Sanity

Commands:

```bash
cd mobile
npm ci
npm run lint
npx expo config --type public
```

Summary:

```text
added 936 packages in 7s
✖ 495 problems (0 errors, 495 warnings)
scheme: meetup
```

The mobile lint warnings are existing warning-level findings, primarily inline styles and hook dependency warnings. There were no lint errors.

### Web CI Path

Commands:

```bash
cd web
npm ci
npm run lint
npm run build
```

Summary:

```text
added 296 packages in 2s
eslint src --ext jsx
✓ 87 modules transformed.
✓ built in 1.00s
```
