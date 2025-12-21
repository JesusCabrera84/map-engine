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
  alert?: boolean | number | string;
  engine_status?: boolean | number | string;
  /**
   * Configuration for a dynamic SVG icon.
   * Takes precedence over `icon.url` or default icons if present.
   * Allows the frontend to fully control the visual style (path, color, size).
   */
  icon?: SvgIconConfig;
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
  /**
   * Configuration for the live motion prediction policy.
   */
  liveMotionPolicy?: LiveMotionPolicy;
  /**
   * Enable or disable Street View control.
   * @default false
   */
  streetViewControl?: boolean;
  [key: string]: any;
}

export interface LiveMotionInput {
  id: string | number;
  lat: number;
  lng: number;
  speedKmh?: number;
  bearing?: number;
  timestamp?: number;

  motion?: {
    ignition?: "on" | "off";
    moving?: boolean;
  };
}

export interface LiveMotionPolicy {
  fullConfidenceMs: number;
  decayMs: number;
  maxStaleMs: number;
}

/**
 * contract SvgIconConfig
 *
 * Defines the visual style for a dynamic SVG-based marker.
 * This contract is designed for the frontend to dictate the appearance of the marker.
 * If provided, the engine will render a vector (SVG) instead of a PNG/static image.
 */
export interface SvgIconConfig {
  /**
   * The SVG path data (d attribute).
   * The path should be a valid SVG path string.
   * Example: "M10 10 L20 20 Z"
   */
  path: string;

  /**
   * Fill color of the SVG path.
   * Can be any valid CSS color string (hex, rgb, rgba).
   * @default "#FFFFFF" (or engine default)
   */
  fillColor?: string;

  /**
   * Opacity of the fill color (0.0 to 1.0).
   * @default 1.0
   */
  fillOpacity?: number;

  /**
   * Stroke color (border) of the SVG path.
   * Can be any valid CSS color string.
   * @default "transparent"
   */
  strokeColor?: string;

  /**
   * Thickness of the stroke in pixels.
   * @default 0
   */
  strokeWeight?: number;

  /**
   * Scale factor for the icon.
   * @default 1.0
   */
  scale?: number;

  /**
   * The position within the icon that anchors to the map coordinate.
   * Typically centered or at the bottom tip.
   * values are relative to the SVG coordinate system.
   */
  anchor?: {
    x: number;
    y: number;
  };
}
