#!/bin/bash
set -e

echo "🧹 Linting Backend (Python/Ruff)..."
docker-compose exec backend ruff check .
docker-compose exec backend ruff format --check .

echo ""
echo "🧹 Linting Mobile (JavaScript/ESLint)..."
cd mobile
if [ -d "node_modules" ]; then
  npm run lint
else
  echo "⚠️  Skipping mobile lint (node_modules not found - run 'npm install' in mobile/)"
fi
cd ..

echo ""
echo "✅ All linting checks passed!"
