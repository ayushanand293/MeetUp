# Invite Deep Link QA — Non-Installed → Install → Resume Request

## Overview
This document covers manual QA for the end-to-end invite/deep-link flow where a recipient
does **not** have the MeetUp app installed, installs it after receiving the link, and then
lands at the correct Accept Request screen.

---

## Preconditions

| # | Condition |
|---|-----------|
| 1 | Backend running (`docker-compose up backend db redis`) |
| 2 | Migrations applied (`alembic upgrade head`) |
| 3 | Sender (User A) is signed in on **Device A** |
| 4 | Recipient (User B) account exists but the **mobile app is NOT installed** on Device B |
| 5 | A valid Supabase token for User A is available for curl testing |

---

## Step-by-Step Flow

### Step 1 — User A creates a Meet Request

User A opens the app → Home → taps "Request Meeting" → selects User B.

**Backend event:** `POST /api/v1/requests/?receiver_id=<user_b_id>` → 201  
**Expected UI state (Device A):** "Request Sent" confirmation banner visible.

> **Screenshot placeholder:** `docs/screenshots/step1_request_sent.png`

---

### Step 2 — User A generates an Invite Link

With the `request_id` from Step 1, User A (or the app automatically) calls:

```bash
curl -X POST https://api.meetup.app/api/v1/invites \
  -H "Authorization: Bearer <TOKEN_A>" \
  -H "Content-Type: application/json" \
  -d '{"recipient": "sms:+15551234567", "request_id": "<request_id>"}'
```

**Expected response (201):**
```json
{
  "invite_id": "xxxxxxxx-...",
  "token": "abc123...",
  "url": "meetup://invite?token=abc123...",
  "expires_at": "2026-04-26T10:00:00+00:00"
}
```

User A shares the `url` via SMS/WhatsApp/email to User B.

> **Screenshot placeholder:** `docs/screenshots/step2_invite_link.png`

---

### Step 3 — User B receives the link (app NOT installed)

On Device B, tapping `meetup://invite?token=...` should:
- If iOS: redirect to App Store listing (configure via Universal Links / Associated Domains)
- If Android: redirect to Play Store (configure via App Links / intent filter)

The OS stores the original URL in the clipboard / pending deep link to resume after install.

**Expected UI state (Device B):** App Store / Play Store opens to MeetUp listing.

> **Screenshot placeholder:** `docs/screenshots/step3_appstore.png`

---

### Step 4 — User B installs the app

Standard install flow. No special QA needed here.

---

### Step 5 — User B opens the app for the first time via the stored deep link

After install, Device B re-opens the invite URL (either automatically via deferred deep linking
or by User B re-tapping the link in their messages).

`Linking.getInitialURL()` in `AuthContext.js` fires with the invite URL.

**App flow:**
1. App shows loading indicator while calling `GET /api/v1/invites/<token>`
2. If valid: navigates to **AcceptRequest** screen with `linkedRequestId` set to the `request_id`
3. Linked request is highlighted at the top of the list with a `LINKED` badge
4. Banner reads: _"Invite request found. Accept to join quickly."_

**Expected UI state (Device B):**  
AcceptRequest screen → linked request at top → LINKED badge → "Opened from shared link." subtitle

> **Screenshot placeholder:** `docs/screenshots/step5_accept_screen.png`

---

### Step 6 — User B accepts the request

User B taps **Accept** on the linked request card.

**Backend:** `POST /api/v1/requests/<request_id>/accept` → 200  
**Navigation:** Both devices navigate to `ActiveSession` screen.

**Expected UI states:**
- Device A: active session view with User B as peer
- Device B: active session view with User A as peer
- WebSocket connections established from both sides

> **Screenshot placeholder:** `docs/screenshots/step6_active_session.png`

---

### Step 7 — Verify Session Active on Both Devices

Ping: `GET /api/v1/sessions/active`  
Both devices should return the same `session_id`.

---

## Edge Cases

### Expired Token (410)

Set `expires_at` to past time in DB (or wait 24h). User B taps link.

**Expected:** App shows an alert: _"This invite has expired. Ask the sender to share a new link."_  
No crash, no blank screen.

To simulate:
```sql
UPDATE invites SET expires_at = now() - interval '1 hour' WHERE token = '<token>';
```

Then tap link → resolve call returns 410 → app shows error state.

> **Screenshot placeholder:** `docs/screenshots/edge_expired_token.png`

---

### Invalid / Unknown Token (404)

URL tampered or token never existed.

**Expected:** App shows same "expired/invalid" error with "Ask sender to resend" message.

> **Screenshot placeholder:** `docs/screenshots/edge_invalid_token.png`

---

### Opening the Same Link Twice (Idempotency)

User B taps link, accepts request, then taps the same link again.

**Expected behavior:**
1. Second resolve call: still returns 200 (invite not expired yet)
2. Second redeem call: returns 200 with the same `redeemed_at` (idempotent)
3. Navigation: goes to AcceptRequest screen; request is already accepted, so accept
   button may show as session-started or request is gone from list — no duplicate session

---

### User Not Signed In (Cold Start via Link)

User B taps link while not signed in.

**Expected:**
1. App stores the pending deep link in `pendingNavigation`
2. After sign-in/register, `consumePendingNavigation()` is called
3. User is routed to AcceptRequest with `linkedRequestId` intact

---

## Curl Proof Pack

```bash
# 1. Create invite
TOKEN_A="<supabase_jwt_for_user_a>"
REQUEST_ID="<uuid>"

CREATE=$(curl -s -X POST http://localhost:8000/api/v1/invites \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"recipient\": \"email:user_b@example.com\", \"request_id\": \"$REQUEST_ID\"}")
echo $CREATE

INVITE_TOKEN=$(echo $CREATE | python3 -m json.tool | grep '"token"' | awk -F'"' '{print $4}')
echo "Token: $INVITE_TOKEN"

# 2. Resolve invite (no auth needed)
curl -s http://localhost:8000/api/v1/invites/$INVITE_TOKEN | python3 -m json.tool

# 3. Redeem invite (User B auth)
TOKEN_B="<supabase_jwt_for_user_b>"
curl -s -X POST http://localhost:8000/api/v1/invites/$INVITE_TOKEN/redeem \
  -H "Authorization: Bearer $TOKEN_B" | python3 -m json.tool
```

---

## Screenshot Checklist

- [ ] Step 2: Invite URL generated (API response)
- [ ] Step 3: App Store / Play Store redirect
- [ ] Step 5: AcceptRequest screen with LINKED badge
- [ ] Step 6: ActiveSession screen on both devices
- [ ] Edge: Expired invite error alert
- [ ] Edge: Invalid token error alert
