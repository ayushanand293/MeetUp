from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api import deps
from app.core.database import get_db
from app.models.meet_request import MeetRequest, RequestStatus
from app.models.user import User

router = APIRouter()


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_meet_request(
    receiver_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_user)
):
    if receiver_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot request self")

    # Check if pending request exists
    existing = (
        db.query(MeetRequest)
        .filter(
            MeetRequest.requester_id == current_user.id,
            MeetRequest.receiver_id == receiver_id,
            MeetRequest.status == RequestStatus.PENDING,
        )
        .first()
    )

    if existing:
        return existing

    req = MeetRequest(requester_id=current_user.id, receiver_id=receiver_id)
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


@router.get("/pending", response_model=list[dict])
def list_pending_requests(db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_user)):
    # Incoming requests
    requests = (
        db.query(MeetRequest)
        .filter(MeetRequest.receiver_id == current_user.id, MeetRequest.status == RequestStatus.PENDING)
        .all()
    )

    return [
        {"id": r.id, "requester_id": r.requester_id, "created_at": r.created_at, "requester_email": r.requester.email}
        for r in requests
    ]


@router.post("/{request_id}/accept")
def accept_request(
    request_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_user)
):
    req = db.query(MeetRequest).filter(MeetRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if req.receiver_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if req.status != RequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Request already processed")

    req.status = RequestStatus.ACCEPTED
    db.commit()

    # Ideally, this would also trigger session creation
    return {"status": "accepted"}
