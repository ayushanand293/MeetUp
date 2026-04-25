import json
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.endpoints.sessions import INVITE_TOKEN_TTL_SECONDS
from app.core.database import get_db
from app.core.redis import get_redis
from app.models.session import Session as MeetSession, SessionStatus

router = APIRouter()


class InviteResolutionResponse(BaseModel):
    invite_token: str
    session_id: str
    session_status: str
    created_by: str | None = None
    created_at: str | None = None
    expires_in_seconds: int


@router.get("/{token}", response_model=InviteResolutionResponse)
async def resolve_invite_token(token: str, db: Session = Depends(get_db)):
    redis_client = await get_redis()
    invite_raw = await redis_client.get(f"invite:{token}")
    if not invite_raw:
        raise HTTPException(status_code=410, detail="Invite token expired or invalid")

    try:
        invite_data = json.loads(invite_raw)
        session_id = UUID(invite_data.get("session_id"))
    except (TypeError, ValueError, json.JSONDecodeError, AttributeError):
        raise HTTPException(status_code=400, detail="Invite token payload is malformed")

    session = db.query(MeetSession).filter(MeetSession.id == session_id).first()
    if not session or session.status != SessionStatus.ACTIVE:
        raise HTTPException(status_code=410, detail="Invite token expired or invalid")

    ttl = await redis_client.ttl(f"invite:{token}")
    if ttl is None or ttl < 0:
        ttl = INVITE_TOKEN_TTL_SECONDS

    return InviteResolutionResponse(
        invite_token=token,
        session_id=str(session.id),
        session_status=session.status.value if hasattr(session.status, "value") else str(session.status),
        created_by=invite_data.get("created_by"),
        created_at=invite_data.get("created_at") or datetime.utcnow().isoformat(),
        expires_in_seconds=ttl,
    )