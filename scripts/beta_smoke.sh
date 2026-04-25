#!/bin/bash
set -e

echo "Starting smoke test suite..."

# Ensure we're in the right directory
cd "$(dirname "$0")/.."

# Export paths and bring up tests
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

echo "Bringing up services..."
docker compose up -d
sleep 3 # Give services time to heat up

echo "1. Testing Service Root..."
curl -s -f http://localhost:8000/docs >/dev/null || { echo "Service unresponsive"; exit 1; }
echo "Service is up."

echo "Seeding Database..."
docker compose exec -T db psql -U user -d meetup -c "
INSERT INTO users (id, email, created_at) VALUES ('11111111-1111-1111-1111-111111111111', 'alice@test.com', NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO users (id, email, created_at) VALUES ('22222222-2222-2222-2222-222222222222', 'bob@test.com', NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO meet_requests (id, requester_id, receiver_id, status) VALUES ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'PENDING') ON CONFLICT (id) DO NOTHING;
INSERT INTO sessions (id, status) VALUES ('00000000-0000-0000-0000-000000000000', 'ACTIVE') ON CONFLICT (id) DO NOTHING;
" >/dev/null

echo "2. Testing Invite Creation..."
TEST_TOKEN=$(docker compose exec -T backend python -c "
import jwt, time, os
key = os.environ.get('SUPABASE_KEY', 'EMndEoT3polFfujnlRMeEXqqMs+K35zYjOPHi5XJ5vHD08vrMNKEolC6qJiqyXGRVzAfyGErgVvua+SN/0IQ+g==')
print(jwt.encode({'sub': '11111111-1111-1111-1111-111111111111', 'exp': int(time.time())+3600}, key, algorithm='HS256'))
")
# Strip any carriage returns or whitespace
TEST_TOKEN=$(echo "$TEST_TOKEN" | tr -d '\r\n')

INVITE_RESP=$(curl -s -X POST http://localhost:8000/api/v1/invites \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -d '{"recipient": "sms:+15551234567", "request_id": "00000000-0000-0000-0000-000000000000"}')

TOKEN=$(echo $INVITE_RESP | grep -o '\"token\":\"[^\"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "Invite creation failed."
    echo "Reason: $INVITE_RESP"
    exit 1
fi
echo "Invite created with token: $TOKEN"

echo "3. Resolving Invite..."
curl -s -f http://localhost:8000/api/v1/invites/$TOKEN >/dev/null || { echo "Invite resolution failed"; exit 1; }
echo "Invite resolved."

echo "4. Populating Realtime Metrics..."
docker compose exec -T backend pytest -q tests/test_realtime.py >/dev/null || { echo "Realtime tests failed to populate metrics"; exit 1; }
echo "Realtime tests executed."

echo "Smoke test suite completed successfully! 🎉"
exit 0
