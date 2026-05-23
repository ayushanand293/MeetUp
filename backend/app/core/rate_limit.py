import logging
from uuid import UUID
from fastapi import HTTPException, status
from app.core.redis import get_redis
from app.core.scrub import scrub_sensitive

logger = logging.getLogger(__name__)

async def check_rate_limit(
    key_prefix: str,
    identifier: UUID | str,
    limit: int,
    window_seconds: int = 60,
) -> bool:
    """
    Check if rate limit is exceeded. Returns True if allowed, False if exceeded.
    Fails closed: if Redis is down, returns False.
    """
    try:
        redis_client = await get_redis()
        key = f"ratelimit:{key_prefix}:{identifier}"
        
        # Increment the counter
        count = await redis_client.incr(key)
        
        # If it's the first hit in this window, set the TTL
        if count == 1:
            await redis_client.expire(key, window_seconds)
        
        return count <= limit
    except Exception as e:
        logger.error(scrub_sensitive(f"Rate limiter Redis error: {e}"))
        # Fail closed: if rate limiter fails, deny the request/update
        return False

async def enforce_rate_limit(
    key_prefix: str,
    identifier: UUID | str,
    limit: int,
    window_seconds: int = 60,
) -> None:
    """
    Enforce a rate limit using Redis INCR and EXPIRE.
    Raises HTTPException if exceeded or if Redis is down (Fail-Closed).
    """
    allowed = await check_rate_limit(key_prefix, identifier, limit, window_seconds)
    if not allowed:
        # We don't know if it's a Redis error or a real limit here in the simple case,
        # but both should result in rejection. 
        # For REST, we'll return 429. If it was a 503 (Redis down), 
        # a slightly more complex check could return 503.
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded or security check failed. Max {limit} per {window_seconds}s."
        )
