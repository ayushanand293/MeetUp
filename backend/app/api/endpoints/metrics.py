"""Metrics endpoint for monitoring and observability."""

from fastapi import APIRouter, Query
from fastapi.responses import PlainTextResponse

from app.core.metrics import export_prometheus_text, get_metrics

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
