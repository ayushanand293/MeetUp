/**
 * OpenRouteService routing client.
 * Free tier: 2,000 requests/day
 * Docs: https://openrouteservice.org/dev/#/api-docs
 */

const ORS_BASE = 'https://api.openrouteservice.org/v2';
const ORS_KEY = process.env.EXPO_PUBLIC_ORS_KEY;

export const TransportMode = {
    WALKING: { id: 'foot-walking', label: 'Walk', icon: '🚶' },
    CYCLING: { id: 'cycling-regular', label: 'Cycle', icon: '🚴' },
    DRIVING: { id: 'driving-car', label: 'Drive', icon: '🚗' },
};

/**
 * Fetch a route between two coordinates.
 * @param {Object} from  - { lat, lon }
 * @param {Object} to    - { lat, lon }
 * @param {string} profile - ORS profile string (e.g. 'foot-walking')
 * @returns {{ coordinates: Array, distanceM: number, durationSec: number } | null}
 */
export async function getRoute(from, to, profile = 'foot-walking') {
    if (!ORS_KEY) {
        console.warn('[ORS] EXPO_PUBLIC_ORS_KEY not set');
        return null;
    }
    try {
        const body = {
            coordinates: [
                [from.lon, from.lat],
                [to.lon, to.lat],
            ],
        };
        const resp = await fetch(`${ORS_BASE}/directions/${profile}/geojson`, {
            method: 'POST',
            headers: {
                Authorization: ORS_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!resp.ok) {
            const err = await resp.text();
            console.warn('[ORS] API error:', err);
            return null;
        }

        const data = await resp.json();
        const feature = data.features?.[0];
        if (!feature) return null;

        const coords = feature.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
        const summary = feature.properties.summary;

        return {
            coordinates: coords,           // [[lat, lon], ...] for Leaflet
            distanceM: summary.distance,   // metres
            durationSec: summary.duration, // seconds
        };
    } catch (err) {
        console.warn('[ORS] fetch failed:', err.message);
        return null;
    }
}

/** Format duration in seconds to human-readable string */
export function formatDuration(seconds) {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hrs}h ${rem}min` : `${hrs}h`;
}

/** Format distance in metres to human-readable string */
export function formatDistance(metres) {
    if (metres < 1000) return `${Math.round(metres)}m`;
    return `${(metres / 1000).toFixed(1)}km`;
}

/** Haversine distance between two coords (metres) */
export function haversineDistance(a, b) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const sinLat = Math.sin(dLat / 2);
    const sinLon = Math.sin(dLon / 2);
    const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
    return 2 * R * Math.asin(Math.sqrt(h));
}
