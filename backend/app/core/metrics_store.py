import logging
from abc import ABC, abstractmethod
from typing import Any, Dict

import redis
from app.core.config import settings

logger = logging.getLogger(__name__)


class MetricsStore(ABC):
    """Abstract base class for metrics storage."""

    @abstractmethod
    def increment_counter(self, name: str, value: int = 1) -> None:
        """Increment a counter."""
        pass

    @abstractmethod
    def set_gauge(self, name: str, value: float) -> None:
        """Set a gauge value."""
        pass

    @abstractmethod
    def snapshot(self) -> Dict[str, Any]:
        """Return a snapshot of all metrics."""
        pass


class InMemoryMetricsStore(MetricsStore):
    """In-memory implementation of MetricsStore (per-process)."""

    def __init__(self):
        from threading import Lock
        self._counters: Dict[str, int] = {}
        self._gauges: Dict[str, float] = {}
        self._lock = Lock()

    def increment_counter(self, name: str, value: int = 1) -> None:
        with self._lock:
            self._counters[name] = self._counters.get(name, 0) + value

    def set_gauge(self, name: str, value: float) -> None:
        with self._lock:
            self._gauges[name] = value

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "counters": dict(self._counters),
                "gauges": dict(self._gauges),
            }


class RedisMetricsStore(MetricsStore):
    """Redis-backed implementation of MetricsStore (cross-process)."""

    def __init__(self, redis_url: str):
        self._redis = redis.from_url(redis_url, decode_responses=True)
        self._prefix = "meetup:metrics:"

    def increment_counter(self, name: str, value: int = 1) -> None:
        key = f"{self._prefix}counter:{name}"
        try:
            self._redis.incrby(key, value)
        except Exception as e:
            logger.error(f"Redis metrics error (incrby): {e}")

    def set_gauge(self, name: str, value: float) -> None:
        key = f"{self._prefix}gauge:{name}"
        try:
            self._redis.set(key, str(value))
        except Exception as e:
            logger.error(f"Redis metrics error (set): {e}")

    def snapshot(self) -> Dict[str, Any]:
        counters = {}
        gauges = {}
        try:
            # Use SCAN instead of KEYS for better performance string-prefix-matching
            # For beta, we expect a small number of metrics, so we can gather all.
            counter_pattern = f"{self._prefix}counter:*"
            for key in self._redis.scan_iter(match=counter_pattern):
                name = key[len(f"{self._prefix}counter:"):]
                val = self._redis.get(key)
                if val is not None:
                    counters[name] = int(val)

            gauge_pattern = f"{self._prefix}gauge:*"
            for key in self._redis.scan_iter(match=gauge_pattern):
                name = key[len(f"{self._prefix}gauge:"):]
                val = self._redis.get(key)
                if val is not None:
                    gauges[name] = float(val)
        except Exception as e:
            logger.error(f"Redis metrics snapshot error: {e}")

        return {
            "counters": counters,
            "gauges": gauges,
        }


def get_metrics_store() -> MetricsStore:
    """Factory to get the configured MetricsStore."""
    backend = settings.METRICS_BACKEND.lower()
    
    if backend == "redis":
        try:
            store = RedisMetricsStore(settings.REDIS_URL)
            # Connectivity check
            store._redis.ping()
            return store
        except Exception as e:
            logger.error(f"Failed to connect to Redis for metrics ({settings.REDIS_URL}): {e}")
            if settings.ENVIRONMENT == "development":
                logger.warning("Falling back to InMemoryMetricsStore (development mode)")
                return InMemoryMetricsStore()
            # In production, we might want to fail or use memory with a big warning.
            # Task asks: otherwise fail-closed (or log error and keep memory but document it).
            # We'll use memory as fallback but keep logs screaming.
            return InMemoryMetricsStore()
            
    return InMemoryMetricsStore()
