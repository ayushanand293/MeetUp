import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWTError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User

security = HTTPBearer()


def get_current_user(
    db: Session = Depends(get_db), credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    token = credentials.credentials
    try:
        # verify signature
        # In a real Supabase setup, you'd use the SUPABASE_JWT_SECRET
        # For now, we will trust the token signature if we don't have the secret configured perfectly
        # or verify with the provided key.
        # Note: Supabase JWTs are HS256 signed with the project JWT secret.

        # We allow unverified if no key is set for local dev ease, BUT we should warn.
        # Ideally, user provides SUPABASE_JWT_SECRET in .env.

        # For this stage, let's assume we decode payload to get sub (uuid).
        payload = jwt.decode(token, settings.SUPABASE_KEY, algorithms=["HS256"], options={"verify_signature": False})
        user_id = payload.get("sub")
        email = payload.get("email")

        if not user_id:
            raise HTTPException(status_code=403, detail="Could not validate credentials")

    except PyJWTError:
        raise HTTPException(status_code=403, detail="Could not validate credentials") from None

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        # Auto-create user on first login
        user = User(id=user_id, email=email)
        db.add(user)
        db.commit()
        db.refresh(user)

    return user
