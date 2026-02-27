"""Quick validation test."""
import asyncio
import json
import websockets

SESSION_ID = "312b35d7-1dec-4226-b702-923e57902fd2"
USER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlZjZhYjY4Yy0yYjMxLTQ5NGQtYTZhMC05ODJjZTJjOTRmNzYiLCJleHAiOjE3NzIxNzc4NDcsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJlbWFpbCI6InVzZXJfZWY2YUBleGFtcGxlLmNvbSJ9.lCEgDBO79mxQUQbReNvFpVPnHZwIde7VFyZ2hnVNR_Y"
WS_URL = "ws://localhost:8000/api/v1/ws/meetup"

async def test_latitude():
    """Test latitude validation specifically."""
    print("Testing latitude validation (lat > 90)...")
    
    async with websockets.connect(f"{WS_URL}?token={USER_TOKEN}&session_id={SESSION_ID}") as ws:
        # Get initial presence message
        msg1 = await asyncio.wait_for(ws.recv(), timeout=1.0)
        data1 = json.loads(msg1)
        print(f"1. Received: {data1['type']}")
        
        # Send invalid latitude
        payload = {
            "type": "location_update",
            "payload": {"lat": 91, "lon": 0, "accuracy_m": 5}
        }
        await ws.send(json.dumps(payload))
        print(f"2. Sent: location_update with lat=91")
        
        # Get response
        msg2 = await asyncio.wait_for(ws.recv(), timeout=1.0)
        data2 = json.loads(msg2)
        print(f"3. Received: {data2['type']}")
        if data2['type'] == 'error':
            print(f"   Error code: {data2['payload'].get('code')}")
            print(f"   Error msg: {data2['payload'].get('message')}")
        else:
            print(f"   Payload: {data2.get('payload')}")

asyncio.run(test_latitude())
