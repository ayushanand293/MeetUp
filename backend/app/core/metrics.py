"""In-memory metrics collection for the realtime gateway."""

from datetime import datetime
import re
from threading import Lock


class Metrics:
    """Thread-safe in-memory metrics collector."""

    def __init__(self):
        self._counters: dict[str, int] = {}
        self._gauges: dict[str, int] = {}
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

    def get_all(self) -> dict[str, dict]:
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


def track_auto_end() -> None:
    """Track proximity-triggered automatic session end."""
    _metrics.increment_counter("auto_end_count")


def track_manual_end() -> None:
    """Track user-triggered manual session end."""
    _metrics.increment_counter("manual_end_count")


def track_session_start_latency_ms(session_id: str, latency_ms: float) -> None:
    """Track session_start_latency_ms: time from request to session committed (ms).

    Metric name: session_start_latency_ms
    Emitted once per session creation in POST /api/v1/sessions/from-request.
    """
    _metrics.increment_counter("session_start_latency_ms_total", int(latency_ms))
    _metrics.increment_counter("session_start_count")
    import logging
    logging.getLogger(__name__).info(
        "metric session_start_latency_ms session_id=%s value=%.2f", session_id, latency_ms
    )


def track_location_propagation_latency_ms(session_id: str, user_id: str, latency_ms: float) -> None:
    """Track location_propagation_latency_ms: time from location payload timestamp to broadcast (ms).

    Metric name: location_propagation_latency_ms
    Emitted on each valid location update in the WebSocket handler.
    """
    _metrics.increment_counter("location_propagation_latency_ms_total", int(latency_ms))
    _metrics.increment_counter("location_updates_counted")
    import logging
    logging.getLogger(__name__).debug(
        "metric location_propagation_latency_ms session_id=%s user_id=%s value=%.2f",
        session_id, user_id, latency_ms,
    )


def track_reconnect_count_per_session(session_id: str, user_id: str) -> None:
    """Track reconnect_count_per_session: incremented when a user reconnects to an existing session.

    Metric name: reconnect_count_per_session
    Emitted in ConnectionManager.connect() when the user was already present in the session.
    """
    _metrics.increment_counter("reconnect_count_per_session")
    _metrics.increment_counter(f"session:{session_id}:reconnects")
    import logging
    logging.getLogger(__name__).info(
        "metric reconnect_count_per_session session_id=%s user_id=%s", session_id, user_id
    )


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


def _to_prometheus_name(name: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_]", "_", name)
    return f"meetup_{normalized}"


def export_prometheus_text() -> str:
    """Export current metrics in Prometheus text exposition format."""
    snapshot = _metrics.get_all()
    lines: list[str] = []

    counters = snapshot.get("counters", {})
    for name, value in counters.items():
        metric_name = _to_prometheus_name(name)
        lines.append(f"# TYPE {metric_name} counter")
        lines.append(f"{metric_name} {value}")

    gauges = snapshot.get("gauges", {})
    for name, value in gauges.items():
        metric_name = _to_prometheus_name(name)
        lines.append(f"# TYPE {metric_name} gauge")
        lines.append(f"{metric_name} {value}")

    return "\n".join(lines) + "\n"
