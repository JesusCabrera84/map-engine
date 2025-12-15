export interface GeoPoint {
    lat: number;
    lng: number; // standardized to lng but supporting lon for input if needed
}

export interface LatLng {
    lat: number;
    lng: number;
}

/**
 * Calculates the distance between two points in meters using the Haversine formula.
 */
export function haversineDistance(coords1: { lat: number; lng?: number; lon?: number }, coords2: { lat: number; lng?: number; lon?: number }): number {
    const R = 6371e3; // metres
    const lat1 = coords1.lat;
    const lon1 = coords1.lng ?? coords1.lon ?? 0;
    const lat2 = coords2.lat;
    const lon2 = coords2.lng ?? coords2.lon ?? 0;

    const φ1 = (lat1 * Math.PI) / 180; // φ, λ in radians
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in metres
}

/**
 * Computes the bearing (heading) from one point to another in degrees (0-360).
 */
export function computeBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Extrapolates a new position based on start point, speed, bearing and time delta.
 */
export function extrapolatePosition(lat: number, lon: number, speedMps: number, bearingDeg: number, deltaSeconds: number): { lat: number; lon: number } {
    const R = 6378137;
    const dist = speedMps * deltaSeconds;
    const δ = dist / R;
    const θ = (bearingDeg * Math.PI) / 180;

    const φ1 = (lat * Math.PI) / 180;
    const λ1 = (lon * Math.PI) / 180;

    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));

    const λ2 =
        λ1 +
        Math.atan2(
            Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
            Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
        );

    return {
        lat: (φ2 * 180) / Math.PI,
        lon: (λ2 * 180) / Math.PI
    };
}

/**
 * Linearly interpolates between two positions.
 */
export function lerpPosition(pos1: { lat: number; lon: number }, pos2: { lat: number; lon: number }, t: number): { lat: number; lon: number } {
    return {
        lat: pos1.lat + (pos2.lat - pos1.lat) * t,
        lon: pos1.lon + (pos2.lon - pos1.lon) * t
    };
}

/**
 * Linearly interpolates between two angles (in degrees), taking the shortest path.
 */
export function lerpAngle(start: number, end: number, t: number): number {
    const diff = ((end - start + 180) % 360 + 360) % 360 - 180;
    return (start + diff * t + 360) % 360;
}

/**
 * Clamps a value between a minimum and maximum.
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
