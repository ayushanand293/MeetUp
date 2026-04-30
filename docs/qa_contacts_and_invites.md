# QA: Contacts + Invites

## Preconditions
- Backend and mobile app are running.
- Two real test phone numbers are available for OTP verification.
- Device contacts include:
  - One number already registered on MeetUp.
  - One number not registered on MeetUp.

## Scenario 1: Matched Contact Meet
1. Sign in on requester device with phone OTP.
2. Open Find Friends and grant Contacts permission.
3. Confirm the known registered contact appears in On MeetUp.
4. Tap Meet on that contact.
5. Verify requester sends meet request via `/api/v1/requests`.
6. On receiver device, sign in and open Incoming Requests.
7. Accept request.
8. Verify exactly one active session is created.
9. Confirm session starts only after explicit accept.

## Scenario 2: Unmatched Contact Invite -> Install Return -> Accept
1. Sign in on requester device.
2. In Find Friends, locate an unmatched contact under Invite.
3. Tap Invite and share deep link through share sheet/WhatsApp.
4. On recipient device, install app and open invite deep link.
5. Complete phone OTP sign-in.
6. App should land in accept meetup flow (AcceptRequest screen with invite context).
7. Tap Accept Invite.
8. Verify invite redeem requires auth and returns active session.
9. Re-open the same invite link and accept again.
10. Confirm idempotency: no duplicate sessions are created.

## Negative Checks
- Expired invite returns 410 (or 404 for not found).
- `/api/v1/contacts/match` unauthenticated call returns 401.
- Contacts matching does not expose unmatched contacts from backend.
- Logs and metrics do not contain raw phone numbers or invite tokens.
