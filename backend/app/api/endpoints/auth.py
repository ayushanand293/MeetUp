import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api import deps
from app.core.auth_sessions import activate_user_session, new_session_id
from app.core.config import settings
from app.core.database import get_db
from app.core.identity import (
    mask_phone,
    normalize_phone_e164,
    otp_hash,
    phone_digest,
    phone_hash,
)
from app.core.metrics import get_metrics
from app.core.rate_limit import enforce_rate_limit
from app.core.redis import get_redis
from app.core.scrub import scrub_sensitive
from app.models.user import User

router = APIRouter()
logger = logging.getLogger(__name__)


class OtpStartBody(BaseModel):
    phone_e164: str


class OtpVerifyBody(BaseModel):
    phone_e164: str
    otp_code: str
    device_id: str | None = None


def _jwt_secret() -> str:
    return settings.AUTH_JWT_SECRET or settings.SUPABASE_KEY


def _issue_access_token(user: User, device_id: str | None, session_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "phone_e164": user.phone_e164,
        "email": user.email,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=settings.AUTH_ACCESS_TOKEN_TTL_SECONDS)).timestamp()),
        "iss": "meetup-otp",
        "sid": session_id,
    }
    if device_id:
        payload["device_id"] = device_id

    return jwt.encode(payload, _jwt_secret(), algorithm=settings.AUTH_JWT_ALGORITHM)


async def _send_otp(phone_e164: str, otp_code: str) -> None:
    # Provider abstraction placeholder for beta. OTP content is intentionally not logged.
    logger.info(scrub_sensitive(f"OTP send requested for {mask_phone(phone_e164)}"))


@router.post("/session/validate")
async def validate_session(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return {
        "valid": True,
        "user_id": str(current_user.id),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/otp/start")
async def otp_start(
    body: OtpStartBody,
    request: Request,
):
    normalized_phone = normalize_phone_e164(body.phone_e164)
    if not normalized_phone:
        raise HTTPException(status_code=400, detail="Invalid phone_e164 format")

    client_ip = request.client.host if request.client else "unknown"
    phone_hash_value = phone_hash(normalized_phone)

    await enforce_rate_limit(
        "otp_start_phone",
        phone_hash_value,
        settings.OTP_START_LIMIT_PER_PHONE,
        60,
    )
    await enforce_rate_limit(
        "otp_start_ip",
        client_ip,
        settings.OTP_START_LIMIT_PER_IP,
        60,
    )

    otp_code = f"{secrets.randbelow(10 ** settings.OTP_DIGITS):0{settings.OTP_DIGITS}d}"
    otp_storage_hash = otp_hash(phone_hash_value, otp_code)

    redis_client = await get_redis()
    await redis_client.setex(f"otp:{phone_hash_value}", settings.OTP_TTL_SECONDS, otp_storage_hash)

    await _send_otp(normalized_phone, otp_code)
    get_metrics().increment_counter("otp_start_requests_total")

    response = {"ok": True, "expires_in_seconds": settings.OTP_TTL_SECONDS}
    # Development convenience: only echo OTP when explicitly enabled and not in production.
    if settings.OTP_DEV_ECHO_ENABLED and settings.ENVIRONMENT.lower() != "production":
        response["dev_otp_code"] = otp_code

    return response


@router.post("/otp/verify")
async def otp_verify(
    body: OtpVerifyBody,
    request: Request,
    db: Session = Depends(get_db),
):
    normalized_phone = normalize_phone_e164(body.phone_e164)
    if not normalized_phone:
        get_metrics().increment_counter("otp_verify_fail_total")
        raise HTTPException(status_code=400, detail="Invalid phone_e164 format")

    otp_code = (body.otp_code or "").strip()
    if not otp_code.isdigit() or len(otp_code) != settings.OTP_DIGITS:
        get_metrics().increment_counter("otp_verify_fail_total")
        raise HTTPException(status_code=400, detail="Invalid otp_code format")

    client_ip = request.client.host if request.client else "unknown"
    phone_hash_value = phone_hash(normalized_phone)

    await enforce_rate_limit(
        "otp_verify_phone",
        phone_hash_value,
        settings.OTP_VERIFY_LIMIT_PER_PHONE,
        60,
    )
    await enforce_rate_limit(
        "otp_verify_ip",
        client_ip,
        settings.OTP_VERIFY_LIMIT_PER_IP,
        60,
    )

    redis_client = await get_redis()
    stored_hash = await redis_client.get(f"otp:{phone_hash_value}")
    expected_hash = otp_hash(phone_hash_value, otp_code)
    if not stored_hash or stored_hash != expected_hash:
        get_metrics().increment_counter("otp_verify_fail_total")
        raise HTTPException(status_code=401, detail="Invalid or expired OTP")

    user = db.query(User).filter(User.phone_e164 == normalized_phone).first()
    if not user:
        user = User(
            phone_e164=normalized_phone,
            phone_hash=phone_hash_value,
            phone_digest=phone_digest(settings.CONTACTS_HASH_VERSION, normalized_phone),
            phone_verified_at=datetime.now(timezone.utc),
        )
        db.add(user)
        db.flush()
    elif not user.phone_verified_at:
        user.phone_verified_at = datetime.now(timezone.utc)

    user.phone_hash = phone_hash_value
    user.phone_digest = phone_digest(settings.CONTACTS_HASH_VERSION, normalized_phone)
    db.commit()
    db.refresh(user)

    await redis_client.delete(f"otp:{phone_hash_value}")

    auth_session_id = new_session_id()
    await activate_user_session(redis_client, str(user.id), auth_session_id)
    token = _issue_access_token(user, body.device_id, auth_session_id)
    get_metrics().increment_counter("otp_verify_success_total")
    return {
        "access_token": token,
        "user": {
            "id": str(user.id),
            "phone_e164": user.phone_e164,
            "email": user.email,
            "display_name": user.display_name or (user.profile_data or {}).get("display_name"),
        },
    }


@router.post("/session/signout-other-devices")
async def signout_other_devices(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return {
        "message": "Other device sessions are invalidated automatically on OTP login.",
        "status": "ok",
    }
