"""In-memory metrics collection for the realtime gateway."""

from datetime import datetime
import re
from threading import Lock


from app.core.metrics_store import get_metrics_store

class Metrics:
    """Delegating metrics collector that uses the configured MetricsStore."""

    def __init__(self):
        self._store = get_metrics_store()

    def increment_counter(self, name: str, value: int = 1) -> None:
        self._store.increment_counter(name, value)

    def set_gauge(self, name: str, value: float) -> None:
        self._store.set_gauge(name, value)

    def get_all(self) -> dict:
        snapshot = self._store.snapshot()
        return {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "counters": snapshot["counters"],
            "gauges": snapshot["gauges"],
        }


# Global metrics instance
_metrics = Metrics()


def get_metrics() -> Metrics:
    """Get the global metrics instance."""
    return _metrics


# Convenience functions for common metrics
def track_ws_connection_open(session_id: str) -> None:
    """Track WebSocket connection opened."""
    _metrics.increment_counter("ws_connections_opened")
    _metrics.increment_counter("ws_connections_active", 1)


def track_ws_connection_close(session_id: str) -> None:
    """Track WebSocket connection closed."""
    _metrics.increment_counter("ws_connections_active", -1)


def track_session_created(session_id: str) -> None:
    """Track new session."""
    _metrics.increment_counter("sessions_created")
    _metrics.increment_counter("sessions_active", 1)


def track_session_ended(session_id: str) -> None:
    """Track session ended."""
    _metrics.increment_counter("sessions_active", -1)


def track_auto_end() -> None:
    """Track proximity-triggered automatic session end."""
    _metrics.increment_counter("auto_end_count")


def track_manual_end() -> None:
    """Track user-triggered manual session end."""
    _metrics.increment_counter("manual_end_count")


def track_session_start_latency_ms(session_id: str, latency_ms: float) -> None:
    """Track session_start_latency_ms: time from request to session committed (ms)."""
    _metrics.increment_counter("session_start_latency_ms_total", int(latency_ms))
    _metrics.increment_counter("session_start_count")
    import logging
    logging.getLogger(__name__).info(
        "metric session_start_latency_ms session_id=%s value=%.2f", session_id, latency_ms
    )


def track_location_propagation_latency_ms(session_id: str, user_id: str, latency_ms: float) -> None:
    """Track location_propagation_latency_ms: time from location payload timestamp to broadcast (ms)."""
    _metrics.increment_counter("location_propagation_latency_ms_total", int(latency_ms))
    _metrics.increment_counter("location_updates_counted")
    import logging
    logging.getLogger(__name__).debug(
        "metric location_propagation_latency_ms session_id=%s user_id=%s value=%.2f",
        session_id, user_id, latency_ms,
    )


def track_reconnect_count_per_session(session_id: str, user_id: str) -> None:
    """Track reconnect_count_per_session_total: incremented when a user reconnects to an existing session."""
    _metrics.increment_counter("reconnect_count_per_session_total")
    import logging
    logging.getLogger(__name__).info(
        "metric reconnect_count_per_session session_id=%s user_id=%s", session_id, user_id
    )


def track_message_received(event_type: str) -> None:
    """Track message received."""
    _metrics.increment_counter("messages_received")


def track_message_broadcasted() -> None:
    """Track message broadcasted."""
    _metrics.increment_counter("messages_broadcasted")


def track_rate_limit_hit() -> None:
    """Track rate limit enforcement."""
    _metrics.increment_counter("rate_limit_hits")


def track_validation_error(error_type: str) -> None:
    """Track validation errors."""
    _metrics.increment_counter("validation_errors")


def _to_prometheus_name(name: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_]", "_", name)
    return f"meetup_{normalized}"


def export_prometheus_text() -> str:
    """Export current metrics in Prometheus text exposition format."""
    snapshot = _metrics.get_all()
    lines: list[str] = []

    # Mandatory build/info metric to ensure response is never empty
    lines.append("# HELP meetup_build_info Build information")
    lines.append("# TYPE meetup_build_info gauge")
    lines.append('meetup_build_info{version="beta-v0.1.0"} 1')

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
