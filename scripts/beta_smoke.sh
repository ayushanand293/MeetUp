#!/bin/bash
set -e

echo "Starting smoke test suite..."

# Ensure we're in the right directory
cd "$(dirname "$0")/.."

# Export paths and bring up tests
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
export AUTH_JWT_SECRET="${AUTH_JWT_SECRET:-smoke-test-secret-at-least-32-bytes}"

echo "Bringing up services..."
docker compose up -d
sleep 3 # Give services time to heat up

echo "1. Testing Service Root..."
curl -s -f http://localhost:8000/docs >/dev/null || { echo "Service unresponsive"; exit 1; }
echo "Service is up."

echo "Seeding Database..."
docker compose exec -T db psql -U user -d meetup -c "
INSERT INTO users (
  id,
  phone_e164,
  phone_verified_at,
  phone_hash,
  phone_digest,
  email,
  display_name,
  created_at
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  '+15550000001',
  NOW(),
  'acdf160f9a0c6aedb873f32798ff4fa4345ab87aab18c98a07cab72a28a78cac',
  '2dfac3bbe1c4b4b5f75c42cfe3c9d275fc8bbc8da33305c69ecb76c8d0568b2b',
  'alice@test.com',
  'Alice Smoke',
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  phone_e164 = EXCLUDED.phone_e164,
  phone_verified_at = EXCLUDED.phone_verified_at,
  phone_hash = EXCLUDED.phone_hash,
  phone_digest = EXCLUDED.phone_digest,
  email = EXCLUDED.email,
  display_name = EXCLUDED.display_name;
INSERT INTO users (
  id,
  phone_e164,
  phone_verified_at,
  phone_hash,
  phone_digest,
  email,
  display_name,
  created_at
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  '+15550000002',
  NOW(),
  '2a0260dfa77f3eb557f3de169d79295fff1d8c5a637f0e7de20e05b8fc2b8297',
  '908ca696ca50e22115cd56c7ffa84c8ec6874959a53b797605f5bf14b580d312',
  'bob@test.com',
  'Bob Smoke',
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  phone_e164 = EXCLUDED.phone_e164,
  phone_verified_at = EXCLUDED.phone_verified_at,
  phone_hash = EXCLUDED.phone_hash,
  phone_digest = EXCLUDED.phone_digest,
  email = EXCLUDED.email,
  display_name = EXCLUDED.display_name;
INSERT INTO meet_requests (id, requester_id, receiver_id, status) VALUES ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'PENDING') ON CONFLICT (id) DO NOTHING;
INSERT INTO sessions (id, status) VALUES ('00000000-0000-0000-0000-000000000000', 'ACTIVE') ON CONFLICT (id) DO NOTHING;
" >/dev/null

echo "2. Testing Invite Creation..."
TEST_TOKEN=$(docker compose exec -T backend python -c "
import jwt, time, os
key = os.environ.get('AUTH_JWT_SECRET') or os.environ.get('SUPABASE_KEY')
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
