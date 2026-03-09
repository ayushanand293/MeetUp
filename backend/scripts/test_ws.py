import asyncio
import json
import uuid
from datetime import datetime

import websockets


async def test_websocket():
    # In Demo Mode, the app doesn't need real backend auth if it fails,
    # but we can try pinging the WS directly to see if the backend broadcasts.
    session_id = str(uuid.uuid4())
    token = "dummy_token"
    uri = f"ws://localhost:8000/api/v1/ws/meetup?token={token}&session_id={session_id}"

    print(f"Connecting to {uri}")
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected!")

            # Send location update
            location_update = {
                "type": "location_update",
                "payload": {
                    "lat": 37.7749,
                    "lon": -122.4194,
                    "accuracy_m": 15.0,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                },
            }

            print("Sending location update...")
            await websocket.send(json.dumps(location_update))
            print("Sent!")

            # Wait for response
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                print(f"Received: {response}")
            except TimeoutError:
                print("No immediate response (normal if it only broadcasts to peers, not self)")

    except Exception as e:
        print(f"Connection failed: {e}")


if __name__ == "__main__":
    asyncio.run(test_websocket())
