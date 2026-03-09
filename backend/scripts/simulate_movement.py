import argparse
import json
import math
import time
from datetime import datetime
from uuid import UUID

import redis

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.session import ParticipantStatus, SessionParticipant


def get_participants(session_id: UUID):
    with SessionLocal() as db:
        participants = (
            db.query(SessionParticipant)
            .filter(
                SessionParticipant.session_id == session_id,
                SessionParticipant.status == ParticipantStatus.JOINED,
            )
            .all()
        )
        return [str(participant.user_id) for participant in participants]


def main():
    parser = argparse.ArgumentParser(description="Simulate moving peers for a session")
    parser.add_argument("--session-id", required=True, help="Session UUID")
    parser.add_argument("--interval", type=float, default=2.0, help="Update interval seconds")
    parser.add_argument("--ttl", type=int, default=120, help="Redis key TTL seconds")
    parser.add_argument("--center-lat", type=float, default=28.5355, help="Center latitude")
    parser.add_argument("--center-lon", type=float, default=77.0892, help="Center longitude")
    args = parser.parse_args()

    session_id = UUID(args.session_id)
    user_ids = get_participants(session_id)

    if not user_ids:
        raise SystemExit(f"No JOINED participants found for session {session_id}")

    redis_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)

    print(f"🚗 Simulating movement for session {session_id}")
    print(f"👥 Participants: {len(user_ids)}")
    print(f"⏱️ Interval: {args.interval}s | TTL: {args.ttl}s")
    print("Press Ctrl+C to stop")

    step = 0
    try:
        while True:
            now_iso = datetime.utcnow().isoformat()

            for idx, user_id in enumerate(user_ids):
                phase = step * 0.2 + idx * (2 * math.pi / max(len(user_ids), 1))
                lat = args.center_lat + 0.0012 * math.sin(phase)
                lon = args.center_lon + 0.0012 * math.cos(phase)

                location = {
                    "lat": round(lat, 7),
                    "lon": round(lon, 7),
                    "accuracy_m": 8 + idx,
                    "timestamp": now_iso,
                    "updated_at": now_iso,
                }

                key = f"loc:{session_id}:{user_id}"
                redis_client.setex(key, args.ttl, json.dumps(location))

            step += 1
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\n🛑 Movement simulator stopped")


if __name__ == "__main__":
    main()
