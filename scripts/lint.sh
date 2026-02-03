#!/bin/bash
echo "🧹 Running Ruff (Linting & Formatting)..."
docker-compose exec backend ruff check .
docker-compose exec backend ruff format --check .
