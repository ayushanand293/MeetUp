from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import settings
from app.core.database import get_db
from app.core.identity import phone_last4
from app.core.metrics import get_metrics
from app.core.rate_limit import enforce_rate_limit
from app.models.user import User

router = APIRouter()


class ContactsMatchBody(BaseModel):
    digests: list[str] = Field(default_factory=list)
    version: int


@router.get("/hash_config")
def hash_config():
    return {"version": settings.CONTACTS_HASH_VERSION}


@router.post("/match")
async def contacts_match(
    body: ContactsMatchBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if body.version != settings.CONTACTS_HASH_VERSION:
        raise HTTPException(status_code=400, detail="Unsupported contacts hash version")

    digests = [d.strip().lower() for d in (body.digests or []) if isinstance(d, str) and d.strip()]
    if len(digests) > settings.CONTACTS_MATCH_MAX_DIGESTS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many digests. Max {settings.CONTACTS_MATCH_MAX_DIGESTS} per request",
        )

    await enforce_rate_limit(
        "contacts_match",
        current_user.id,
        settings.CONTACTS_MATCH_LIMIT_PER_MINUTE,
        60,
    )
    get_metrics().increment_counter("contacts_match_requests_total")

    if not digests:
        return []

    users = (
        db.query(User)
        .filter(
            User.phone_digest.in_(digests),
            User.id != current_user.id,
            User.phone_verified_at.is_not(None),
        )
        .all()
    )

    return [
        {
            "user_id": str(u.id),
            "display_name": u.display_name or (u.profile_data or {}).get("display_name") or f"User {phone_last4(u.phone_e164)}",
            "phone_last4": phone_last4(u.phone_e164),
            "matched_digest": u.phone_digest,
        }
        for u in users
    ]
