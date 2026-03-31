"""
Idempotency key support for REST endpoints.

Prevents duplicate request processing by storing request results in Redis.
- Idempotency-Key header: UUID provided by client
- TTL: 3600 seconds (1 hour) to allow safe retries
- Scope: Per user + endpoint + idempotency key
"""

import json
from typing import Any, Optional
from uuid import UUID

from fastapi import Header, HTTPException, status

from app.core.redis import get_redis


async def get_idempotency_key(idempotency_key: Optional[str] = Header(None)) -> Optional[str]:
    """Extract Idempotency-Key from request header."""
    if not idempotency_key:
        return None
    
    # Validate it's a valid UUID format
    try:
        UUID(idempotency_key)
        return idempotency_key
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Idempotency-Key must be a valid UUID"
        )


async def check_and_cache_idempotency(
    endpoint_name: str,
    user_id: UUID,
    idempotency_key: str,
    response_data: Any,
    ttl_seconds: int = 3600,
) -> None:
    """
    Cache response for idempotent endpoint.
    
    Args:
        endpoint_name: Logical name (e.g., 'accept_request', 'end_session')
        user_id: Current user UUID
        idempotency_key: Client-provided idempotency key
        response_data: Response to cache (must be JSON-serializable)
        ttl_seconds: Cache TTL (default 1 hour)
    """
    redis_client = await get_redis()
    cache_key = f"idempotency:{endpoint_name}:{user_id}:{idempotency_key}"
    serialized = json.dumps(response_data, default=str)
    await redis_client.setex(cache_key, ttl_seconds, serialized)


async def get_cached_response(
    endpoint_name: str,
    user_id: UUID,
    idempotency_key: str,
) -> Optional[Any]:
    """
    Retrieve cached response for idempotent endpoint if it exists.
    
    Args:
        endpoint_name: Logical name (e.g., 'accept_request', 'end_session')
        user_id: Current user UUID
        idempotency_key: Client-provided idempotency key
    
    Returns:
        Cached response dict or None if not cached
    """
    redis_client = await get_redis()
    cache_key = f"idempotency:{endpoint_name}:{user_id}:{idempotency_key}"
    cached = await redis_client.get(cache_key)
    
    if cached:
        try:
            return json.loads(cached)
        except json.JSONDecodeError:
            # Corrupted cache, ignore and allow retry
            return None
    
    return None
