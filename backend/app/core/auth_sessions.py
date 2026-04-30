import secrets

import redis
from fastapi import HTTPException

from app.core.config import settings


def active_session_key(user_id: str) -> str:
    return f"auth:active_session:{user_id}"


def new_session_id() -> str:
    return secrets.token_urlsafe(32)


async def activate_user_session(redis_client, user_id: str, session_id: str) -> None:
    await redis_client.setex(
        active_session_key(user_id),
        settings.AUTH_ACCESS_TOKEN_TTL_SECONDS,
        session_id,
    )


def enforce_active_session(user_id: str, session_id: str | None) -> None:
    if not session_id:
        raise HTTPException(status_code=401, detail="Session invalidated")

    redis_client = None
    try:
        redis_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
        active_session_id = redis_client.get(active_session_key(user_id))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Session validation failed") from exc
    finally:
        if redis_client is not None:
            try:
                redis_client.close()
            except Exception:
                pass

    if not active_session_id or active_session_id != session_id:
        raise HTTPException(status_code=401, detail="Session invalidated")
