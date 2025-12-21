import type { MapEngineOptions, ThemeName, VehicleLike } from "./types.js";

/**
 * Abstract base class for Map Engines (e.g., Google Maps, Leaflet, Mapbox).
 * Defines the contract for interacting with the map.
 */
export abstract class MapEngine {
  protected options: MapEngineOptions;

  constructor(options: MapEngineOptions) {
    this.options = options;
  }

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
  abstract animateTrip(
    coordinates: any[],
    totalDuration?: number,
    onFinish?: () => void,
  ): void;

  /**
   * Stops any active trip animation.
   */
  abstract stopTripAnimation(): void;

  /**
   * Updates the map theme.
   */
  setTheme(theme: ThemeName): void {
    this.options.theme = theme;
    this.onThemeChange(theme);
  }

  /**
   * Internal method to handle theme changes in the specific implementation.
   */
  protected abstract onThemeChange(theme: ThemeName): void;

  /**
   * Starts the live tracking animation loop.
   */
  abstract startLive(): void;

  /**
   * Stops the live tracking animation loop to save resources.
   */
  abstract stopLive(): void;

  /**
   * Cleans up resources.
   */
  abstract dispose(): void;
}
