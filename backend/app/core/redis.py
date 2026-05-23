"""Redis connection pool and utilities."""

import asyncio
import redis.asyncio as redis

from app.core.config import settings

_redis_clients: dict[int, redis.Redis] = {}


async def get_redis() -> redis.Redis:
    """Get or create Redis connection."""
    loop_id = id(asyncio.get_running_loop())
    redis_client = _redis_clients.get(loop_id)
    if redis_client is None:
        redis_client = await redis.from_url(settings.REDIS_URL, decode_responses=True)
        _redis_clients[loop_id] = redis_client
    else:
        try:
            await redis_client.ping()
        except Exception:
            try:
                await redis_client.aclose()
            except Exception:
                pass
            redis_client = await redis.from_url(settings.REDIS_URL, decode_responses=True)
            _redis_clients[loop_id] = redis_client
    return redis_client


async def close_redis() -> None:
    """Close Redis connection."""
    for redis_client in list(_redis_clients.values()):
        await redis_client.aclose()
    _redis_clients.clear()


class RedisClient:
    """Wrapper for Redis operations."""

    def __init__(self, client: redis.Redis):
        self.client = client

    async def set_presence(self, session_id: str, user_id: str, ttl: int = 300) -> None:
        """Set user presence in session (with TTL)."""
        key = f"presence:{session_id}:{user_id}"
        await self.client.setex(key, ttl, "online")

    async def delete_presence(self, session_id: str, user_id: str) -> None:
        """Remove user from session presence."""
        key = f"presence:{session_id}:{user_id}"
        await self.client.delete(key)

    async def get_presence(self, session_id: str, user_id: str) -> str | None:
        """Get presence status for user in session."""
        key = f"presence:{session_id}:{user_id}"
        return await self.client.get(key)

    async def publish(self, channel: str, message: str) -> int:
        """Publish message to Redis channel."""
        return await self.client.publish(channel, message)

    async def increment_rate_limit(self, key: str, window: int = 1) -> int:
        """Increment rate limit counter for a key."""
        full_key = f"ratelimit:{key}"
        count = await self.client.incr(full_key)
        if count == 1:
            # First increment, set expiration
            await self.client.expire(full_key, window)
        return count

    async def get_rate_limit(self, key: str) -> int:
        """Get current rate limit counter."""
        full_key = f"ratelimit:{key}"
        count = await self.client.get(full_key)
        return int(count) if count else 0

    async def set_metric(self, metric_name: str, value: int) -> None:
        """Set a metric value."""
        key = f"metric:{metric_name}"
        await self.client.set(key, value)

    async def increment_metric(self, metric_name: str) -> int:
        """Increment a metric."""
        key = f"metric:{metric_name}"
        return await self.client.incr(key)

    async def decrement_metric(self, metric_name: str) -> int:
        """Decrement a metric."""
        key = f"metric:{metric_name}"
        return await self.client.decr(key)

    async def get_metric(self, metric_name: str) -> int:
        """Get a metric value."""
        key = f"metric:{metric_name}"
        value = await self.client.get(key)
        return int(value) if value else 0
