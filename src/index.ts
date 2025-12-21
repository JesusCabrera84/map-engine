export type {
  VehicleLike,
  ThemeName,
  IconConfig,
  IconResolver,
  InfoWindowRenderer,
  MapEngineOptions,
} from "./engine/types.js";

export { MapEngine } from "./engine/MapEngine.js";
export { GoogleMapEngine } from "./providers/google/GoogleMapEngine.js";
export { TripReplayController } from "./engine/controllers/TripReplayController.js";
export { LiveMotionController } from "./engine/controllers/LiveMotionController.js";

export type { GeoPoint, LatLng } from "./utils/geo.js";

export {
  haversineDistance,
  computeBearing,
  extrapolatePosition,
  lerpPosition,
} from "./utils/geo.js";
