import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api import deps
from app.core.rate_limit import enforce_rate_limit
from app.models.user import User
from app.services.places import places_provider

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/search")
async def search_places(
    q: str = Query(..., min_length=2, max_length=120),
    lat: float | None = Query(default=None, ge=-90, le=90),
    lon: float | None = Query(default=None, ge=-180, le=180),
    limit: int = Query(default=10, ge=1, le=10),
    current_user: User = Depends(deps.get_current_user),
):
    await enforce_rate_limit("places_search", current_user.id, 20, 60)
    try:
        results = places_provider.search(q.strip(), lat=lat, lon=lon, limit=limit)
    except Exception as exc:
        logger.warning("Places search provider failed: %s", exc.__class__.__name__)
        raise HTTPException(status_code=502, detail="Places search failed") from exc

    return [
        {
            "name": result.name,
            "address": result.address,
            "lat": result.lat,
            "lon": result.lon,
            "provider": result.provider,
            "place_id": result.place_id,
        }
        for result in results
    ]
