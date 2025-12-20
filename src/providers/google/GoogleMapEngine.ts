/// <reference types="@types/google.maps" />
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { MapEngine } from '../../engine/MapEngine.js';
import type { MapEngineOptions, ThemeName, VehicleLike, IconConfig, LiveMotionInput, SvgIconConfig } from '../../engine/types.js';
import { LiveMotionController } from '../../engine/controllers/LiveMotionController.js';
import { TripReplayController } from '../../engine/controllers/TripReplayController.js';
import type { MarkerAdapter } from '../../engine/interfaces/MarkerAdapter.js';




function buildSvgIcon(config: SvgIconConfig): google.maps.Symbol {
    return {
        path: config.path,
        fillColor: config.fillColor || '#FFFFFF',
        fillOpacity: config.fillOpacity ?? 1,
        strokeColor: config.strokeColor || 'transparent',
        strokeWeight: config.strokeWeight ?? 0,
        scale: config.scale ?? 1,
        anchor: config.anchor ? new google.maps.Point(config.anchor.x, config.anchor.y) : null
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
                if (!icon) return;

                if (icon.url) return; // PNG/Image, ignoring

                // Check if it is a symbol
                if (typeof icon === 'object' && icon.path) {
                    // Update rotation only
                    const newIcon = { ...icon, rotation: bearing };
                    m.setIcon(newIcon);
                }

                // Basic throttle logic remains...
                const prev = lastRotation.get(id);
                if (prev !== undefined && Math.abs(prev - bearing) < 2) return;
                lastRotation.set(id, bearing);


            }
        };

        this.liveController = new LiveMotionController(this.markerAdapter, this.options.liveMotionPolicy);
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

    private adaptToInput(vehicle: VehicleLike, lat: number, lng: number, id: string | number): LiveMotionInput {
        const motion: LiveMotionInput['motion'] = {};

        if (vehicle.alert === 'Turn On') motion.ignition = 'on';
        else if (vehicle.alert === 'Turn Off') motion.ignition = 'off';

        if (vehicle.engine_status !== undefined) {
            const status = String(vehicle.engine_status).toLowerCase();
            motion.moving = status === '1' || status === 'true' || status === 'on';
        }

        const input: LiveMotionInput = {
            id,
            lat,
            lng,
            speedKmh: Number(vehicle.speed || 0),
            bearing: Number(vehicle.course || 0),
            motion
        };

        if (vehicle.ts) {
            input.timestamp = Number(vehicle.ts);
        } else if (vehicle.timestamp) {
            input.timestamp = Number(vehicle.timestamp);
        }

        return input;
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

        if (vehicle.icon) {
            markerOptions.icon = buildSvgIcon(vehicle.icon);
        } else if (iconConfig.url) {
            markerOptions.icon = {
                url: iconConfig.url,
                scaledSize: iconConfig.size ? new this.googleApi!.maps.Size(iconConfig.size[0], iconConfig.size[1]) : null,
                anchor: iconConfig.anchor ? new this.googleApi!.maps.Point(iconConfig.anchor[0], iconConfig.anchor[1]) : null
            };
        } else {
            // Default marker (empty config gives standard pin)
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

        this.liveController.update(this.adaptToInput(vehicle, lat, lng, id));
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

            if (vehicle.icon) {
                existing.marker.setIcon(buildSvgIcon(vehicle.icon));
            } else if (this.options.iconResolver) {
                const iconConfig = this.options.iconResolver(vehicle);
                if (iconConfig.url) {
                    existing.marker.setIcon({
                        url: iconConfig.url,
                        scaledSize: iconConfig.size ? new this.googleApi!.maps.Size(iconConfig.size[0], iconConfig.size[1]) : null,
                        anchor: iconConfig.anchor ? new this.googleApi!.maps.Point(iconConfig.anchor[0], iconConfig.anchor[1]) : null
                    });
                }
            }

            this.liveController.update(this.adaptToInput(vehicle, lat, lng, id));
        }
    }

    removeMarker(id: string | number): void {
        const data = this.markers.get(id);
        if (data) {
            data.marker.setMap(null);
            this.markers.delete(id);
        }
        this.liveController.remove(id);
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
            this.tripController.load(coordinates);
            this.tripController.play({ duration: totalDuration }, onFinish);
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
