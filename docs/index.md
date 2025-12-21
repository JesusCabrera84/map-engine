# Map Engine Documentation

This module provides a framework-agnostic engine for managing map interactions, specifically designed for fleet tracking and vehicle management capabilities. It currently supports Google Maps via the `GoogleMapEngine` provider.

## Key Features

- **Abstraction Layer**: `MapEngine` abstract class allows switching map providers.
- **Live Tracking**: Built-in "Dead Reckoning" animation loop for smooth vehicle movement updates.
- **Trip Playback**: Native support for drawing path polylines and animating vehicle movement along history.
- **Framework Agnostic**: No dependencies on UI frameworks (Svelte, React, Vue). All UI concerns (icons, HTML content) are injected via functions.

## Installation

```bash
npm install @JesusCabrera84/map-engine
```

## Usage

### Initialization

The engine is instantiated with configuration options, not as a singleton.

```typescript
import { GoogleMapEngine } from '@JesusCabrera84/map-engine';

const mapEngine = new GoogleMapEngine({
    container: 'map-div-id', // or HTMLElement
    apiKey: 'YOUR_GOOGLE_MAPS_KEY',
    theme: 'modern',
    // Define how to convert backend vehicle data into icon config
    iconResolver: (vehicle) => ({
        url: vehicle.online ? '/icons/car-active.png' : '/icons/car-inactive.png',
        size: [40, 40],
        anchor: [20, 20]
    }),
    // Define HTML content for info windows
    infoWindowRenderer: (vehicle) => `
        <div class="p-2">
            <h3>${vehicle.name}</h3>
            <p>Speed: ${vehicle.speed} km/h</p>
        </div>
    `,
    // Optional: Define map styles for themes
    styles: {
        modern: [...], // Google Maps JSON style
        dark: [...]
    }
});

// Mount the map
await mapEngine.mount('map-div-id');
```

### Managing Vehicles

```typescript
// Add or update a vehicle
mapEngine.updateVehicleMarker({
  id: 123,
  lat: 19.4326,
  lng: -99.1332,
  speed: 45,
  course: 90,
  // ...any other data used by your renderers
});

// Center view
mapEngine.centerOnVehicles([vehicle1, vehicle2]);
```

### Changing Themes

You can switch themes dynamically using `setTheme()`. The engine automatically updates map styles and background colors to match.

```typescript
// Switch to dark mode
mapEngine.setTheme("dark");

// Switch to light mode
mapEngine.setTheme("light");
```

**Built-in Background Colors:**

- **Modern**: `#0b1524` (Deep Blue)
- **Dark**: `#0f1115` (Almost Black)
- **Light/Default**: `#ffffff` (White)

These colors are set on the map container to prevent white flashes when zooming or loading tiles.

### Trip Animation

```typescript
// Draw route
const path = [
  { lat: 19.4, lng: -99.1 },
  { lat: 19.5, lng: -99.2 },
];
mapEngine.drawTripPolyline(path);

// Play animation
mapEngine.animateTrip(path, 20000, () => {
  console.log("Animation finished");
});
```

---

## Migration Guide & Legacy Comparison

This section outlines the mapping between the legacy `mapService.js` (Svelte-tied singleton) and the new `MapEngine` (Standalone Class).

| Legacy (`to_migrate/mapService.js`)   | New Equivalent (`src/providers/google/GoogleMapEngine.ts`) | Notes                                                                            |
| ------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `import { theme } from '$lib/stores'` | `mapEngine.setTheme('dark')`                               | Logic moved out. The app controls theme changes explicitly.                      |
| `import { unitIcons } ...`            | `options.iconResolver`                                     | Icons are no longer hardcoded. You pass a function to resolve them dynamically.  |
| `createVehicleInfoContent(vehicle)`   | `options.infoWindowRenderer`                               | HTML generation is injected. The engine does not know about your HTML structure. |
| `initialize(mapElement)`              | `mount(element)`                                           | Now returns a Promise. Initialization is explicit.                               |
| `updateVehicleMarker(vehicle)`        | `updateVehicleMarker(vehicle)`                             | Same name, but relies on injected `IconResolver` instead of internal logic.      |
| `startLiveAnimationLoop()`            | `constructor()` (Automatic)                                | The loop starts automatically but idles if no vehicles exist.                    |
| `drawTripPolyline(coords)`            | `drawTripPolyline(coords)`                                 | Logic preserved but decentered from Svelte stores.                               |
| `animateTrip(...)`                    | `animateTrip(...)`                                         | Animation logic preserved.                                                       |
| `computeBearing`, `haversine`...      | `import { ... } from './utils/geo'`                        | Math helpers extracted to pure utility module.                                   |
| **Global Singleton Instance**         | **New Class Instance**                                     | You must instantiate `new GoogleMapEngine()`. Allows multiple maps per page.     |

### Major Architectural Changes

1.  **Inversion of Control**: Instead of the map service importing `stores` or `constants`, the App passes these values (styles, icons, html) into the Engine constructor.
2.  **Statelessness**: The engine keeps internal state of markers/animations, but does not hold business logic state (like "what is effectively selected"). Use the API to tell it what to do.
3.  **Strict Typing**: All methods are TypeScript typed. `VehicleLike` interface allows flexibility while enforcing core geospatial properties.
