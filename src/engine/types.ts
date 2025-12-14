/**
 * Defines the core types for the Map Engine.
 */

/**
 * Represents a vehicle or device on the map.
 * Flexible structure to accommodate various backend data shapes.
 */
export interface VehicleLike {
    id: string | number;
    device_id?: string | number;
    lat: number;
    lng: number;
    speed?: number;
    course?: number;
    msg_class?: number | string;
    alert?: boolean | number;
    engine_status?: boolean | number | string;
    // Allow other properties for flexibility
    [key: string]: any;
}

/**
 * Supported theme names, including custom strings.
 */
export type ThemeName = "modern" | "dark" | "light" | (string & {});

/**
 * Configuration for a marker icon.
 */
export interface IconConfig {
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
export type IconResolver = (vehicle: VehicleLike) => IconConfig;

/**
 * Function to render content for the info window.
 * Returns an HTML string.
 */
export type InfoWindowRenderer = (vehicle: VehicleLike) => string;

/**
 * Options for initializing the Map Engine.
 */
export interface MapEngineOptions {
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
    center?: [number, number] | { lat: number; lng: number };
    /**
     * Initial zoom level.
     */
    zoom?: number;
    [key: string]: any;
}
