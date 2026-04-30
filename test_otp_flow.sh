#!/bin/bash

PHONE="+15551234567"
DEVICE_ID="dev-test-$(date +%s)"
API_URL="http://localhost:8000/api/v1"

echo "🔷 Step 1: Starting OTP..."
START_RESP=$(curl -s -X POST "$API_URL/auth/otp/start" \
  -H "Content-Type: application/json" \
  -d "{\"phone_e164\": \"$PHONE\"}")

echo "Response: $START_RESP"

OTP_CODE=$(echo $START_RESP | grep -o '"dev_otp_code":"[0-9]*"' | cut -d'"' -f4)
if [ -z "$OTP_CODE" ]; then
  echo "❌ No OTP code found. Check OTP_DEV_ECHO_ENABLED=true"
  exit 1
fi

echo "✅ OTP Code: $OTP_CODE"

echo ""
echo "🔷 Step 2: Verifying OTP..."
VERIFY_RESP=$(curl -s -X POST "$API_URL/auth/otp/verify" \
  -H "Content-Type: application/json" \
  -d "{
    \"phone_e164\": \"$PHONE\",
    \"otp_code\": \"$OTP_CODE\",
    \"device_id\": \"$DEVICE_ID\"
  }")

echo "Response: $VERIFY_RESP"

TOKEN=$(echo $VERIFY_RESP | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
  echo "❌ No access token found"
  exit 1
fi

echo "✅ Access Token: ${TOKEN:0:50}..."

echo ""
echo "🔷 Step 3: Fetching user profile..."
ME=$(curl -s "$API_URL/users/me" \
  -H "Authorization: Bearer $TOKEN")

echo "Response: $ME"

echo ""
echo "🔷 Step 4: Updating profile..."
UPDATE=$(curl -s -X POST "$API_URL/users/profile" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "Test User",
    "email": "test@example.com"
  }')

echo "Response: $UPDATE"

echo ""
echo "✅ Full OTP flow completed!"