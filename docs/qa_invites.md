# Invite Deep Link QA (Non-installed -> Install -> Resume)

## Preconditions
- Backend and mobile app are running.
- Sender is signed in on Device A.
- Receiver account exists but app is not installed on Device B.

## Steps
1. On Device A, create a meet request to the receiver.
2. Create invite using `/api/v1/invites` with the `request_id` from step 1.
3. Copy the returned `url` and open it on Device B.
4. Since app is not installed, install the app from store/testflight link.
5. Re-open the same invite URL on Device B after install.
6. App should resolve token via `GET /api/v1/invites/{token}`.
7. App should navigate to Accept Request screen with linked request preloaded.
8. Accept request on Device B.
9. Verify Device A sees transition to active session and both users can join.

## Expected UI States
- Deep link opened: app loading state then deterministic route to Accept Request.
- Expired token: clean error message (410) and no crash.
- Opening same link twice: idempotent behavior, no duplicate request/session.

## Screenshot Placeholders
- [ ] Invite URL generated response
- [ ] Install/open flow landing screen
- [ ] Accept Request screen with linked request
- [ ] Active session started on both devices
- [ ] Expired invite error screen
