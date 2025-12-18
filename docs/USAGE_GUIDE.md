# Map Engine Controllers Documentation

This document describes how to implement and use the **LiveMotionController** and **TripReplayController** to provide live tracking animation and historical trip replay functionalities in a map application.

These controllers are designed to be map-provider agnostic where possible, though `TripReplayController` currently has direct dependencies on Google Maps types.

---

## 1. LiveMotionController

**Purpose**: Handles the real-time smooth animation of vehicle markers. It uses "dead reckoning" to predict vehicle movement between server updates, ensuring fluid motion instead of "jumping" markers. It also handles signal loss scenarios.

### 1.1. Concepts
- **Virtual Position**: The interpolated/extrapolated position shown on screen.
- **Real Position**: The last actual GPS coordinate received from the backend.
- **Dead Reckoning**: Predicting where the vehicle is *now* based on its last known speed and bearing.
- **Signal Loss Policy**: How to behave when no data is received for a certain time (e.g., stop moving, fade out).

### 1.2. Interfaces & Types

#### `LiveMotionPolicy`
Configuration for animation behavior.
```typescript
interface LiveMotionPolicy {
    fullConfidenceMs: number; // Time in ms to trust extrapolation fully (e.g., 5000)
    decayMs: number;          // Time in ms to gradually stop extrapolating (e.g., 10000)
    maxStaleMs: number;       // Time in ms after which vehicle is considered "stopped" if no data (e.g., 15 mins)
}
```

#### `MarkerAdapter`
Interface to decouple the controller from the map implementation.
```typescript
interface MarkerAdapter {
    setMarkerPosition(id: string | number, lat: number, lng: number): void;
    setMarkerRotation?(id: string | number, bearing: number): void;
}
```

#### `LiveMotionInput`
Standardized input structure for updates.
```typescript
interface LiveMotionInput {
    id: string | number;
    lat: number;
    lng: number;
    speedKmh?: number;
    bearing?: number; // 0-360
    timestamp?: number; // Epoch ms
    motion?: {
        moving?: boolean;   // Explicit moving flag
        ignition?: 'on' | 'off'; // Explicit ignition state
    };
}
```

### 1.3. Usage

#### Initialization
Instantiate the controller with an adapter implementation and optional policy overrides.

```typescript
// Example using Google Maps
const markerAdapter = {
    setMarkerPosition: (id, lat, lng) => {
        const marker = myMarkers.get(id);
        if (marker) marker.setPosition({ lat, lng });
    },
    setMarkerRotation: (id, bearing) => {
        const marker = myMarkers.get(id);
        // Implement rotation logic (e.g., changing icon or CSS rotation)
    }
};

const liveController = new LiveMotionController(markerAdapter, {
    fullConfidenceMs: 5000,
    decayMs: 5000
});

// Start the animation loop
liveController.start();
```

#### Feeding Data
Call `update()` whenever a new position is received from the backend/socket.

```typescript
liveController.update({
    id: 'vehicle-123',
    lat: 19.4326,
    lng: -99.1332,
    speedKmh: 45,
    bearing: 90,
    timestamp: Date.now()
});
```

#### Lifecycle
- `start()`: Starts the `requestAnimationFrame` loop.
- `stop()`: Stops the animation loop (CPU saving).
- `remove(id)`: Stops tracking/animating a specific ID.
- `clear()`: Removes all vehicles from tracking.

---

## 2. TripReplayController

**Purpose**: Replays a historical route (trip) on the map. It draws the route polyline and animates a marker along the path, simulating the playback of the trip.

### 2.1. Dependencies
Currently requires `google.maps.Map` and the `google` namespace.

### 2.2. Usage

#### Initialization
```typescript
const tripController = new TripReplayController(googleMapInstance, googleNamespace);
```

#### Loading Data
Input is an array of coordinate objects.
```typescript
const tripCoordinates = [
    { lat: 19.4, lng: -99.1, ts: 1600000000000 },
    { lat: 19.5, lng: -99.2, ts: 1600000010000 },
    // ...
];

// Loads data, draws polyline, fits bounds
tripController.load(tripCoordinates);
```

#### Playback Controls

- **Play**: Starts or restarts animation.
```typescript
tripController.play({
    duration: 30000, // Duration in ms for the whole trip
    // OR
    speed: 10 // Speed multiplier (if baseDuration is calculated from timestamps)
}, () => {
    console.log("Replay finished");
});
```

- **Pause/Resume**:
```typescript
tripController.pause();
tripController.resume();
```

- **Stop**: Stops animation and hides the vehicle marker.
```typescript
tripController.stop();
```

- **Clear**: Clears polyline, markers, and resets state.
```typescript
tripController.clearPolyline();
```

### 2.3. Logic Details
- **Stop Detection**: The controller automatically groups close points (< 5 meters) into "stops" and adds a pause duration during playback to simulate waiting time.
- **Interpolation**: Linear interpolation between points for smooth movement.
- **Polyline**: Draws a geodesic polyline for the path.
- **Alert Markers**: Automatically places markers for `ignition_on` / `ignition_off` events if they exist in the data stream.

---

## 3. Integration Strategy

**Important**: These controllers and the underlying `geo.js` utilities are **included** in the `@JesusCabrera84/map-engine` package. You do **not** need to recreate `geo.js` or copy the controller files if you are using this package.

### Using with `GoogleMapEngine` (Recommended)
If you are using `GoogleMapEngine`, these controllers are already integrated.
- Use `addVehicleMarker` / `updateVehicleMarker` to trigger Live Motion.
- Use `startLive()` / `stopLive()` to control the loop.
- Use `animateTrip(coords)` / `stopTripAnimation()` for replay behaviors.

### Using with Custom Map Providers
If you want to use the `LiveMotionController` with a different map provider (e.g. Leaflet) within the same context:

1.  **Import**: Import `LiveMotionController` from the package source.
    ```typescript
    import { LiveMotionController } from '../engine/controllers/LiveMotionController';
    ```
2.  **Logic**: The complex logic (smoothing, prediction, loop) is handled internally. `geo.ts` is used internally by the controller, so no extra setup is needed.
3.  **Adapter**: You simply need to implement the `MarkerAdapter` interface to tell the controller how to move *your* specific map markers.

```typescript
const myAdapter = {
    setMarkerPosition: (id, lat, lng) => { ... }, // Your map logic
    setMarkerRotation: (id, bearing) => { ... }   // Your map logic
};
const controller = new LiveMotionController(myAdapter);
```
