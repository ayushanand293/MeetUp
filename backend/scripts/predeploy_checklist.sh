#!/bin/bash
# scripts/predeploy_checklist.sh - Final automated gate before deployment.

set -e

echo "--- START PRE-DEPLOY AUTOMATED CHECKS ---"

# 1. Environment Validation
echo "[Phase 1] Environment Validation"
./scripts/check_env.sh

# 2. Unit & Integration Tests
echo "[Phase 2] Running Tests"
pytest -q tests/test_metrics_store.py tests/test_metrics_cross_process.py 
pytest -q tests/test_authorization.py
pytest -q tests/test_rate_limits.py

# 3. Realtime Stability (5x)
echo "[Phase 3] Realtime Stability Gate (5x)"
ITERATIONS=5
SUCCESS_COUNT=0
for i in $(seq 1 $ITERATIONS); do
    if pytest -q tests/test_flow.py; then
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    fi
done

if [ $SUCCESS_COUNT -lt $ITERATIONS ]; then
    echo "FAIL: Realtime stability gate fell below 100% ($SUCCESS_COUNT/$ITERATIONS)"
    exit 1
fi
echo "PASS: Realtime stability gate 100%"

# 4. Security Scan (pip-audit)
echo "[Phase 4] Dependency Security Scan"
if command -v pip-audit > /dev/null; then
    # We allow low/medium but fail on HIGH or CRITICAL if the tool supports it.
    # For now, we just ensure it runs and we check output.
    pip-audit --desc on
else
    echo "SKIP: pip-audit not installed. Install with 'pip install pip-audit'."
fi

echo "--- ALL PRE-DEPLOY CHECKS PASSED ---"
exit 0
