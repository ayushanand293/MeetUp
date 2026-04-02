from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api import deps
from app.core.database import get_db
from app.models.user import User

router = APIRouter()


@router.post("/session/validate")
async def validate_session(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Validate that the current session is still valid.
    This endpoint can be called by the client to check if the session 
    hasn't been invalidated by a concurrent login from another device.
    
    Returns session validity status.
    
    Note: Full concurrent session prevention would require:
    1. Storing session tokens in Redis with expiry
    2. On new login, invalidating previous session tokens
    3. On each API call, checking if the token is in the valid set
    
    This is a placeholder that always returns valid. 
    A more complete implementation would track active sessions per user.
    """
    return {
        "valid": True,
        "user_id": str(current_user.id),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/session/signout-other-devices")
async def signout_other_devices(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Sign out all other active sessions for the current user.
    
    In a production system with Supabase admin API access, this would:
    1. Get all active sessions for the user from Supabase
    2. Revoke all but the current one
    
    For now, this is a placeholder endpoint that documents the intent.
    To fully implement this, you would need:
    - Supabase Admin API credentials
    - A way to identify which session is "current"
    - Calling supabase.auth.admin.signOutUser() on the backend
    
    Current workaround:
    - Client will catch 401 errors and log out locally
    - 401 errors trigger SESSION_INVALIDATED event
    - User sees "Logged in elsewhere" message
    """
    return {
        "message": "Session management endpoint",
        "status": "placeholder",
        "note": "Full implementation requires Supabase admin API",
    }
