from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api import deps
from app.core.database import get_db
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
    # For now, just create new one

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
