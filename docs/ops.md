# Operations Guide

## Runtime Architecture

### Process Model
In production, MeetUp runs using **Gunicorn** with **Uvicorn workers**.
- **Server:** Gunicorn
- **Worker Class:** `uvicorn.workers.UvicornWorker`
- **Recommended Command:**
  ```bash
  gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:8000
  ```
- **Rationale:** Gunicorn provides process management (restarting crashed workers), while Uvicorn handles the ASGI/WebSocket protocol.

### WebSocket Persistence
- **Important:** If using multiple workers, ensure your load balancer supports **sticky sessions** (source-IP based affinity) if you plan to scale horizontally without a Redis-backed Pub/Sub for all messages.
- **Current State:** The system uses Redis for presence and rate limiting, but broadcast remains local to the worker process. Sticky sessions are required for multi-node deployments.

## Logging & Redaction Policy

### Structured Logging
MeetUp uses JSON-formatted structured logging in production to facilitate ingestion into ELK/Datadog/CloudWatch.
- **Redaction:** The `app.core.scrub.scrub_sensitive` helper is used to redact:
  - JWT tokens
  - Invite tokens
  - Latitude/Longitude coordinates (if found in sensitive contexts)
- **Policy:** NEVER log request bodies for `POST /api/v1/invites` or `POST /api/v1/sessions/from-request` at INFO level.

## Database Migrations

### Runbook
1. **Pre-deployment:** Run `alembic upgrade head` BEFORE starting the new app version.
2. **Failure:** If a migration fails, the deployment MUST be halted.
3. **Rollback:** MeetUp follows a "migrate-forward" policy. Downgrades are not tested for every release. In case of failure, restore the database from the pre-deployment snapshot.

## Observability

### Metrics
- **Prometheus Scrape Point:** `GET /api/v1/metrics?format=prometheus`
- **Check visibility:** `curl -s "http://localhost:8000/api/v1/metrics?format=prometheus"`
- **Cardinality:** The system uses stable metric names (e.g., `integration_test_hits_total`). No UUIDs or session IDs are allowed as part of the metric name or labels.
