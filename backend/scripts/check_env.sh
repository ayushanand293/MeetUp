#!/bin/bash
# scripts/check_env.sh - Validate that required environment variables are set.

set -e

REQUIRED_VARS=(
    "DATABASE_URL"
    "REDIS_URL"
    "SUPABASE_URL"
    "SUPABASE_KEY"
)

MISSING=0

echo "--- Validating Environment Variables ---"
for VAR in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!VAR}" ]; then
        echo "FAIL: $VAR is not set."
        MISSING=$((MISSING + 1))
    else
        # Mask secrets in output
        if [[ "$VAR" == *"KEY"* || "$VAR" == *"URL"* ]]; then
             echo "PASS: $VAR is set [HIDDEN]"
        else
             echo "PASS: $VAR is set to ${!VAR}"
        fi
    fi
done

if [ $MISSING -gt 0 ]; then
    echo "Summary: $MISSING required variable(s) missing."
    exit 1
fi

echo "All required environment variables are present."
exit 0
