import os
import pytest
import redis
from app.core.metrics_store import InMemoryMetricsStore, RedisMetricsStore, get_metrics_store
from app.core.config import settings

@pytest.fixture
def clean_redis():
    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    # Be careful: only flush our keys or use a separate DB
    prefix = "meetup:metrics:"
    keys = r.keys(f"{prefix}*")
    if keys:
        r.delete(*keys)
    yield r
    keys = r.keys(f"{prefix}*")
    if keys:
        r.delete(*keys)

def test_in_memory_metrics_store():
    store = InMemoryMetricsStore()
    store.increment_counter("test_counter", 5)
    store.set_gauge("test_gauge", 42.5)
    
    snapshot = store.snapshot()
    assert snapshot["counters"]["test_counter"] == 5
    assert snapshot["gauges"]["test_gauge"] == 42.5

def test_redis_metrics_store(clean_redis):
    store = RedisMetricsStore(settings.REDIS_URL)
    store.increment_counter("redis_counter", 10)
    store.set_gauge("redis_gauge", 99.9)
    
    snapshot = store.snapshot()
    assert snapshot["counters"]["redis_counter"] == 10
    assert snapshot["gauges"]["redis_gauge"] == 99.9
    
    # Test increments
    store.increment_counter("redis_counter", 5)
    snapshot = store.snapshot()
    assert snapshot["counters"]["redis_counter"] == 15

def test_metrics_store_factory(monkeypatch):
    # Test memory fallback
    monkeypatch.setattr(settings, "METRICS_BACKEND", "memory")
    store = get_metrics_store()
    assert isinstance(store, InMemoryMetricsStore)
    
    # Test redis factory
    monkeypatch.setattr(settings, "METRICS_BACKEND", "redis")
    store = get_metrics_store()
    assert isinstance(store, RedisMetricsStore)
