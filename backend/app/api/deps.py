import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWTError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.auth_sessions import enforce_active_session
from app.core.database import get_db
from app.core.identity import normalize_phone_e164, phone_digest, phone_hash
from app.models.user import User

import logging
from app.core.scrub import scrub_sensitive

security = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)


def get_current_user(
    db: Session = Depends(get_db), credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            settings.AUTH_JWT_SECRET,
            algorithms=[settings.AUTH_JWT_ALGORITHM],
            options={"verify_aud": False},
        )

        user_id = payload.get("sub")
        email = payload.get("email")
        phone_e164 = normalize_phone_e164(payload.get("phone_e164") or "")
        issuer = payload.get("iss")
        auth_session_id = payload.get("sid")

        if not user_id:
            raise HTTPException(status_code=403, detail="Token has no user ID (sub)")

        if issuer == "meetup-otp":
            enforce_active_session(str(user_id), auth_session_id)

    except PyJWTError as e:
        logger.warning(scrub_sensitive(f"[AUTH] JWT decode FAILED: {type(e).__name__}: {e}"))
        raise HTTPException(status_code=403, detail="Could not validate credentials") from None

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        if not phone_e164:
            raise HTTPException(status_code=403, detail="Token has no phone number")

        # Auto-create user on first login
        user = User(
            id=user_id,
            email=email,
            phone_e164=phone_e164,
            phone_hash=phone_hash(phone_e164),
            phone_digest=phone_digest(settings.CONTACTS_HASH_VERSION, phone_e164),
        )
        db.add(user)
        try:
            db.commit()
            db.refresh(user)
        except IntegrityError:
            # Concurrent request may have created the same user row.
            db.rollback()
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                raise HTTPException(status_code=500, detail="Failed to resolve user record")
    else:
        changed = False
        if phone_e164 and user.phone_e164 != phone_e164:
            user.phone_e164 = phone_e164
            user.phone_hash = phone_hash(phone_e164)
            user.phone_digest = phone_digest(settings.CONTACTS_HASH_VERSION, phone_e164)
            changed = True
        if email and user.email != email:
            user.email = email
            changed = True
        if changed:
            db.commit()
            db.refresh(user)

    return user
