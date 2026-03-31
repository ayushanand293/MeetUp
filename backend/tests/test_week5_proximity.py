from app.core.proximity import adaptive_threshold_m, haversine_distance_m, should_auto_end


def test_adaptive_threshold_clamps_to_minimum() -> None:
    # Very accurate devices should still use at least 30m threshold.
    assert adaptive_threshold_m(3.0, 6.0) == 30.0


def test_adaptive_threshold_scales_with_accuracy() -> None:
    assert adaptive_threshold_m(18.0, 25.0) == 50.0


def test_adaptive_threshold_clamps_to_maximum() -> None:
    # Low accuracy should never exceed 60m threshold.
    assert adaptive_threshold_m(80.0, 70.0) == 60.0


def test_haversine_distance_reasonable_for_nearby_points() -> None:
    distance = haversine_distance_m(28.6139, 77.2090, 28.6140, 77.2091)
    assert 0.0 < distance < 20.0


def test_should_auto_end_by_consecutive_hits() -> None:
    assert should_auto_end(consecutive_hits=5, first_hit_ts=1000.0, now_ts=1002.0)


def test_should_auto_end_by_dwell_time() -> None:
    assert should_auto_end(consecutive_hits=2, first_hit_ts=1000.0, now_ts=1012.0)


def test_should_not_auto_end_early() -> None:
    assert not should_auto_end(consecutive_hits=3, first_hit_ts=1000.0, now_ts=1005.0)
