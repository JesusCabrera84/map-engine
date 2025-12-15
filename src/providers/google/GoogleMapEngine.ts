/// <reference types="@types/google.maps" />
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { MapEngine } from '../../engine/MapEngine.js';
import type { MapEngineOptions, ThemeName, VehicleLike, IconConfig } from '../../engine/types.js';
import { LiveMotionController } from '../../engine/controllers/LiveMotionController.js';
import { TripReplayController } from '../../engine/controllers/TripReplayController.js';
import type { MarkerAdapter } from '../../engine/interfaces/MarkerAdapter.js';


const DEFAULT_SVG_PATH = `M3780 6510 c-376 -17 -782 -56 -1110 -106 -334 -51 -726 -141 -887 -204 -282 -108 -642 -475 -952 -968 -39 -62 -120 -202 -180 -310 -59 -108 -159 -273 -220 -367 -124 -187 -189 -312 -220 -423 -27 -97 -45 -258 -38 -346 l5 -70 -53 -55 c-32 -34 -59 -74 -68 -101 -59 -178 -68 -407 -23 -610 32 -144 45 -175 47 -115 2 51 6 30 14 -70 7 -74 8 -77 21 -55 12 22 13 9 14 -110 0 -150 20 -364 45 -484 39 -188 81 -269 165 -316 42 -23 56 -25 216 -28 193 -4 224 3 266 59 29 39 45 83 54 155 9 76 -9 73 -40 -6 -15 -38 -40 -83 -56 -100 -30 -32 -59 -37 -154 -24 -43 6 -45 8 -31 24 35 38 80 223 107 435 18 143 16 626 -4 728 -8 42 -11 74 -7 70 9 -10 41 -122 95 -338 44 -176 54 -191 29 -45 -50 301 -111 512 -200 695 -80 166 -173 241 -263 215 -150 -43 -238 -219 -262 -527 -8 -103 -9 -101 -5 47 4 150 18 252 49 353 10 34 32 67 70 107 31 32 56 67 56 77 1 10 3 77 5 148 7 241 57 372 255 665 66 99 163 257 216 352 232 415 422 677 669 923 146 146 284 249 395 296 93 39 365 108 604 154 953 179 2196 201 3391 60 867 -103 1370 -240 1820 -494 435 -246 716 -470 1539 -1225 l338 -311 127 -43 c182 -63 367 -120 691 -212 530 -151 700 -206 970 -312 297 -117 588 -279 780 -435 93 -75 272 -258 294 -301 27 -52 44 -135 62 -295 9 -84 25 -185 35 -226 10 -41 19 -76 19 -78 0 -1 -17 -3 -38 -3 -20 0 -116 -9 -212 -20 -194 -22 -372 -26 -452 -9 -72 15 -172 64 -198 96 -13 17 -18 34 -14 47 39 131 173 240 524 425 194 103 205 110 192 123 -25 25 -283 -48 -448 -127 -258 -122 -398 -263 -411 -416 -12 -124 81 -218 272 -275 158 -48 521 3 749 104 57 25 58 25 69 6 6 -10 34 -44 63 -74 63 -66 71 -85 84 -198 11 -98 3 -242 -12 -202 -8 22 -10 23 -116 18 -193 -10 -328 -78 -387 -196 -1 -1 -21 16 -44 38 -57 54 -94 72 -166 77 -148 11 -2694 -147 -3092 -192 -73 -8 -135 -15 -138 -15 -3 0 -3 -5 0 -10 8 -13 417 -13 860 0 525 16 1247 40 1485 50 781 32 879 34 915 17 77 -37 122 -144 112 -271 -10 -134 -98 -354 -150 -376 -12 -5 -141 -19 -287 -30 -927 -73 -2531 -209 -3288 -280 -286 -27 -280 -27 -329 15 -23 19 -51 56 -63 81 -59 121 20 311 214 513 132 137 306 236 469 266 63 12 44 28 -26 21 -215 -22 -399 -124 -578 -322 l-57 -62 5 78 c6 87 -9 148 -53 212 -39 56 -69 70 -174 85 -138 19 -881 30 -940 13 -56 -15 -111 -71 -135 -137 -25 -71 -31 -240 -11 -326 28 -119 93 -215 160 -236 44 -14 489 -43 691 -45 191 -1 207 3 288 74 l43 38 -7 -51 c-14 -103 20 -198 97 -272 87 -85 33 -83 860 -26 689 49 2599 194 2971 226 94 8 184 20 200 25 72 28 141 126 193 277 l32 92 42 -21 c47 -24 165 -30 204 -9 12 6 22 10 22 7 0 -15 -84 -195 -114 -245 -39 -63 -92 -116 -133 -132 -25 -9 -837 -148 -1278 -218 -1233 -196 -2118 -289 -2967 -310 -828 -21 -1561 39 -2186 179 -204 45 -229 73 -435 485 -175 351 -170 338 -358 974 -108 366 -215 572 -393 759 -198 207 -387 311 -545 300 -182 -13 -313 -148 -411 -423 -73 -207 -132 -557 -129 -772 l1 -88 23 170 c27 203 48 316 81 450 105 418 272 626 483 601 191 -23 472 -262 619 -529 90 -162 134 -290 267 -767 88 -316 142 -463 224 -615 21 -38 62 -122 91 -185 109 -240 191 -351 299 -409 62 -33 203 -68 466 -116 929 -171 2026 -184 3394 -39 l244 26 51 -50 c60 -59 123 -93 226 -121 120 -33 217 -41 525 -48 403 -8 471 5 580 108 67 64 98 123 121 238 l18 89 491 81 c270 45 506 86 524 91 111 32 189 116 281 305 224 458 316 849 266 1133 -17 99 -40 155 -76 187 -49 43 -100 119 -115 168 -9 29 -24 129 -35 222 -35 302 -57 351 -240 536 -191 192 -375 323 -655 464 -329 167 -601 261 -1410 490 -497 141 -668 199 -719 244 -22 20 -155 142 -295 271 -462 427 -712 646 -916 805 -399 310 -741 510 -1105 647 -451 169 -1184 290 -2127 353 -274 18 -1042 27 -1313 15z m-3340 -2935 c27 -14 78 -71 113 -127 26 -42 20 -45 -15 -11 -65 63 -149 72 -216 23 -68 -49 -114 -138 -147 -285 -16 -75 -19 -34 -4 72 33 242 153 388 269 328z m22 -262 c45 -49 92 -209 117 -398 38 -280 29 -858 -15 -1008 -4 -12 -12 -16 -21 -13 -12 5 -14 1 -10 -14 5 -20 2 -21 -41 -14 -60 8 -111 32 -134 64 -21 30 -53 154 -68 265 -6 44 -13 177 -17 296 -11 391 36 737 113 828 27 33 42 32 76 -6z m12102 -1601 c-20 -56 -52 -168 -73 -248 l-37 -146 -67 -4 c-77 -5 -100 4 -127 49 -26 42 -26 170 -1 242 23 67 84 112 226 169 61 24 111 43 112 42 1 -1 -14 -48 -33 -104z m-4758 -188 c33 -22 70 -87 83 -146 28 -125 -82 -349 -202 -410 -47 -24 -19 -25 -521 16 -288 23 -300 25 -317 47 -49 66 -73 245 -45 341 9 31 21 60 27 64 7 4 100 13 208 20 400 27 712 61 730 79 7 7 10 6 37 -11z m3322 -1121 c-27 -49 -60 -99 -71 -111 -28 -31 -92 -68 -139 -80 -56 -15 -832 3 -930 22 -82 15 -168 44 -168 56 0 4 64 15 143 24 200 25 723 100 972 140 116 18 218 34 227 35 12 1 4 -20 -34 -86z`;

