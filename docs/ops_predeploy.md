# Pre-Deployment Readiness Guide

## Environment Variable Contract

| Variable | Dev Default | Prod Status | Description |
|----------|-------------|-------------|-------------|
| `DATABASE_URL` | N/A | **Required** | Postgres connection string |
| `REDIS_URL` | N/A | **Required** | Redis connection string |
| `ENVIRONMENT` | `development` | `production` | Switches CORS and Logging levels |
| `METRICS_BACKEND` | `redis` | `redis` | Storage for cross-process metrics |
| `CORS_ORIGINS` | `[]` | **Recommended** | List of allowed origins |
| `SUPABASE_URL` | N/A | **Required** | For JWT validation |
| `SUPABASE_KEY` | N/A | **Required** | For JWT validation (local) |

## Pre-Deployment Verification Runbook

Run the following command in the root directory:
```bash
docker compose exec -T backend ./scripts/predeploy_checklist.sh
```

## Migration Readiness
To verify migration state from a clean state:
1. `docker compose down -v`
2. `docker compose up -d db redis`
3. `docker compose exec backend alembic upgrade head`
4. Confirm tables exist:
   ```bash
   docker compose exec db psql -U postgres -d meetup -c "\dt"
   ```
