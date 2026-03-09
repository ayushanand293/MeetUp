import json
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api import deps
from app.core.database import get_db
from app.core.redis import get_redis
from app.models.meet_request import MeetRequest, RequestStatus
from app.models.session import ParticipantStatus, SessionParticipant, SessionStatus
from app.models.session import Session as MeetSession
from app.models.user import User

router = APIRouter()


@router.post("/from-request/{request_id}", status_code=status.HTTP_201_CREATED)
def create_session_from_request(
    request_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_user)
):
    # Verify request
    req = db.query(MeetRequest).filter(MeetRequest.id == request_id).first()
    if not req or req.status != RequestStatus.ACCEPTED:
        raise HTTPException(status_code=400, detail="Request must be accepted first")

    # Check if authorized (must be requester or receiver)
    if current_user.id not in [req.requester_id, req.receiver_id]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Check if active session already exists for these users?
    existing_session = (
        db.query(MeetSession)
        .join(SessionParticipant, SessionParticipant.session_id == MeetSession.id)
        .filter(
            MeetSession.status == SessionStatus.ACTIVE,
            SessionParticipant.user_id.in_([req.requester_id, req.receiver_id]),
        )
        .all()
    )

    for session in existing_session:
        participant_count = (
            db.query(SessionParticipant)
            .filter(
                SessionParticipant.session_id == session.id,
                SessionParticipant.user_id.in_([req.requester_id, req.receiver_id]),
            )
            .count()
        )
        if participant_count >= 2:
            return {"session_id": session.id, "status": session.status}

    session = MeetSession(status=SessionStatus.ACTIVE)
    db.add(session)
    db.flush()  # get ID

    p1 = SessionParticipant(session_id=session.id, user_id=req.requester_id)
    p2 = SessionParticipant(session_id=session.id, user_id=req.receiver_id)

    db.add(p1)
    db.add(p2)
    db.commit()
    db.refresh(session)

    return {"session_id": session.id, "status": session.status}


@router.get("/active")
def get_active_session(db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_user)):
    # Find active session for user
    # Join SessionParticipant
    participant = (
        db.query(SessionParticipant)
        .join(MeetSession)
        .filter(
            SessionParticipant.user_id == current_user.id,
            MeetSession.status == SessionStatus.ACTIVE,
            SessionParticipant.status == ParticipantStatus.JOINED,
        )
        .first()
    )

    if not participant:
        return None

    return {"session_id": participant.session_id, "joined_at": participant.joined_at}


@router.post("/{session_id}/end")
def end_session(
    session_id: UUID,
    reason: str = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    session = db.query(MeetSession).filter(MeetSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify participation
    part = (
        db.query(SessionParticipant)
        .filter(SessionParticipant.session_id == session_id, SessionParticipant.user_id == current_user.id)
        .first()
    )

    if not part:
        raise HTTPException(status_code=403, detail="Not a participant")

    if session.status != SessionStatus.ACTIVE:
        return {"status": "already_ended"}

    session.status = SessionStatus.ENDED
    session.end_reason = reason
    session.ended_at = func.now()
    db.commit()

    return {"status": "ended"}


@router.get("/{session_id}/snapshot")
async def get_session_snapshot(
    session_id: UUID,
    db: Session = Depends(get_db),
):
    """
    Get current snapshot of all locations in a session (from Redis).
    Locations stored with 120s TTL, so expired entries won't be returned.
    No authentication required (fallback for web clients).
    """
    # Verify session exists
    session = db.query(MeetSession).filter(MeetSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    redis_client = await get_redis()

    # Scan Redis for locations: loc:{session_id}:{user_id}
    cursor = 0
    locations = {}
    while True:
        cursor, keys = await redis_client.scan(cursor, match=f"loc:{session_id}:*")
        for key in keys:
            try:
                location_json = await redis_client.get(key)
                if location_json:
                    # Extract user_id from key format: loc:{session_id}:{user_id}
                    key_str = key.decode() if isinstance(key, bytes) else key
                    user_id = key_str.split(":")[-1]
                    locations[user_id] = json.loads(location_json)
            except Exception:
                pass  # Skip malformed entries
        if cursor == 0:
            break

    return {
        "session_id": str(session_id),
        "session_status": session.status,
        "locations": locations,
        "timestamp": datetime.utcnow().isoformat(),
    }