function buildSvgSymbol(bearing: number): google.maps.Symbol {
    return {
        path: DEFAULT_SVG_PATH,
        rotation: bearing,
        scale: 0.02,
        fillOpacity: 1,
        strokeWeight: 0,
    };
}

export class GoogleMapEngine extends MapEngine {
    private map: google.maps.Map | null = null;
    private googleApi: typeof google | null = null;
    private markers = new Map<string | number, { marker: google.maps.Marker; infoWindow: google.maps.InfoWindow }>();

    // Controllers
    private liveController: LiveMotionController;
    private tripController: TripReplayController | null = null;
    private markerAdapter: MarkerAdapter;

    constructor(options: MapEngineOptions) {
        super(options);

        const lastRotation = new Map<string | number, number>();

        this.markerAdapter = {
            setMarkerPosition: (id, lat, lng) => {
                const m = this.markers.get(id)?.marker;
                if (m && this.googleApi) {
                    m.setPosition(new this.googleApi.maps.LatLng(lat, lng));
                }
            },
            setMarkerRotation: (id, bearing) => {
                const m = this.markers.get(id)?.marker;
                if (!m) return;

                // If PNG, don't rotate
                const icon: any = m.getIcon();
                if (icon?.url) return;

                // Basic throttle
                const prev = lastRotation.get(id);
                if (prev !== undefined && Math.abs(prev - bearing) < 2) return;
                lastRotation.set(id, bearing);

                m.setIcon(buildSvgSymbol(bearing));
            }
        };

        this.liveController = new LiveMotionController(this.markerAdapter);
        this.liveController.start();
    }

