/**
 * Adapter to manipulate markers without knowing the specific map implementation.
 * Used by controllers (LiveMotion) to update visuals.
 */
export interface MarkerAdapter {
    /**
     * Updates the position of a specific marker.
     * The controller just passes the new coordinates.
     */
    setMarkerPosition(id: string | number, lat: number, lng: number): void;

    /**
     * Optional: Updates the rotation/bearing of a marker.
     */
    setRotation?(id: string | number, bearing: number): void;

    /**
     * Optional: Updates the stale state of a marker (e.g. fade out).
     */
    setStale?(id: string | number, isStale: boolean): void;
}
