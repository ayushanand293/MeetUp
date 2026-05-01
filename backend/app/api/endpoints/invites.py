import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api import deps
from app.core.database import get_db
from app.core.rate_limit import enforce_rate_limit
from app.models.invite import Invite
from app.models.meet_request import MeetRequest
from app.models.session import ParticipantStatus, Session as MeetSession, SessionParticipant, SessionStatus
from app.models.user import User

router = APIRouter()
INVITE_TTL_HOURS = 24


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CreateInviteBody(BaseModel):
    recipient: str = Field(min_length=1, max_length=255)
    request_id: UUID | None = None
    request_context: dict | None = None


class CreateInviteResponse(BaseModel):
    invite_id: str
    token: str
    url: str
    expires_at: datetime


class InviteResolutionResponse(BaseModel):
    invite_id: str
    request_id: str | None
    requester_name: str
    expires_at: datetime
    redeemed_at: datetime | None


class InviteRedeemResponse(BaseModel):
    invite_id: str
    request_id: str | None
    session_id: str | None = None
    redeemed_at: datetime


def _display_name(user: User | None) -> str:
    if not user:
        return "Peer"
    profile = user.profile_data or {}
    preferred = profile.get("display_name") or profile.get("name")
    if preferred:
        return str(preferred)
    if user.display_name:
        return user.display_name
    if user.phone_e164:
        return f"User {user.phone_e164[-4:]}"
    email_prefix = (user.email or "").split("@", 1)[0].strip()
    if email_prefix:
        return email_prefix.replace(".", " ").replace("_", " ").title()
    return "Peer"


def _find_or_create_invite_session(db: Session, inviter_id: UUID, receiver_id: UUID) -> MeetSession:
    existing_sessions = (
        db.query(MeetSession)
        .join(SessionParticipant, SessionParticipant.session_id == MeetSession.id)
        .filter(
            MeetSession.status == SessionStatus.ACTIVE,
            SessionParticipant.user_id.in_([inviter_id, receiver_id]),
        )
        .all()
    )
    for session in existing_sessions:
        participant_count = (
            db.query(SessionParticipant)
            .filter(
                SessionParticipant.session_id == session.id,
                SessionParticipant.user_id.in_([inviter_id, receiver_id]),
            )
            .count()
        )
        if participant_count >= 2:
            return session

    session = MeetSession(status=SessionStatus.ACTIVE)
    db.add(session)
    db.flush()
    db.add_all(
        [
            SessionParticipant(session_id=session.id, user_id=inviter_id, status=ParticipantStatus.JOINED),
            SessionParticipant(session_id=session.id, user_id=receiver_id, status=ParticipantStatus.JOINED),
        ]
    )
    return session


@router.post("", response_model=CreateInviteResponse, status_code=status.HTTP_201_CREATED)
async def create_invite(
    body: CreateInviteBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    await enforce_rate_limit("invite_create", current_user.id, 10, 60)
    requester_id = (body.request_context or {}).get("requester_id")
    if requester_id is not None and str(requester_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Invalid requester")

    if body.request_id:
        request = db.query(MeetRequest).filter(MeetRequest.id == body.request_id).first()
        if not request:
            raise HTTPException(status_code=404, detail="Request not found")
        if current_user.id not in {request.requester_id, request.receiver_id}:
            raise HTTPException(status_code=403, detail="Not authorized")

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
    requester = db.query(User).filter(User.id == invite.created_by).first()
    return InviteResolutionResponse(
        invite_id=str(invite.id),
        request_id=str(invite.request_id) if invite.request_id else None,
        requester_name=_display_name(requester),
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

    session = None
    if invite.request_id is None:
        session = _find_or_create_invite_session(db, invite.created_by, current_user.id)
    db.add(invite)
    db.commit()
    db.refresh(invite)
    if session:
        db.refresh(session)

    return InviteRedeemResponse(
        invite_id=str(invite.id),
        request_id=str(invite.request_id) if invite.request_id else None,
        session_id=str(session.id) if session else None,
        redeemed_at=invite.redeemed_at,
    )