    async mount(element: string | HTMLElement): Promise<google.maps.Map> {
        const apiKey = this.options.apiKey || (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
            throw new Error('Google Maps API Key is required');
        }

        setOptions({
            key: apiKey,
            v: 'weekly',
            libraries: ['places']
        });

        await importLibrary('maps');
        await importLibrary('marker');

        this.googleApi = google;

        const initialTheme: ThemeName = this.options.theme || 'modern';
        const styles = this.getStylesForTheme(initialTheme);
        const backgroundColor = this.getBackgroundColorForTheme(initialTheme);

        const mapOptions: google.maps.MapOptions = {
            backgroundColor: this.options.backgroundColor || backgroundColor,
            center: this.options.center || { lat: 19.4326, lng: -99.1332 },
            zoom: this.options.zoom || 13,
            fullscreenControl: true,
            streetViewControl: false,
            mapTypeControl: false,
            zoomControl: true,
            styles: (styles as any) || undefined,
            disableDefaultUI: true,
            ...this.options.mapOptions
        };

        const el = typeof element === 'string' ? document.getElementById(element) : element;
        if (!el) throw new Error('Map container element not found');

        this.map = new this.googleApi!.maps.Map(el as HTMLElement, mapOptions);

        if (mapOptions.backgroundColor) {
            this.map.getDiv().style.backgroundColor = mapOptions.backgroundColor;
        }

        // Initialize TripController now that map is ready
        this.tripController = new TripReplayController(this.map, this.googleApi);

        return this.map;
    }

    private getBackgroundColorForTheme(theme: ThemeName): string {
        switch (theme) {
            case 'modern': return '#0b1524';
            case 'dark': return '#0B1524';
            case 'light': default: return '#0F1115';
        }
    }

    private getStylesForTheme(theme: ThemeName): google.maps.MapTypeStyle[] | null {
        if (this.options.styles && this.options.styles[theme]) {
            return this.options.styles[theme];
        }
        return null;
    }

    protected onThemeChange(theme: ThemeName): void {
        console.log('[GoogleMapEngine] onThemeChange called with:', theme);
        if (this.map) {
            const styles = this.getStylesForTheme(theme);
            const backgroundColor = this.getBackgroundColorForTheme(theme);
            const styleCount = styles ? `${styles.length} rules` : 'Default (null)';
            console.log(`[GoogleMapEngine] Applying styles: ${styleCount}, bg: ${backgroundColor}`);
            this.map.setOptions({ styles, backgroundColor });
            this.map.getDiv().style.backgroundColor = backgroundColor;
        } else {
            console.warn('[GoogleMapEngine] Map not initialized, skipping theme update');
        }
    }

