import json
import secrets
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api import deps
from app.core.database import get_db
from app.core.idempotency import check_and_cache_idempotency, get_cached_response, get_idempotency_key
from app.core.metrics import track_manual_end
from app.core.redis import get_redis
from app.models.meet_request import MeetRequest, RequestStatus
from app.models.session import ParticipantStatus, SessionParticipant, SessionStatus
from app.models.session import Session as MeetSession
from app.models.user import User

router = APIRouter()

INVITE_TOKEN_TTL_SECONDS = 15 * 60
INVITE_CREATE_LIMIT_PER_MINUTE = 5
INVITE_REDEEM_LIMIT_PER_MINUTE = 20


def _is_participant(db: Session, session_id: UUID, user_id: UUID) -> bool:
    return (
        db.query(SessionParticipant)
        .filter(SessionParticipant.session_id == session_id, SessionParticipant.user_id == user_id)
        .first()
        is not None
    )


async def _enforce_invite_rate_limit(redis_client, key: str, limit: int) -> None:
    count = await redis_client.incr(key)
    if count == 1:
        await redis_client.expire(key, 60)
    if count > limit:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")


@router.post("/from-request/{request_id}", status_code=status.HTTP_201_CREATED)
async def create_session_from_request(
    request_id: UUID,
    idempotency_key: Optional[str] = Depends(get_idempotency_key),
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Create an ACTIVE session from an ACCEPTED meet request.
    Idempotent: same request (same idempotency_key) returns same result.
    """
    # Check cache if idempotency key provided
    if idempotency_key:
        cached = await get_cached_response("create_session_from_request", current_user.id, idempotency_key)
        if cached:
            return cached

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
            response = {"session_id": str(session.id), "status": session.status}
            # Cache response if idempotency key provided
            if idempotency_key:
                await check_and_cache_idempotency("create_session_from_request", current_user.id, idempotency_key, response)
            return response

    session = MeetSession(status=SessionStatus.ACTIVE)
    db.add(session)
    db.flush()  # get ID

    p1 = SessionParticipant(session_id=session.id, user_id=req.requester_id)
    p2 = SessionParticipant(session_id=session.id, user_id=req.receiver_id)

    db.add(p1)
    db.add(p2)
    db.commit()
    db.refresh(session)

    response = {"session_id": str(session.id), "status": session.status}
    
    # Cache response if idempotency key provided
    if idempotency_key:
        await check_and_cache_idempotency("create_session_from_request", current_user.id, idempotency_key, response)

    return response


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
async def end_session(
    session_id: UUID,
    reason: str = Body(..., embed=True),
    idempotency_key: Optional[str] = Depends(get_idempotency_key),
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    End an active session with reason.
    Idempotent: same request (same idempotency_key) returns same result.
    """
    # Check cache if idempotency key provided
    if idempotency_key:
        cached = await get_cached_response("end_session", current_user.id, idempotency_key)
        if cached:
            return cached

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
        response = {"status": "already_ended"}
        # Cache response if idempotency key provided
        if idempotency_key:
            await check_and_cache_idempotency("end_session", current_user.id, idempotency_key, response)
        return response

    session.status = SessionStatus.ENDED
    session.end_reason = reason
    session.ended_at = func.now()
    db.commit()

    if reason != "PROXIMITY_REACHED":
        track_manual_end()

    response = {"status": "ended"}
    
    # Cache response if idempotency key provided
    if idempotency_key:
        await check_and_cache_idempotency("end_session", current_user.id, idempotency_key, response)

    return response


@router.post("/{session_id}/invite")
async def create_invite_token(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    session = db.query(MeetSession).filter(MeetSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != SessionStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Session is not active")
    if not _is_participant(db, session_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a participant")

    redis_client = await get_redis()
    await _enforce_invite_rate_limit(
        redis_client,
        key=f"invite_create_rate:{current_user.id}",
        limit=INVITE_CREATE_LIMIT_PER_MINUTE,
    )

    token = secrets.token_urlsafe(24)
    payload = {
        "session_id": str(session_id),
        "created_by": str(current_user.id),
        "created_at": datetime.utcnow().isoformat(),
    }
    await redis_client.setex(f"invite:{token}", INVITE_TOKEN_TTL_SECONDS, json.dumps(payload))

    return {
        "invite_token": token,
        "session_id": str(session_id),
        "expires_in_seconds": INVITE_TOKEN_TTL_SECONDS,
    }


@router.post("/{session_id}/invite/redeem")
async def redeem_invite_token(
    session_id: UUID,
    token: str = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    session = db.query(MeetSession).filter(MeetSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != SessionStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Session is not active")

    redis_client = await get_redis()
    await _enforce_invite_rate_limit(
        redis_client,
        key=f"invite_redeem_rate:{current_user.id}",
        limit=INVITE_REDEEM_LIMIT_PER_MINUTE,
    )

    invite_raw = await redis_client.get(f"invite:{token}")
    if not invite_raw:
        raise HTTPException(status_code=410, detail="Invite token expired or invalid")

    try:
        invite_data = json.loads(invite_raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invite token payload is malformed")

    if invite_data.get("session_id") != str(session_id):
        raise HTTPException(status_code=400, detail="Invite token does not match this session")

    if _is_participant(db, session_id, current_user.id):
        return {"status": "already_joined", "session_id": str(session_id)}

    participant = SessionParticipant(session_id=session_id, user_id=current_user.id, status=ParticipantStatus.JOINED)
    db.add(participant)
    db.commit()

    return {"status": "joined", "session_id": str(session_id)}


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


@router.get("/history")
def get_session_history(
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Get user's recent ended sessions (meetup history).
    Returns the 10 most recent sessions with co-participant info and timestamps.
    """
    # Find all ENDED sessions for this user
    ended_sessions = (
        db.query(MeetSession)
        .join(SessionParticipant, SessionParticipant.session_id == MeetSession.id)
        .filter(
            SessionParticipant.user_id == current_user.id,
            MeetSession.status == SessionStatus.ENDED,
        )
        .order_by(MeetSession.ended_at.desc())
        .limit(limit)
        .all()
    )

    history = []
    for session in ended_sessions:
        # Get all participants in this session
        participants = (
            db.query(SessionParticipant, User)
            .join(User, User.id == SessionParticipant.user_id)
            .filter(SessionParticipant.session_id == session.id)
            .all()
        )

        # Find the co-participant (not current user)
        co_participant = None
        for part, user in participants:
            if user.id != current_user.id:
                co_participant = user
                break

        if co_participant:
            # Extract name from profile_data or use email prefix
            name = co_participant.profile_data.get("name") if co_participant.profile_data else None
            if not name:
                name = co_participant.email.split("@")[0].replace("_", " ").title()
            
            history.append({
                "session_id": str(session.id),
                "co_participant_id": str(co_participant.id),
                "co_participant_name": name,
                "co_participant_email": co_participant.email,
                "ended_at": session.ended_at.isoformat() if session.ended_at else None,
                "created_at": session.created_at.isoformat(),
                "duration_seconds": int((session.ended_at - session.created_at).total_seconds()) if session.ended_at else 0,
            })

    return {"history": history}


@router.post("/{session_id}/im-here")
async def im_here_confirmation(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Manual 'I'm Here' confirmation.
    If both active participants call this within 60 seconds, the session ends.
    """
    session = db.query(MeetSession).filter(MeetSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    if session.status != SessionStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Session is not active")

    if not _is_participant(db, session_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a participant")

    redis_client = await get_redis()
    
    # Set my flag
    im_here_key = f"im_here:{session_id}:{current_user.id}"
    await redis_client.setex(im_here_key, 60, "1")

    # Find peer
    participants = db.query(SessionParticipant).filter(SessionParticipant.session_id == session_id).all()
    peer = next((p for p in participants if p.user_id != current_user.id), None)

    if peer:
        peer_here = await redis_client.get(f"im_here:{session_id}:{peer.user_id}")
        if peer_here:
            # Both are here! End the session
            session.status = SessionStatus.ENDED
            session.end_reason = "MANUAL_CONFIRM"
            session.ended_at = func.now()
            db.commit()

            # Broadcast to web socket to trigger UI
            from app.realtime.connection_manager import manager
            from app.realtime.schemas import SessionEndedEvent, SessionEndedPayload
            
            event = SessionEndedEvent(
                payload=SessionEndedPayload(
                    reason="MANUAL_CONFIRM",
                    ended_at=datetime.utcnow()
                )
            )
            await manager.broadcast(session_id, event.model_dump_json())

            return {"status": "ended", "reason": "MANUAL_CONFIRM"}

    return {"status": "waiting_for_peer", "message": "Waiting for peer to confirm"}
