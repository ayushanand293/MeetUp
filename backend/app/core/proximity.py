"""Proximity helpers for server-side meeting detection."""

from math import asin, cos, radians, sin, sqrt


def adaptive_threshold_m(
    acc_a_m: float,
    acc_b_m: float,
    min_m: float = 5.0,
    max_m: float = 25.0,
) -> float:
    """Compute adaptive meeting threshold in meters.

    Rule: clamp(min_m, max_m, max(min_m, 2 * max(accA, accB))).
    """
    base = max(min_m, 2.0 * max(acc_a_m, acc_b_m))
    return max(min_m, min(max_m, base))


def haversine_distance_m(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """Return distance in meters between two WGS84 points."""
    # Earth's mean radius in meters
    radius_m = 6371000.0

    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return radius_m * c


def should_auto_end(
    consecutive_hits: int,
    first_hit_ts: float,
    now_ts: float,
    min_consecutive_hits: int = 5,
    dwell_seconds: float = 12.0,
) -> bool:
    """Return True when either consecutive-hit or dwell-time condition is met."""
    if consecutive_hits >= min_consecutive_hits:
        return True
    return (now_ts - first_hit_ts) >= dwell_seconds
