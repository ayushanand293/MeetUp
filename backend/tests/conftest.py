"""
Shared pytest fixtures for backend tests.

This module provides database and client fixtures used across all tests.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.database import SessionLocal
from app.main import app


@pytest.fixture(scope="function")
def db():
    """Provide a database session with cleaned tables."""
    db = SessionLocal()
    try:
        # Clean tables before each test
        db.execute(text("TRUNCATE TABLE users, meet_requests, sessions, session_participants, audit_events, analytics_events CASCADE"))
        db.commit()
        yield db
    finally:
        db.close()


@pytest.fixture(scope="function")
def client():
    """Provide a FastAPI test client."""
    return TestClient(app)
