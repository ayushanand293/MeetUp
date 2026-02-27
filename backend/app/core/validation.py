"""Location data validation module."""

import math
from datetime import datetime


class LocationValidator:
    """Validates location updates for correctness and sanity."""

    # Earth's radius in kilometers
    EARTH_RADIUS_KM = 6371

    # Maximum reasonable horizontal speed: 300 km/h (highways)
    MAX_SPEED_KMH = 300

    # Maximum reasonable accuracy: 100 meters
    MAX_ACCURACY_M = 100

    # Minimum reasonable accuracy: 1 meter
    MIN_ACCURACY_M = 0.1

    # Time buffer for timestamp validation: 5 minutes
    TIMESTAMP_BUFFER_SECONDS = 300

    @staticmethod
    def validate_coordinates(lat: float, lon: float) -> tuple[bool, str | None]:
        """Validate latitude and longitude values."""
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            return False, "Latitude and longitude must be numbers"

        if lat < -90 or lat > 90:
            return False, f"Latitude must be between -90 and 90, got {lat}"

        if lon < -180 or lon > 180:
            return False, f"Longitude must be between -180 and 180, got {lon}"

        return True, None

    @staticmethod
    def validate_accuracy(accuracy_m: float) -> tuple[bool, str | None]:
        """Validate accuracy value."""
        if not isinstance(accuracy_m, (int, float)):
            return False, "Accuracy must be a number"

        if accuracy_m < 0:
            return False, f"Accuracy must be non-negative, got {accuracy_m}"

        if accuracy_m > LocationValidator.MAX_ACCURACY_M:
            return False, f"Accuracy too high: {accuracy_m}m (max {LocationValidator.MAX_ACCURACY_M}m)"

        return True, None

    @staticmethod
    def validate_timestamp(timestamp: datetime) -> tuple[bool, str | None]:
        """Validate timestamp is recent (within buffer window)."""
        now = datetime.utcnow()
        # Ensure both datetimes are naive UTC for comparison
        if timestamp.tzinfo is not None:
            import calendar
            # Convert aware timestamp to naive UTC
            timestamp = timestamp.replace(tzinfo=None)
        age = now - timestamp

        if age.total_seconds() < -LocationValidator.TIMESTAMP_BUFFER_SECONDS:
            return False, f"Timestamp is in the future (age: {age.total_seconds()}s)"

        if age.total_seconds() > LocationValidator.TIMESTAMP_BUFFER_SECONDS:
            return (
                False,
                f"Timestamp is stale (age: {age.total_seconds()}s, max {LocationValidator.TIMESTAMP_BUFFER_SECONDS}s)",
            )

        return True, None

    @staticmethod
    def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two coordinates (km)."""
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat = math.radians(lat2 - lat1)
        delta_lon = math.radians(lon2 - lon1)

        a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

        return LocationValidator.EARTH_RADIUS_KM * c

    @staticmethod
    def detect_impossible_jump(
        prev_lat: float,
        prev_lon: float,
        prev_timestamp: datetime,
        new_lat: float,
        new_lon: float,
        new_timestamp: datetime,
    ) -> tuple[bool, str | None]:
        """Detect if location jumped impossibly far in time."""
        distance_km = LocationValidator.haversine_distance(prev_lat, prev_lon, new_lat, new_lon)
        time_delta = (new_timestamp - prev_timestamp).total_seconds()

        # Avoid division by zero
        if time_delta <= 0:
            return False, "Timestamp didn't advance"

        # Calculate speed in km/h
        speed_kmh = (distance_km / time_delta) * 3600

        if speed_kmh > LocationValidator.MAX_SPEED_KMH:
            return False, f"Impossible speed: {speed_kmh:.1f} km/h (max {LocationValidator.MAX_SPEED_KMH} km/h)"

        return True, None


def validate_location_update(
    lat: float,
    lon: float,
    accuracy_m: float,
    timestamp: datetime,
    prev_location: dict | None = None,
) -> tuple[bool, str | None]:
    """
    Comprehensive location validation.

    Args:
        lat: Latitude
        lon: Longitude
        accuracy_m: Accuracy in meters
        timestamp: Timestamp of update
        prev_location: Previous location {lat, lon, timestamp} for jump detection

    Returns:
        (is_valid, error_message)
    """
    # Validate coordinates
    valid, error = LocationValidator.validate_coordinates(lat, lon)
    if not valid:
        return False, error

    # Validate accuracy
    valid, error = LocationValidator.validate_accuracy(accuracy_m)
    if not valid:
        return False, error

    # Validate timestamp
    valid, error = LocationValidator.validate_timestamp(timestamp)
    if not valid:
        return False, error

    # Detect impossible jumps if previous location exists
    if prev_location:
        valid, error = LocationValidator.detect_impossible_jump(
            prev_location["lat"],
            prev_location["lon"],
            prev_location["timestamp"],
            lat,
            lon,
            timestamp,
        )
        if not valid:
            return False, error

    return True, None
