"""Metrics endpoint for monitoring and observability."""

import json
from typing import Any
from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import PlainTextResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from app.api.deps import _get_jwks_keys
from app.core.config import settings
from app.core.database import get_db
from app.core.metrics import export_prometheus_text, get_metrics
from app.models.analytics_event import AnalyticsEvent

security = HTTPBearer(auto_error=False)
MAX_ANALYTICS_BODY_BYTES = 32 * 1024
MAX_ANALYTICS_EVENTS = 10

class AnalyticsEventIn(BaseModel):
    event_name: str = Field(min_length=1, max_length=120)
    properties: dict[str, Any] = Field(default_factory=dict)
    session_id: UUID | None = None


class AnalyticsBatchIn(BaseModel):
    events: list[AnalyticsEventIn] = Field(default_factory=list)


def _resolve_analytics_user_id(credentials: HTTPAuthorizationCredentials | None) -> UUID:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token = credentials.credentials
    try:
        unverified_header = jwt.get_unverified_header(token)
        alg = unverified_header.get("alg", "HS256")
        kid = unverified_header.get("kid")

        if alg == "ES256" and kid:
            keys = _get_jwks_keys()
            public_key = keys.get(kid)
            if not public_key:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
            payload = jwt.decode(token, public_key, algorithms=["ES256"], options={"verify_aud": False})
        else:
            payload = jwt.decode(token, settings.SUPABASE_KEY, algorithms=["HS256"], options={"verify_aud": False})

        return UUID(payload.get("sub"))
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials") from None

router = APIRouter()


@router.get("/metrics", tags=["monitoring"])
async def get_metrics_endpoint(format: str = Query(default="json", pattern="^(json|prometheus)$")):
    """Get realtime metrics for the gateway.

    Returns metrics including:
    - Active WebSocket connections
    - Messages received/broadcasted
    - Validation errors
    - Rate limit hits
    - Session counts
    """
    if format == "prometheus":
        return PlainTextResponse(export_prometheus_text(), media_type="text/plain; version=0.0.4")

    metrics = get_metrics()
    return metrics.get_all()


@router.post("/analytics/events", status_code=status.HTTP_204_NO_CONTENT)
async def ingest_analytics_events(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
):
    if not settings.ANALYTICS_ENABLED:
        return None

    body = await request.body()
    if len(body) > MAX_ANALYTICS_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Analytics payload too large")

    try:
        raw = json.loads(body.decode("utf-8") if body else "{}")
        if isinstance(raw, dict) and "events" in raw:
            parsed = AnalyticsBatchIn.model_validate(raw)
            events = parsed.events
        elif isinstance(raw, dict):
            # Backward-compatible single-event shape.
            event_name = raw.get("event_name") or raw.get("event")
            if not event_name:
                raise ValueError("Missing event_name")
            events = [
                AnalyticsEventIn(
                    event_name=str(event_name),
                    properties=raw.get("properties") or raw.get("metadata") or {},
                    session_id=raw.get("session_id"),
                )
            ]
        else:
            raise ValueError("Invalid analytics payload")
    except (json.JSONDecodeError, ValidationError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None

    if not events:
        return None
    if len(events) > MAX_ANALYTICS_EVENTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Too many analytics events")

    user_id = _resolve_analytics_user_id(credentials)
    rows = []
    for event in events:
        rows.append(
            AnalyticsEvent(
                user_id=user_id,
                session_id=event.session_id,
                event_name=event.event_name,
                properties=event.properties or {},
            )
        )

    db.add_all(rows)
    db.commit()
    return None
