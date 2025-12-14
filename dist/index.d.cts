/**
 * Defines the core types for the Map Engine.
 */
/**
 * Represents a vehicle or device on the map.
 * Flexible structure to accommodate various backend data shapes.
 */
interface VehicleLike {
    id: string | number;
    device_id?: string | number;
    lat: number;
    lng: number;
    speed?: number;
    course?: number;
    msg_class?: number | string;
    alert?: boolean | number;
    engine_status?: boolean | number | string;
    [key: string]: any;
}
/**
 * Supported theme names, including custom strings.
 */
type ThemeName = "modern" | "dark" | "light" | (string & {});
/**
 * Configuration for a marker icon.
 */
interface IconConfig {
    url: string;
    /**
     * Size of the icon [width, height] in pixels.
     */
    size?: [number, number];
    /**
     * Anchor point [x, y] in pixels.
     */
    anchor?: [number, number];
}
/**
 * Function to resolve an icon for a specific vehicle.
 */
type IconResolver = (vehicle: VehicleLike) => IconConfig;
/**
 * Function to render content for the info window.
 * Returns an HTML string.
 */
type InfoWindowRenderer = (vehicle: VehicleLike) => string;
/**
 * Options for initializing the Map Engine.
 */
interface MapEngineOptions {
    /**
     * The container ID or HTMLElement where the map will be rendered.
     */
    container: string | HTMLElement;
    /**
     * Initial theme to apply.
     */
    theme?: ThemeName;
    /**
     * Custom logic to resolve icons for vehicles.
     */
    iconResolver?: IconResolver;
    /**
     * Custom logic to render info windows.
     */
    infoWindowRenderer?: InfoWindowRenderer;
    /**
     * Initial center of the map [lat, lng].
     */
    center?: [number, number] | {
        lat: number;
        lng: number;
    };
    /**
     * Initial zoom level.
     */
    zoom?: number;
    [key: string]: any;
}

/**
 * Abstract base class for Map Engines (e.g., Google Maps, Leaflet, Mapbox).
 * Defines the contract for interacting with the map.
 */
declare abstract class MapEngine {
    protected options: MapEngineOptions;
    constructor(options: MapEngineOptions);
    /**
     * Initializes and mounts the map to the specified DOM element.
     * @param element The container ID or HTMLElement.
     */
    abstract mount(element: string | HTMLElement): Promise<any>;
    /**
     * Adds a marker for a vehicle.
     */
    abstract addVehicleMarker(vehicle: VehicleLike): void;
    /**
     * Updates an existing vehicle marker (position, icon, content).
     */
    abstract updateVehicleMarker(vehicle: VehicleLike): void;
    /**
     * Removes a vehicle marker by ID.
     */
    abstract removeMarker(id: string | number): void;
    /**
     * Removes all markers from the map.
     */
    abstract clearAllMarkers(): void;
    /**
     * Centers the map to fit the given vehicles.
     */
    abstract centerOnVehicles(vehicles: VehicleLike[]): void;
    /**
     * Centers the map on a specific vehicle/location.
     */
    abstract setCenter(lat: number, lng: number): void;
    /**
     * Sets the zoom level.
     */
    abstract setZoom(zoom: number): void;
    /**
     * Draws a polyline for a trip/route.
     */
    abstract drawTripPolyline(coordinates: any[]): void;
    /**
     * Clears the current trip polyline.
     */
    abstract clearTripPolyline(): void;
    /**
     * Animates a vehicle along a path.
     */
    abstract animateTrip(coordinates: any[], totalDuration?: number, onFinish?: () => void): void;
    /**
     * Stops any active trip animation.
     */
    abstract stopTripAnimation(): void;
    /**
     * Updates the map theme.
     */
    setTheme(theme: ThemeName): void;
    /**
     * Internal method to handle theme changes in the specific implementation.
     */
    protected abstract onThemeChange(theme: ThemeName): void;
    /**
     * Cleans up resources.
     */
    abstract dispose(): void;
}

declare class GoogleMapEngine extends MapEngine {
    private map;
    private google;
    private markers;
    private tripMarkers;
    private currentPolyline;
    private liveVehicles;
    private liveAnimationFrameId;
    private lastLiveFrameTime;
    private vehicleMarker;
    private animationFrameId;
    private isPaused;
    private animationStartTime;
    private pausedTime;
    private totalAnimationTime;
    private animationPath;
    private onFinish;
    constructor(options: MapEngineOptions);
    mount(element: string | HTMLElement): Promise<google.maps.Map>;
    private getStylesForTheme;
    protected onThemeChange(theme: ThemeName): void;
    addVehicleMarker(vehicle: VehicleLike): void;
    updateVehicleMarker(vehicle: VehicleLike): void;
    removeMarker(id: string | number): void;
    clearAllMarkers(): void;
    private initLiveState;
    private updateLiveState;
    private isVehicleStopped;
    private startLiveAnimationLoop;
    centerOnVehicles(vehicles: VehicleLike[]): void;
    setCenter(lat: number, lng: number): void;
    setZoom(zoom: number): void;
    drawTripPolyline(coordinates: any[]): void;
    clearTripPolyline(): void;
    stopTripAnimation(): void;
    animateTrip(coordinates: any[], totalDuration?: number, onFinish?: () => void): void;
    private prepareAnimationPath;
    dispose(): void;
}

interface GeoPoint {
    lat: number;
    lng: number;
}
interface LatLng {
    lat: number;
    lng: number;
}
/**
 * Calculates the distance between two points in meters using the Haversine formula.
 */
declare function haversineDistance(coords1: {
    lat: number;
    lng?: number;
    lon?: number;
}, coords2: {
    lat: number;
    lng?: number;
    lon?: number;
}): number;
/**
 * Computes the bearing (heading) from one point to another in degrees (0-360).
 */
declare function computeBearing(lat1: number, lon1: number, lat2: number, lon2: number): number;
/**
 * Extrapolates a new position based on start point, speed, bearing and time delta.
 */
declare function extrapolatePosition(lat: number, lon: number, speedMps: number, bearingDeg: number, deltaSeconds: number): {
    lat: number;
    lon: number;
};
/**
 * Linearly interpolates between two positions.
 */
declare function lerpPosition(pos1: {
    lat: number;
    lon: number;
}, pos2: {
    lat: number;
    lon: number;
}, t: number): {
    lat: number;
    lon: number;
};

export { type GeoPoint, GoogleMapEngine, type IconConfig, type IconResolver, type InfoWindowRenderer, type LatLng, MapEngine, type MapEngineOptions, type ThemeName, type VehicleLike, computeBearing, extrapolatePosition, haversineDistance, lerpPosition };
