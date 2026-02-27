"""In-memory metrics collection for the realtime gateway."""

from typing import Dict
from threading import Lock
from datetime import datetime


class Metrics:
    """Thread-safe in-memory metrics collector."""

    def __init__(self):
        self._counters: Dict[str, int] = {}
        self._gauges: Dict[str, int] = {}
        self._lock = Lock()

    def increment_counter(self, name: str, value: int = 1) -> None:
        """Increment a counter."""
        with self._lock:
            self._counters[name] = self._counters.get(name, 0) + value

    def decrement_counter(self, name: str, value: int = 1) -> None:
        """Decrement a counter."""
        with self._lock:
            self._counters[name] = self._counters.get(name, 0) - value

    def set_gauge(self, name: str, value: int) -> None:
        """Set a gauge value."""
        with self._lock:
            self._gauges[name] = value

    def increment_gauge(self, name: str, value: int = 1) -> None:
        """Increment a gauge."""
        with self._lock:
            self._gauges[name] = self._gauges.get(name, 0) + value

    def decrement_gauge(self, name: str, value: int = 1) -> None:
        """Decrement a gauge."""
        with self._lock:
            self._gauges[name] = self._gauges.get(name, 0) - value

    def get_counter(self, name: str) -> int:
        """Get counter value."""
        with self._lock:
            return self._counters.get(name, 0)

    def get_gauge(self, name: str) -> int:
        """Get gauge value."""
        with self._lock:
            return self._gauges.get(name, 0)

    def get_all(self) -> Dict[str, dict]:
        """Get all metrics as a dictionary."""
        with self._lock:
            return {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "counters": dict(self._counters),
                "gauges": dict(self._gauges),
            }

    def reset(self) -> None:
        """Reset all metrics."""
        with self._lock:
            self._counters.clear()
            self._gauges.clear()


# Global metrics instance
_metrics = Metrics()


def get_metrics() -> Metrics:
    """Get the global metrics instance."""
    return _metrics


# Convenience functions for common metrics
def track_ws_connection_open(session_id: str) -> None:
    """Track WebSocket connection opened."""
    _metrics.increment_counter("ws_connections_opened")
    _metrics.increment_gauge("ws_connections_active")
    _metrics.increment_counter(f"session:{session_id}:connections")


def track_ws_connection_close(session_id: str) -> None:
    """Track WebSocket connection closed."""
    _metrics.decrement_gauge("ws_connections_active")


def track_session_created(session_id: str) -> None:
    """Track new session."""
    _metrics.increment_counter("sessions_created")
    _metrics.increment_gauge("sessions_active")
    _metrics.set_gauge(f"session:{session_id}:created_at", int(datetime.utcnow().timestamp()))


def track_session_ended(session_id: str) -> None:
    """Track session ended."""
    _metrics.decrement_gauge("sessions_active")


def track_message_received(event_type: str) -> None:
    """Track message received."""
    _metrics.increment_counter("messages_received")
    _metrics.increment_counter(f"message:{event_type}:count")


def track_message_broadcasted() -> None:
    """Track message broadcasted."""
    _metrics.increment_counter("messages_broadcasted")


def track_rate_limit_hit() -> None:
    """Track rate limit enforcement."""
    _metrics.increment_counter("rate_limit_hits")


def track_validation_error(error_type: str) -> None:
    """Track validation errors."""
    _metrics.increment_counter("validation_errors")
    _metrics.increment_counter(f"validation_error:{error_type}:count")
