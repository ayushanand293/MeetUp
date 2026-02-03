#!/bin/bash
set -e

echo "🐳 Starting MeetUp Environment..."
docker-compose up -d --build db redis backend

echo "⏳ Waiting for DB to be ready..."
sleep 10

echo "🔄 Running Migrations..."
# Note: In first run, we need to generate the migration file
# We check if versions dir is empty
if [ -z "$(ls -A backend/alembic/versions)" ]; then
   echo "   Generating initial migration..."
   docker-compose exec backend alembic revision --autogenerate -m "Initial tables"
fi

echo "   Applying migrations..."
docker-compose exec backend alembic upgrade head

echo "🧪 Running Week 1 Verification (Unit/Integration Tests)..."
docker-compose exec backend bash -c "export PYTHONPATH=. && pytest tests/test_flow.py"

echo "✅ Demo Complete! API is running at http://localhost:8000 (Production Mode with Gunicorn)"
