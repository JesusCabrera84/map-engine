export {
    VehicleLike,
    ThemeName,
    IconConfig,
    IconResolver,
    InfoWindowRenderer,
    MapEngineOptions
} from './engine/types.js';

export { MapEngine } from './engine/MapEngine.js';
export { GoogleMapEngine } from './providers/google/GoogleMapEngine.js';

export {
    GeoPoint,
    LatLng,
    haversineDistance,
    computeBearing,
    extrapolatePosition,
    lerpPosition
} from './utils/geo.js';
