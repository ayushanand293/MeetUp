from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api import deps
from app.core.database import get_db
from app.models.user import User

router = APIRouter()


class ProfileUpdate(BaseModel):
    display_name: str


@router.get("/me")
def read_user_me(current_user: User = Depends(deps.get_current_user)):
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "display_name": (current_user.profile_data or {}).get("display_name", ""),
        "profile_data": current_user.profile_data,
    }


@router.post("/profile")
def upsert_profile(
    body: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Save or update the user's display name. Also used to upsert the user row on login."""
    display_name = body.display_name.strip()
    if not display_name:
        raise HTTPException(status_code=400, detail="display_name cannot be empty")

    profile = dict(current_user.profile_data or {})
    profile["display_name"] = display_name
    current_user.profile_data = profile
    db.commit()
    return {"id": str(current_user.id), "display_name": display_name}


@router.get("/search")
def search_users(
    name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Search users by display_name/name/email (case-insensitive, partial match). Excludes self."""
    if not name or len(name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Search query must be at least 2 characters")

    query = name.strip()

    # JSONB text extraction with ilike; also support legacy `name` and email fallback.
    results = (
        db.query(User)
        .filter(
            User.id != current_user.id,
            or_(
                User.profile_data["display_name"].astext.ilike(f"%{query}%"),
                User.profile_data["name"].astext.ilike(f"%{query}%"),
                User.email.ilike(f"%{query}%"),
            ),
        )
        .limit(20)
        .all()
    )

    return [
        {
            "id": str(u.id),
            "display_name": (u.profile_data or {}).get("display_name")
            or (u.profile_data or {}).get("name")
            or u.email.split("@")[0].replace("_", " ").title(),
            "email": u.email,
        }
        for u in results
    ]
