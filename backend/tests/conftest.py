"""
Shared pytest fixtures for backend tests.

This module provides database and client fixtures used across all tests.
"""

import pytest
import redis
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import settings
from app.core.database import SessionLocal
from app.main import app


@pytest.fixture(scope="function", autouse=True)
def clean_rate_limit_redis_keys():
    """Keep Redis-backed rate-limit and OTP state isolated between tests."""
    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    patterns = ("ratelimit:*", "otp:*", "auth_session:*")
    try:
        for pattern in patterns:
            keys = list(r.scan_iter(match=pattern))
            if keys:
                r.delete(*keys)
        yield
    finally:
        for pattern in patterns:
            keys = list(r.scan_iter(match=pattern))
            if keys:
                r.delete(*keys)
        r.close()


@pytest.fixture(scope="function")
def db():
    """Provide a database session with cleaned tables."""
    db = SessionLocal()
    try:
        # Clean tables before each test
        db.execute(text("TRUNCATE TABLE users, meet_requests, sessions, session_participants, audit_events, analytics_events, invites CASCADE"))
        db.commit()
        yield db
    finally:
        db.close()


@pytest.fixture(scope="function")
def client():
    """Provide a FastAPI test client."""
    return TestClient(app)
