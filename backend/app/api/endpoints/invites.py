import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api import deps
from app.core.database import get_db
from app.models.invite import Invite
from app.models.meet_request import MeetRequest
from app.models.user import User

router = APIRouter()
INVITE_TTL_HOURS = 24


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CreateInviteBody(BaseModel):
    recipient: str = Field(min_length=1, max_length=255)
    request_id: UUID | None = None


class CreateInviteResponse(BaseModel):
    invite_id: str
    token: str
    url: str
    expires_at: datetime


class InviteResolutionResponse(BaseModel):
    invite_id: str
    request_id: str | None
    expires_at: datetime
    redeemed_at: datetime | None


class InviteRedeemResponse(BaseModel):
    invite_id: str
    request_id: str | None
    redeemed_at: datetime


@router.post("", response_model=CreateInviteResponse, status_code=status.HTTP_201_CREATED)
def create_invite(
    body: CreateInviteBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if body.request_id:
        request = db.query(MeetRequest).filter(MeetRequest.id == body.request_id).first()
        if not request:
            raise HTTPException(status_code=404, detail="Request not found")

    token = secrets.token_urlsafe(24)
    expires_at = _utc_now() + timedelta(hours=INVITE_TTL_HOURS)
    invite = Invite(
        created_by=current_user.id,
        recipient=body.recipient.strip(),
        request_id=body.request_id,
        token=token,
        expires_at=expires_at,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)

    return CreateInviteResponse(
        invite_id=str(invite.id),
        token=invite.token,
        url=f"meetup://invite?token={invite.token}",
        expires_at=invite.expires_at,
    )


def _resolve_valid_invite_or_throw(db: Session, token: str) -> Invite:
    invite = db.query(Invite).filter(Invite.token == token).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")

    if invite.expires_at and invite.expires_at < _utc_now():
        raise HTTPException(status_code=410, detail="Invite has expired")

    return invite


@router.get("/{token}", response_model=InviteResolutionResponse)
def resolve_invite_token(token: str, db: Session = Depends(get_db)):
    invite = _resolve_valid_invite_or_throw(db, token)
    return InviteResolutionResponse(
        invite_id=str(invite.id),
        request_id=str(invite.request_id) if invite.request_id else None,
        expires_at=invite.expires_at,
        redeemed_at=invite.redeemed_at,
    )


@router.post("/{token}/redeem", response_model=InviteRedeemResponse)
def redeem_invite_token(
    token: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    _ = current_user  # ensures auth is enforced
    invite = _resolve_valid_invite_or_throw(db, token)

    if not invite.redeemed_at:
        invite.redeemed_at = _utc_now()
        db.add(invite)
        db.commit()
        db.refresh(invite)

    return InviteRedeemResponse(
        invite_id=str(invite.id),
        request_id=str(invite.request_id) if invite.request_id else None,
        redeemed_at=invite.redeemed_at,
    )