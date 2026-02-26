"""Metrics endpoint for monitoring and observability."""

from fastapi import APIRouter

from app.core.metrics import get_metrics

router = APIRouter()


@router.get("/metrics", tags=["monitoring"])
async def get_metrics_endpoint():
    """Get realtime metrics for the gateway.
    
    Returns metrics including:
    - Active WebSocket connections
    - Messages received/broadcasted
    - Validation errors
    - Rate limit hits
    - Session counts
    """
    metrics = get_metrics()
    return metrics.get_all()
