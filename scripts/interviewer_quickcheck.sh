#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Building and starting local services"
docker compose up -d --build

echo "==> Applying migrations"
docker compose exec -T backend alembic upgrade head

echo "==> Running backend tests"
docker compose exec -T backend pytest -q

echo "==> Running smoke script"
./scripts/beta_smoke.sh

cat <<'EOF'

Interviewer docs:
- docs/INTERVIEWER_QUICKSTART.md
- docs/demo_script.md
- docs/interview_story.md

Health checks:
curl -fsS http://localhost:8000/health
curl -fsS http://localhost:8000/ready
curl -fsS "http://localhost:8000/api/v1/metrics?format=prometheus"
EOF
