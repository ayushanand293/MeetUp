from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, Field, field_validator


ALLOWED_DESTINATION_PROVIDERS = {"osm"}


class DestinationPayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    address: str | None = Field(default=None, max_length=240)
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    provider: str = Field(..., min_length=1, max_length=40)
    place_id: str | None = Field(default=None, max_length=160)

    @field_validator("name", "address", "provider", "place_id")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        return stripped or None

    @field_validator("provider")
    @classmethod
    def provider_allowlist(cls, value: str) -> str:
        if value not in ALLOWED_DESTINATION_PROVIDERS:
            raise ValueError("Unsupported destination provider")
        return value


def destination_from_model(model: Any) -> dict[str, Any] | None:
    if model.destination_lat is None or model.destination_lon is None or not model.destination_name:
        return None
    return {
        "name": model.destination_name,
        "address": model.destination_address,
        "lat": model.destination_lat,
        "lon": model.destination_lon,
        "provider": model.destination_provider,
        "place_id": model.destination_place_id,
    }


def apply_destination(model: Any, destination: DestinationPayload | None) -> None:
    if destination is None:
        return
    model.destination_name = destination.name
    model.destination_address = destination.address
    model.destination_lat = destination.lat
    model.destination_lon = destination.lon
    model.destination_provider = destination.provider
    model.destination_place_id = destination.place_id


def copy_destination(source: Any, target: Any) -> None:
    target.destination_name = source.destination_name
    target.destination_address = source.destination_address
    target.destination_lat = source.destination_lat
    target.destination_lon = source.destination_lon
    target.destination_provider = source.destination_provider
    target.destination_place_id = source.destination_place_id


def destination_validation_exception(exc: Exception) -> HTTPException:
    return HTTPException(status_code=400, detail=f"Invalid destination: {exc}")
