from dataclasses import dataclass

import requests


@dataclass(frozen=True)
class PlaceResult:
    name: str
    address: str | None
    lat: float
    lon: float
    provider: str
    place_id: str | None


class PlacesProvider:
    def search(self, query: str, lat: float | None = None, lon: float | None = None, limit: int = 10) -> list[PlaceResult]:
        raise NotImplementedError


class NominatimPlacesProvider(PlacesProvider):
    endpoint = "https://nominatim.openstreetmap.org/search"

    def search(self, query: str, lat: float | None = None, lon: float | None = None, limit: int = 10) -> list[PlaceResult]:
        params = {
            "q": query,
            "format": "jsonv2",
            "addressdetails": 1,
            "limit": limit,
        }
        if lat is not None and lon is not None:
            # A small bounded viewbox nudges Nominatim toward nearby places without sending user identifiers.
            params["viewbox"] = f"{lon - 0.15},{lat + 0.15},{lon + 0.15},{lat - 0.15}"
            params["bounded"] = 0

        response = requests.get(
            self.endpoint,
            params=params,
            headers={"User-Agent": "MeetUpPlacesBeta/1.0"},
            timeout=4,
        )
        response.raise_for_status()
        results = []
        for item in response.json():
            try:
                name = item.get("name") or item.get("display_name", "").split(",", 1)[0].strip()
                if not name:
                    continue
                results.append(
                    PlaceResult(
                        name=name[:120],
                        address=(item.get("display_name") or "")[:240] or None,
                        lat=float(item["lat"]),
                        lon=float(item["lon"]),
                        provider="osm",
                        place_id=str(item.get("osm_id") or item.get("place_id") or ""),
                    )
                )
            except (KeyError, TypeError, ValueError):
                continue
        return results


places_provider: PlacesProvider = NominatimPlacesProvider()
