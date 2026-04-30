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

## Phone OTP Threat Model (Beta)
- Phone number in E.164 is mandatory identity; session tokens are only issued after OTP verification.
- OTP codes are never logged. Phone numbers are scrubbed/masked in logs.
- OTP endpoints are rate-limited per phone hash and per IP, and fail-closed if Redis is unavailable.
- OTP state is stored in Redis with TTL (`otp:{phone_hash}`), as a hash of `(phone_hash + otp_code)`.

### SIM Swap Note
- SMS OTP has SIM-swap risk. For beta, mitigation is operational:
- Encourage users to add optional recovery email.
- Monitor anomalous OTP bursts by aggregate metrics.
- For production hardening, add step-up verification and carrier/SIM-change signals where available.

## Contacts Matching Privacy Model
- Raw contacts are never uploaded to the backend.
- Client computes `phone_digest = SHA256("v{version}:" + phone_e164)` and sends only digests.
- Server stores both:
- `phone_hash = HMAC_SHA256(server_pepper, phone_e164)` for server-side protected identity mapping.
- `phone_digest = SHA256("v{version}:" + phone_e164)` for beta contacts matching compatibility.
- `/contacts/match` requires authentication, has digest count caps, and is rate-limited to reduce enumeration risk.

### Tradeoff (Documented)
- The client-side SHA256 digest approach is weaker than peppered HMAC matching because the client cannot safely hold server pepper.
- This beta design reduces direct raw-contact leakage but is not equivalent to blind/private set intersection.
- Production upgrade path: privacy-preserving PSI or server-assisted blinded matching.
