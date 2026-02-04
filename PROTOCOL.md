# MeetUp Realtime Protocol (Draft)

## Overview
Communication between Client and Server happens via WebSocket at `/ws/meetup`.
Authentication is handled via the `token` query parameter during connection.

## Connection
**URL**: `ws://api.meetup.com/api/v1/ws/meetup?token=<JWT>&session_id=<UUID>`

## Payloads

### Client -> Server

#### `location_update`
Sent by the user to broadcast their current location.
```json
{
  "type": "location_update",
  "payload": {
    "lat": 37.7749,
    "lon": -122.4194,
    "accuracy_m": 5.0,
    "timestamp": "2023-10-27T10:00:00Z"
  }
}
```

#### `end_session`
Sent by user to manually end the session.
```json
{
  "type": "end_session",
  "payload": {
    "reason": "USER_ACTION"
  }
}
```

### Server -> Client

#### `peer_location`
Broadcast to other participants when a user updates location.
```json
{
  "type": "peer_location",
  "payload": {
    "user_id": "uuid-of-sender",
    "lat": 37.7749,
    "lon": -122.4194,
    "accuracy_m": 5.0,
    "timestamp": "2023-10-27T10:00:00Z"
  }
}
```

#### `presence_update`
Broadcast when a user joins (connects) or leaves (disconnects) the session.
```json
{
  "type": "presence_update",
  "payload": {
    "user_id": "uuid-of-user",
    "status": "online", 
    "last_seen": "2023-10-27T10:15:00Z"
  }
}
```

#### `session_ended`
Broadcast when the session ends (manually or via proximity).
```json
{
  "type": "session_ended",
  "payload": {
    "reason": "PROXIMITY_REACHED",
    "ended_at": "2023-10-27T10:15:00Z"
  }
}
```

#### `error`
Sent when an operation fails.
```json
{
  "type": "error",
  "payload": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many updates"
  }
}
```
