#!/bin/bash
# Setup pre-commit hooks for MeetUp project

set -e

echo "🔧 Setting up pre-commit hooks..."

# Check if pre-commit is installed
if ! command -v pre-commit &> /dev/null; then
    echo "📦 Installing pre-commit..."
    pip install pre-commit
fi

# Install the git hook scripts
echo "🪝 Installing git hooks..."
pre-commit install

# Run against all files (optional first-time check)
echo "🧪 Running pre-commit against all files (this may take a moment)..."
pre-commit run --all-files || echo "⚠️  Some checks failed - fix and commit again"

echo ""
echo "✅ Pre-commit hooks installed successfully!"
echo ""
echo "ℹ️  From now on, these checks will run automatically before each commit."
echo "ℹ️  To run manually: pre-commit run --all-files"
echo "ℹ️  To skip checks (not recommended): git commit --no-verify"