    addVehicleMarker(vehicle: VehicleLike): void {
        if (!this.map || !this.googleApi) return;

        const lat = Number(vehicle.lat || vehicle.latitude);
        const lng = Number(vehicle.lng || vehicle.longitude);
        const id = vehicle.id || vehicle.device_id || vehicle.deviceId;

        if (isNaN(lat) || isNaN(lng) || !id) {
            console.warn('Invalid coords or ID for vehicle', vehicle);
            return;
        }

        const position = { lat, lng };

        let iconConfig: IconConfig = { url: '' };
        if (this.options.iconResolver) {
            iconConfig = this.options.iconResolver(vehicle);
        }

        const markerOptions: google.maps.MarkerOptions = {
            position,
            map: this.map,
            title: String(vehicle.device_id || id),
        };

        if (iconConfig.url) {
            markerOptions.icon = {
                url: iconConfig.url,
                scaledSize: iconConfig.size ? new this.googleApi!.maps.Size(iconConfig.size[0], iconConfig.size[1]) : null,
                anchor: iconConfig.anchor ? new this.googleApi!.maps.Point(iconConfig.anchor[0], iconConfig.anchor[1]) : null
            };
        } else {
            markerOptions.icon = buildSvgSymbol(Number(vehicle.course || 0));
        }

        const marker = new this.googleApi.maps.Marker(markerOptions);

        let content = '';
        if (this.options.infoWindowRenderer) {
            content = this.options.infoWindowRenderer(vehicle);
        }
        const infoWindow = new this.googleApi.maps.InfoWindow({ content });

        marker.addListener('click', () => {
            infoWindow.open(this.map, marker);
        });

        this.markers.set(id, { marker, infoWindow });

        this.liveController.addVehicle(vehicle);
    }

    updateVehicleMarker(vehicle: VehicleLike): void {
        const id = vehicle.id || vehicle.device_id || vehicle.deviceId;
        const existing = this.markers.get(id);

        if (!existing) {
            this.addVehicleMarker(vehicle);
            return;
        }

        const lat = Number(vehicle.lat || vehicle.latitude);
        const lng = Number(vehicle.lng || vehicle.longitude);

        if (!isNaN(lat) && !isNaN(lng)) {
            if (this.options.infoWindowRenderer) {
                existing.infoWindow.setContent(this.options.infoWindowRenderer(vehicle));
            }

            if (this.options.iconResolver) {
                const iconConfig = this.options.iconResolver(vehicle);
                if (iconConfig.url) {
                    existing.marker.setIcon({
                        url: iconConfig.url,
                        scaledSize: iconConfig.size ? new this.googleApi!.maps.Size(iconConfig.size[0], iconConfig.size[1]) : null,
                        anchor: iconConfig.anchor ? new this.googleApi!.maps.Point(iconConfig.anchor[0], iconConfig.anchor[1]) : null
                    });
                }
            }

            this.liveController.updateVehicle(vehicle);
        }
    }

    removeMarker(id: string | number): void {
        const data = this.markers.get(id);
        if (data) {
            data.marker.setMap(null);
            this.markers.delete(id);
        }
        this.liveController.removeVehicle(id);
    }

    clearAllMarkers(): void {
        this.markers.forEach(data => data.marker.setMap(null));
        this.markers.clear();

        // Clear controller state
        this.liveController.clear();
    }

    startLive(): void {
        this.liveController.start();
    }

    stopLive(): void {
        this.liveController.stop();
    }

    centerOnVehicles(vehicles: VehicleLike[]): void {
        if (!this.map || !this.googleApi || !vehicles.length) return;
        const bounds = new this.googleApi.maps.LatLngBounds();
        let hasValid = false;
        vehicles.forEach(v => {
            const lat = Number(v.lat || v.latitude);
            const lng = Number(v.lng || v.longitude);
            if (!isNaN(lat) && !isNaN(lng)) {
                bounds.extend({ lat, lng });
                hasValid = true;
            }
        });
        if (hasValid) {
            this.map.fitBounds(bounds);
        }
    }

    setCenter(lat: number, lng: number): void {
        if (this.map) {
            this.map.setCenter({ lat, lng });
        }
    }

    setZoom(zoom: number): void {
        if (this.map) {
            this.map.setZoom(zoom);
        }
    }

    // ==========================================
    // TRIP POLYLINE & ANIMATION DELEGATION
    // ==========================================

    drawTripPolyline(coordinates: any[]): void {
        if (this.tripController) {
            this.tripController.drawPolyline(coordinates);
        }
    }

    clearTripPolyline(): void {
        if (this.tripController) {
            this.tripController.clearPolyline();
        }
    }

    stopTripAnimation(): void {
        if (this.tripController) {
            this.tripController.stop();
        }
    }

    animateTrip(coordinates: any[], totalDuration = 10000, onFinish?: () => void): void {
        if (this.tripController) {
            this.tripController.play(coordinates, totalDuration, onFinish);
        }
    }

    dispose(): void {
        this.liveController.stop();
        if (this.tripController) {
            this.tripController.stop();
            this.tripController.clearPolyline();
        }
        this.clearAllMarkers();
        this.map = null;
    }
}
