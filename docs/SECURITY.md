# MeetUp Security Documentation

## Beta Security Pass Criteria
To be eligible for a Beta release, the project must satisfy:
1.  **Authorization**: All non-public endpoints MUST enforce ownership/participation checks.
2.  **Rate Limiting**: High-frequency endpoints (invites, requests) MUST have server-side limits.
3.  **Logging**: Precision coordinates (lat/lon) and credentials MUST NOT leak into logs.
4.  **Static Analysis**: No `HIGH` or `CRITICAL` vulnerabilities in direct dependencies.

## Scanning Commands

### Backend Static Analysis (SCA & SAST)

#### Dependency Audit (`pip-audit`)
Checks for known vulnerabilities in Python packages.
```bash
# Run in backend directory
pip-audit
```

#### Security Linting (`bandit`)
Common security issues in Python code.
```bash
# Run in backend directory
bandit -r app/
```

### Frontend Security Audit

#### NPM Audit
Checks for known vulnerabilities in JavaScript dependencies.
```bash
# Run in mobile directory
npm audit
```

### Infrastructure / Container Scanning

#### Trivy
Scans Docker images for OS and package vulnerabilities.
```bash
# Scan backend image
trivy image meetup-backend
```

## Security Best Practices
- **CORS**: Always restrict to known origins in production.
- **Secrets Management**: Use hardware security modules or dedicated secret managers; never commit `.env` files.
- **Logging Scrubber**: All logging must pass through the `app.core.scrub.scrub_sensitive` helper.
- **Fail-Closed Rate Limiting**: If the Redis rate limiter is unavailable, the system defaults to a "deny" state (Fail-Closed). REST requests will return 429 and realtime updates will be rejected. This prevents security bypasses during infrastructure service interruptions.
- **Abuse Controls**: Users can block others via `POST /api/v1/blocks`. All request/session creation and WebSocket connections are blocked if a block relationship exists. Active sessions can be terminated instantly via `POST /api/v1/sessions/{id}/force_end`.
