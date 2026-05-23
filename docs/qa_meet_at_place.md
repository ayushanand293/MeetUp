# Meet At A Place QA

Use a development build on two devices/simulators and a local backend with migrations applied.

## Checklist

1. Create a request with a destination
   - Open Find Friends or Quick Friends.
   - Choose a matched friend.
   - Search for a restaurant or cafe in Meeting place.
   - Select one result and send the meet request.
   - Confirm request sending still works with no destination selected.

2. Receiver sees destination before accepting
   - Open incoming requests.
   - Verify the card shows `Meet at`, place name, and one-line address.
   - Accept the request.
   - Confirm the active session starts only after acceptance.

3. Active session shows destination
   - Verify the map shows your marker, the friend marker, and the destination pin.
   - Verify the directions card shows place name, your distance, friend distance when available, and `ETA: —`.

4. Open in Maps
   - Tap `Maps`.
   - iOS should open Apple Maps to the destination.
   - Android should open Google Maps navigation/search.

5. Peer location and destination together
   - Move one simulator/device location.
   - Verify peer updates continue while the destination pin remains visible.
   - If peer location is stale, verify the existing last-seen text remains visible.

6. Background session
   - Start an active session with destination.
   - Send the app to background for 2 minutes.
   - Reopen and verify location updates continue and destination UI is still present.

## Safe Metrics

Only aggregate counters are expected:

- `destination_selected_total`
- `destination_requests_sent_total`
- `destination_sessions_started_total`

Metrics must not include coordinates, addresses, phone numbers, emails, user IDs, session IDs, request IDs, or place IDs.
