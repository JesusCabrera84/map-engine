# Map Engine

A robust, framework-agnostic map engine wrapper (currently focused on Google Maps) that provides advanced real-time vehicle tracking features.

## Features

### 🚀 Live Motion Controller

The engine includes a sophisticated `LiveMotionController` that handles high-frequency vehicle animation so you don't have to.

- **Dead Dead Reckoning**: Extrapolates vehicle position between GPS fixes for buttery smooth movement.
- **Visual vs Physical Bearing**: Decouples the visual rotation of the icon from the raw GPS course, interpolating smoothly (`lerpAngle`) to avoid "spinning top" effects.
- **Prediction Window**: Implements a 3-stage confidence model for signal loss:
  - **0-5s**: Full confidence (normal extrapolation).
  - **5-15s**: Decaying confidence (gradual slowdown).
  - **>15s**: Freeze (prevents vehicles from driving off into infinity).
- **Real Stopped Mode**: Detects when a vehicle is truly stopped to prevent micro-vibrations and erratic rotation changes due to GPS drift.
- **Backend Timestamp Priority**: Uses the actual event timestamp (`vehicle.ts`) rather than client reception time for accurate lag calculation.
- **Motion Policy**: Intelligently ignores non-motion-relevant alerts (like "Door Open") to prevent position jumps.

### 🎨 Marker Management

- **SVG Marker Support**: Automatically falls back to a high-quality, rotatable SVG arrow symbol if no custom icon URL is provided.
- **Rotation Support**: Markers rotate smoothly to match vehicle heading.
- **Performance**: Optimized to handle many vehicles simultaneously using `requestAnimationFrame`.

## Usage

### Installation

```bash
npm install @JesusCabrera84/map-engine
```

### Basic Setup

```typescript
import { GoogleMapEngine } from "@JesusCabrera84/map-engine";

const map = new GoogleMapEngine({
  apiKey: "YOUR_API_KEY",
  element: "map-container", // ID of the DOM element
  theme: "modern",
  streetViewControl: true, // Optional: Enable/Disable Street View Pegman (default: false)
});

await map.mount("map-container");
```

### Adding Vehicles

```typescript
map.addVehicleMarker({
  id: "123",
  lat: 19.4326,
  lng: -99.1332,
  course: 90,
  speed: 60,
  ts: Date.now(), // Optional but recommended
});
```

### Updating Vehicles

Simply call `updateVehicleMarker` with the new data. The engine handles the smoothing automatically.

```typescript
map.updateVehicleMarker({
  id: "123",
  lat: 19.4328,
  lng: -99.133,
  course: 95,
  speed: 62,
  ts: Date.now(),
});
```

### Direct Controller Access

You can import controllers directly if you need to build custom map implementations or extend functionality.

```typescript
import {
  TripReplayController,
  LiveMotionController,
} from "@JesusCabrera84/map-engine";
```

## Advanced Logic Details

### Signal Loss Policy

The engine monitors the "age" of the data (`now - lastFix.ts`).

- If a vehicle hasn't reported in >15 minutes (`MAX_STALE_MS`), it is marked as stopped.
- Visual movement adheres to the **Prediction Window** described above to ensure UX credibility.

### Stopped State

A vehicle is considered "stopped" if:

- Speed < 1 km/h.
- Ignition status is explicitly "OFF".
- An explicit "Turn Off" alert is received.

When stopped, the engine disables extrapolation and locks the bearing to prevent jitter.

## License

MIT
