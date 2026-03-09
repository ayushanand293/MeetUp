from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api import deps
from app.core.database import get_db
from app.models.meet_request import MeetRequest, RequestStatus
from app.models.session import Session as MeetSession
from app.models.session import SessionParticipant, SessionStatus
from app.models.user import User

router = APIRouter()


class CreateRequestBody(BaseModel):
    to_user_id: UUID


def _is_expired(req: MeetRequest) -> bool:
    if not req.expires_at:
        return False
    now = datetime.now(UTC)
    exp = req.expires_at if req.expires_at.tzinfo else req.expires_at.replace(tzinfo=UTC)
    return now > exp


def _expire_stale(db: Session):
    """Mark all expired PENDING requests as EXPIRED."""
    now = datetime.now(UTC)
    stale = (
        db.query(MeetRequest)
        .filter(
            MeetRequest.status == RequestStatus.PENDING,
            MeetRequest.expires_at < now,
        )
        .all()
    )
    for r in stale:
        r.status = RequestStatus.EXPIRED
    if stale:
        db.commit()


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_meet_request(
    body: CreateRequestBody | None = None,
    receiver_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    receiver_id = (body.to_user_id if body else None) or receiver_id

    if receiver_id is None:
        raise HTTPException(status_code=422, detail="Either body.to_user_id or query receiver_id is required")

    if receiver_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot request self")

    receiver = db.query(User).filter(User.id == receiver_id).first()
    if not receiver:
        raise HTTPException(status_code=404, detail="User not found")

    # Expire stale requests first
    _expire_stale(db)

    # Check if a live pending request already exists
    existing = (
        db.query(MeetRequest)
        .filter(
            MeetRequest.requester_id == current_user.id,
            MeetRequest.receiver_id == receiver_id,
            MeetRequest.status == RequestStatus.PENDING,
        )
        .first()
    )

    if existing and not _is_expired(existing):
        return existing

    req = MeetRequest(requester_id=current_user.id, receiver_id=receiver_id)
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


@router.get("/pending")
def list_pending_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """List incoming pending meet requests for the current user (excludes expired)."""
    _expire_stale(db)
    requests = (
        db.query(MeetRequest)
        .filter(
            MeetRequest.receiver_id == current_user.id,
            MeetRequest.status == RequestStatus.PENDING,
        )
        .all()
    )

    return [
        {
            "id": str(r.id),
            "requester_id": str(r.requester_id),
            "created_at": r.created_at,
            "expires_at": r.expires_at,
            "requester_email": r.requester.email,
            "requester_name": (r.requester.profile_data or {}).get("display_name", r.requester.email),
        }
        for r in requests
    ]


@router.get("/outgoing")
def list_outgoing_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """List outgoing meet requests sent by the current user (PENDING or ACCEPTED recently)."""
    _expire_stale(db)
    requests = (
        db.query(MeetRequest)
        .filter(
            MeetRequest.requester_id == current_user.id,
            MeetRequest.status.in_([RequestStatus.PENDING, RequestStatus.ACCEPTED]),
        )
        .order_by(MeetRequest.created_at.desc())
        .limit(10)
        .all()
    )

    return [
        {
            "id": str(r.id),
            "receiver_id": str(r.receiver_id),
            "status": r.status,
            "created_at": r.created_at,
            "expires_at": r.expires_at,
            "receiver_name": (r.receiver.profile_data or {}).get("display_name", r.receiver.email),
            "receiver_email": r.receiver.email,
        }
        for r in requests
    ]


@router.post("/{request_id}/accept")
def accept_request(
    request_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Accept a pending meet request.
    Automatically creates an ACTIVE session and returns the session_id.
    """
    req = db.query(MeetRequest).filter(MeetRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if req.receiver_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Check expiry
    if _is_expired(req):
        req.status = RequestStatus.EXPIRED
        db.commit()
        raise HTTPException(status_code=410, detail="Request has expired")

    if req.status != RequestStatus.PENDING:
        existing_participant = (
            db.query(SessionParticipant)
            .join(MeetSession)
            .filter(
                SessionParticipant.user_id == current_user.id,
                MeetSession.status == SessionStatus.ACTIVE,
            )
            .first()
        )
        if existing_participant:
            return {"status": "already_accepted", "session_id": str(existing_participant.session_id)}
        raise HTTPException(status_code=400, detail="Request already processed")

    req.status = RequestStatus.ACCEPTED
    db.flush()

    session = MeetSession(status=SessionStatus.ACTIVE)
    db.add(session)
    db.flush()

    p1 = SessionParticipant(session_id=session.id, user_id=req.requester_id)
    p2 = SessionParticipant(session_id=session.id, user_id=req.receiver_id)
    db.add(p1)
    db.add(p2)
    db.commit()
    db.refresh(session)

    requester = db.query(User).filter(User.id == req.requester_id).first()
    requester_name = (requester.profile_data or {}).get("display_name", requester.email) if requester else "Peer"

    return {
        "status": "accepted",
        "session_id": str(session.id),
        "peer_name": requester_name,
        "peer_id": str(req.requester_id),
    }


@router.post("/{request_id}/decline")
def decline_request(
    request_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Decline a pending meet request."""
    req = db.query(MeetRequest).filter(MeetRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.receiver_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if req.status != RequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Request already processed")

    req.status = RequestStatus.REJECTED
    db.commit()
    return {"status": "rejected"}
