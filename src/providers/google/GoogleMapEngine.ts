/// <reference types="@types/google.maps" />
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { MapEngine } from '../../engine/MapEngine.js';
import type { MapEngineOptions, ThemeName, VehicleLike, IconConfig } from '../../engine/types.js';
import { LiveMotionController } from '../../engine/controllers/LiveMotionController.js';
import { TripReplayController } from '../../engine/controllers/TripReplayController.js';
import type { MarkerAdapter } from '../../engine/interfaces/MarkerAdapter.js';

export class GoogleMapEngine extends MapEngine {
    private map: google.maps.Map | null = null;
    private google: typeof google | null = null;
    private markers = new Map<string | number, { marker: google.maps.Marker; infoWindow: google.maps.InfoWindow }>();

    // Controllers
    private liveController: LiveMotionController;
    private tripController: TripReplayController | null = null;
    private markerAdapter: MarkerAdapter;

    constructor(options: MapEngineOptions) {
        super(options);

        this.markerAdapter = {
            setMarkerPosition: (id, lat, lng) => {
                const m = this.markers.get(id)?.marker;
                if (m && this.google) {
                    m.setPosition(new this.google.maps.LatLng(lat, lng));
                }
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

        this.google = google;

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

        this.map = new this.google!.maps.Map(el as HTMLElement, mapOptions);

        if (mapOptions.backgroundColor) {
            this.map.getDiv().style.backgroundColor = mapOptions.backgroundColor;
        }

        // Initialize TripController now that map is ready
        this.tripController = new TripReplayController(this.map, this.google);

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
        if (!this.map || !this.google) return;

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
                scaledSize: iconConfig.size ? new this.google!.maps.Size(iconConfig.size[0], iconConfig.size[1]) : null,
                anchor: iconConfig.anchor ? new this.google!.maps.Point(iconConfig.anchor[0], iconConfig.anchor[1]) : null
            };
        }

        const marker = new this.google.maps.Marker(markerOptions);

        let content = '';
        if (this.options.infoWindowRenderer) {
            content = this.options.infoWindowRenderer(vehicle);
        }
        const infoWindow = new this.google.maps.InfoWindow({ content });

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
                        scaledSize: iconConfig.size ? new this.google!.maps.Size(iconConfig.size[0], iconConfig.size[1]) : null,
                        anchor: iconConfig.anchor ? new this.google!.maps.Point(iconConfig.anchor[0], iconConfig.anchor[1]) : null
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

        // Reset Live Controller
        this.liveController.stop();
        this.liveController = new LiveMotionController(this.markerAdapter);
        this.liveController.start();
    }

    startLive(): void {
        this.liveController.start();
    }

    stopLive(): void {
        this.liveController.stop();
    }

    centerOnVehicles(vehicles: VehicleLike[]): void {
        if (!this.map || !this.google || !vehicles.length) return;
        const bounds = new this.google.maps.LatLngBounds();
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
