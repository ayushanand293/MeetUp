import jwt
import requests as http_requests
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

# Cache the JWKS public keys so we don't fetch them on every request
_jwks_cache = {"keys": None}


def _get_jwks_keys():
    """Fetch and cache JWKS public keys from Supabase."""
    if _jwks_cache["keys"] is None:
        jwks_url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
        logger.info(scrub_sensitive(f"[AUTH] Fetching JWKS from {jwks_url}"))
        try:
            resp = http_requests.get(jwks_url, timeout=10)
            resp.raise_for_status()
            jwks_data = resp.json()
            _jwks_cache["keys"] = {
                k["kid"]: jwt.algorithms.ECAlgorithm.from_jwk(k)
                for k in jwks_data.get("keys", [])
                if k.get("kty") == "EC"
            }
            logger.info(scrub_sensitive(f"[AUTH] Loaded {len(_jwks_cache['keys'])} JWKS key(s)"))
        except Exception as e:
            logger.warning(scrub_sensitive(f"[AUTH] JWKS fetch failed: {e}, falling back to SUPABASE_KEY for HS256"))
            _jwks_cache["keys"] = {}
    return _jwks_cache["keys"]


def get_current_user(
    db: Session = Depends(get_db), credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = credentials.credentials
    try:
        # Read the token header to determine the algorithm
        unverified_header = jwt.get_unverified_header(token)
        alg = unverified_header.get("alg", "HS256")
        kid = unverified_header.get("kid")

        if alg == "ES256" and kid:
            # Use JWKS public key for ES256 (modern Supabase projects)
            keys = _get_jwks_keys()
            public_key = keys.get(kid)
            if not public_key:
                raise HTTPException(status_code=403, detail=f"Unknown key ID: {kid}")

            payload = jwt.decode(
                token,
                public_key,
                algorithms=["ES256"],
                options={"verify_aud": False},
            )
        else:
            # Fallback to HS256 with SUPABASE_KEY (older Supabase projects or custom tokens)
            secrets_to_try = [settings.SUPABASE_KEY]
            if settings.AUTH_JWT_SECRET:
                secrets_to_try.insert(0, settings.AUTH_JWT_SECRET)

            payload = None
            for decode_secret in secrets_to_try:
                if not decode_secret:
                    continue
                try:
                    payload = jwt.decode(
                        token,
                        decode_secret,
                        algorithms=["HS256"],
                        options={"verify_aud": False},
                    )
                    break
                except PyJWTError:
                    continue

            if payload is None:
                raise HTTPException(status_code=403, detail="Could not validate credentials")

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
