import os
import time
import httpx
import pytest
from app.core.metrics_store import RedisMetricsStore
from app.core.config import settings

def is_server_reachable():
    """Helper to check if the server is running on localhost:8000."""
    try:
        # In docker exec, localhost:8000 refers to the container same container
        with httpx.Client(timeout=1.0) as client:
            resp = client.get("http://localhost:8000/api/v1/metrics")
            return resp.status_code == 200
    except Exception:
        return False

@pytest.mark.integration
@pytest.mark.skipif(not is_server_reachable(), reason="Uvicorn server not reachable on http://localhost:8000")
def test_metrics_cross_process_visibility():
    """
    Proves that metrics incremented in this process (pytest) are visible 
    in the running Uvicorn process via the HTTP metrics endpoint.
    Requires METRICS_BACKEND=redis and a shared Redis instance.
    """
    # Force redis backend for this test logic
    if settings.METRICS_BACKEND != "redis":
        pytest.skip("Test requires METRICS_BACKEND=redis")

    # Use a stable name to avoid high cardinality in Redis
    counter_name = "integration_test_hits_total"
    
    # 1. Clear key first to ensure predictable result
    store = RedisMetricsStore(settings.REDIS_URL)
    store._redis.delete(f"{store._prefix}counter:{counter_name}")
    
    # 2. Increment counter from Pytest process
    store.increment_counter(counter_name, 77)
    
    # 3. Fetch results from the running Uvicorn server process
    with httpx.Client() as client:
        # Test JSON format
        resp = client.get("http://localhost:8000/api/v1/metrics")
        assert resp.status_code == 200
        data = resp.json()
        assert data["counters"].get(counter_name) == 77
        
        # Test Prometheus format
        resp_prom = client.get("http://localhost:8000/api/v1/metrics?format=prometheus")
        assert resp_prom.status_code == 200
        # The store returns names without meetup_ prefix, export_prometheus_text adds it
        prom_metric_name = f"meetup_{counter_name}"
        assert f"{prom_metric_name} 77" in resp_prom.text
        assert 'meetup_build_info{version="beta-v0.1.0"} 1' in resp_prom.text
        assert f"# TYPE {prom_metric_name} counter" in resp_prom.text
