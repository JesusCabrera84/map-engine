/// <reference types="@types/google.maps" />
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { MapEngine } from '../../engine/MapEngine.js';
import type { MapEngineOptions, ThemeName, VehicleLike, IconConfig } from '../../engine/types.js';
import { haversineDistance, computeBearing, extrapolatePosition, lerpPosition } from '../../utils/geo.js';
import type { LatLng } from '../../utils/geo.js';

interface LiveUnitState {
    lastFix: { lat: number; lon: number; ts: number };
    prevFix: { lat: number; lon: number; ts: number } | null;
    speed: number; // m/s
    bearing: number;
    virtualPosition: { lat: number; lon: number };
    lastUpdateTs: number;
    isStopped: boolean;
}

export class GoogleMapEngine extends MapEngine {
    private map: google.maps.Map | null = null;
    private google: typeof google | null = null;
    private markers = new Map<string | number, { marker: google.maps.Marker; infoWindow: google.maps.InfoWindow }>();
    private tripMarkers: google.maps.Marker[] = [];
    private currentPolyline: google.maps.Polyline | null = null;

    // Live Animation
    private liveVehicles = new Map<string | number, LiveUnitState>();
    private liveAnimationFrameId: number | null = null;
    private lastLiveFrameTime = 0;

    // Trip Animation
    private vehicleMarker: google.maps.Marker | null = null;
    private animationFrameId: number | null = null;
    private isPaused = false;
    private animationStartTime = 0;
    private pausedTime = 0;
    private totalAnimationTime = 0;
    private animationPath: any[] = [];
    private onFinish: (() => void) | null = null;

    constructor(options: MapEngineOptions) {
        super(options);
        // Start live animation loop immediately, it will be idle until markers are added
        this.startLiveAnimationLoop();
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

        // Default options + overrides
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
            ...this.options.mapOptions // allow overriding arbitrary google map options
        };

        const el = typeof element === 'string' ? document.getElementById(element) : element;
        if (!el) throw new Error('Map container element not found');

        this.map = new this.google!.maps.Map(el as HTMLElement, mapOptions);

        return this.map;
    }

    private getBackgroundColorForTheme(theme: ThemeName): string {
        switch (theme) {
            case 'modern': return '#0b1524';
            case 'dark': return '#0f1115';
            case 'light': default: return '#ffffff';
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
            console.log('[GoogleMapEngine] Applying styles count:', styles?.length, 'bg:', backgroundColor);
            this.map.setOptions({ styles, backgroundColor });
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

        // Use IconResolver
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

        // Info Window
        let content = '';
        if (this.options.infoWindowRenderer) {
            content = this.options.infoWindowRenderer(vehicle);
        }
        const infoWindow = new this.google.maps.InfoWindow({ content });

        marker.addListener('click', () => {
            infoWindow.open(this.map, marker);
        });

        this.markers.set(id, { marker, infoWindow });
        this.initLiveState(id, vehicle);
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
            // Update Info Window content
            if (this.options.infoWindowRenderer) {
                existing.infoWindow.setContent(this.options.infoWindowRenderer(vehicle));
            }

            // Update Icon
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

            // Update Live State (Dead Reckoning)
            this.updateLiveState(id, vehicle, lat, lng);
        }
    }

    removeMarker(id: string | number): void {
        const data = this.markers.get(id);
        if (data) {
            data.marker.setMap(null);
            this.markers.delete(id);
        }
        this.liveVehicles.delete(id);
    }

    clearAllMarkers(): void {
        this.markers.forEach(data => data.marker.setMap(null));
        this.markers.clear();
        this.liveVehicles.clear();
    }

    // ==========================================
    // LIVE ANIMATION
    // ==========================================

    private initLiveState(id: string | number, vehicle: VehicleLike) {
        const lat = Number(vehicle.lat || vehicle.latitude);
        const lng = Number(vehicle.lng || vehicle.longitude);
        const speedKmh = Number(vehicle.speed || 0);
        const ts = Date.now();

        this.liveVehicles.set(id, {
            lastFix: { lat, lon: lng, ts },
            prevFix: null,
            speed: (speedKmh * 1000) / 3600, // m/s
            bearing: parseFloat(String(vehicle.course || 0)),
            virtualPosition: { lat, lon: lng },
            lastUpdateTs: performance.now(),
            isStopped: this.isVehicleStopped(vehicle)
        });
    }

    private updateLiveState(id: string | number, vehicle: VehicleLike, newLat: number, newLon: number) {
        const state = this.liveVehicles.get(id);
        if (!state) {
            this.initLiveState(id, vehicle);
            return;
        }

        const now = performance.now();
        const speedKmh = Number(vehicle.speed || 0);

        state.prevFix = { ...state.lastFix };
        state.lastFix = { lat: newLat, lon: newLon, ts: now };

        if (state.prevFix) {
            const dist = haversineDistance(
                { lat: state.prevFix.lat, lng: state.prevFix.lon },
                { lat: newLat, lng: newLon }
            );
            if (dist > 2) {
                state.bearing = computeBearing(state.prevFix.lat, state.prevFix.lon, newLat, newLon);
            } else if (vehicle.course) {
                state.bearing = Number(vehicle.course);
            }
        }

        state.speed = (speedKmh * 1000) / 3600;
        state.isStopped = this.isVehicleStopped(vehicle);

        // Snap if too far
        const distVirtual = haversineDistance(
            { lat: state.virtualPosition.lat, lng: state.virtualPosition.lon },
            { lat: newLat, lng: newLon }
        );

        if (distVirtual > 500) {
            state.virtualPosition = { lat: newLat, lon: newLon };
        }
    }

    private isVehicleStopped(vehicle: VehicleLike): boolean {
        const speed = Number(vehicle.speed || 0);
        if (vehicle.msg_class === 'Alert') {
            if (String(vehicle.alert) === 'Turn Off') return true;
            if (String(vehicle.alert) === 'Turn On') return false;
        }
        if (String(vehicle.msg_class).toLowerCase() === 'status') {
            const status = String(vehicle.engine_status as any);
            if (status === 'OFF' || status === 'off' || status === 'false' || status === '0') return true;
            if (status === 'ON' || status === 'on' || status === 'true' || status === '1') return false;
        }
        return speed < 1;
    }

    private startLiveAnimationLoop() {
        if (typeof window === 'undefined') return;

        const animate = (time: number) => {
            if (!this.lastLiveFrameTime) this.lastLiveFrameTime = time;
            const delta = time - this.lastLiveFrameTime;
            this.lastLiveFrameTime = time;

            const dt = Math.min(delta, 100) / 1000; // cap 100ms

            this.liveVehicles.forEach((state, id) => {
                const markerData = this.markers.get(id);
                if (!markerData) return;

                if (state.isStopped) {
                    state.virtualPosition = lerpPosition(
                        state.virtualPosition,
                        { lat: state.lastFix.lat, lon: state.lastFix.lon },
                        0.1
                    );
                } else {
                    const projected = extrapolatePosition(
                        state.virtualPosition.lat,
                        state.virtualPosition.lon,
                        state.speed,
                        state.bearing,
                        dt
                    );
                    state.virtualPosition = lerpPosition(
                        projected,
                        { lat: state.lastFix.lat, lon: state.lastFix.lon },
                        0.05
                    );
                }

                if (this.google && markerData.marker) {
                    const newPos = new this.google.maps.LatLng(state.virtualPosition.lat, state.virtualPosition.lon);
                    markerData.marker.setPosition(newPos);
                }
            });

            this.liveAnimationFrameId = requestAnimationFrame(animate);
        };

        this.liveAnimationFrameId = requestAnimationFrame(animate);
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
    // TRIP POLYLINE & ANIMATION
    // ==========================================

    drawTripPolyline(coordinates: any[]): void {
        if (!this.map || !this.google) return;
        this.clearTripPolyline();

        if (!coordinates || coordinates.length === 0) return;

        const path: google.maps.LatLngLiteral[] = [];
        const bounds = new this.google.maps.LatLngBounds();

        coordinates.forEach(coord => {
            const lat = Number(coord.lat);
            const lng = Number(coord.lng || coord.lon);
            if (!isNaN(lat) && !isNaN(lng)) {
                const pos = { lat, lng };
                path.push(pos);
                bounds.extend(pos);

                // Markers for alerts/ignition
                if (coord.itemType === 'alert') {
                    let iconUrl = null;
                    if (coord.type === 'ignition_on') iconUrl = '/marker/marker-power-on.png';
                    else if (coord.type === 'ignition_off') iconUrl = '/marker/marker-power-off.png';

                    if (iconUrl) {
                        const marker = new this.google!.maps.Marker({
                            position: pos,
                            map: this.map,
                            icon: {
                                url: iconUrl,
                                scaledSize: new this.google!.maps.Size(32, 32),
                                anchor: new this.google!.maps.Point(16, 16)
                            },
                            title: coord.type
                        });
                        this.tripMarkers.push(marker);
                    }
                }
            }
        });

        this.currentPolyline = new this.google.maps.Polyline({
            path,
            geodesic: true,
            strokeColor: '#00FFFF',
            strokeOpacity: 1.0,
            strokeWeight: 4,
            map: this.map
        });

        this.map.fitBounds(bounds);
    }

    clearTripPolyline(): void {
        if (this.currentPolyline) {
            this.currentPolyline.setMap(null);
            this.currentPolyline = null;
        }
        this.tripMarkers.forEach(m => m.setMap(null));
        this.tripMarkers = [];
        this.stopTripAnimation();
    }

    stopTripAnimation(): void {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.vehicleMarker) {
            this.vehicleMarker.setMap(null);
        }
        this.isPaused = false;
    }

    animateTrip(coordinates: any[], totalDuration = 10000, onFinish?: () => void): void {
        if (!this.map || !this.google || !coordinates || coordinates.length < 2) return;
        this.stopTripAnimation();
        this.onFinish = onFinish || null;

        const rawPath = coordinates.map(c => ({
            lat: Number(c.lat),
            lng: Number(c.lng || c.lon)
        })).filter(c => !isNaN(c.lat) && !isNaN(c.lng));

        this.animationPath = this.prepareAnimationPath(rawPath, totalDuration);
        this.animationStartTime = performance.now();
        this.pausedTime = 0;
        this.isPaused = false;

        // Create vehicle marker reuse logic
        if (!this.vehicleMarker) {
            this.vehicleMarker = new this.google.maps.Marker({
                map: this.map,
                icon: {
                    // If we want a separate icon for trip, or use generic. 
                    // The original code used specific generic car. 
                    // We should probably allow customization or fallback.
                    url: 'https://cdn-icons-png.flaticon.com/512/3202/3202926.png', // Temporary fallback or use options?
                    // Actually the original code imported unitIcons and used generic one.
                    // Assuming we can rely on some default web URL or updated logic later.
                    // For now I'll use a placeholder or check if I can use iconResolver?
                    // But iconResolver resolves for a "VehicleLike". Here we are animating a trip.
                    // I will assume a default marker or reuse logic.
                    // Original: unitIcons['vehicle-car-sedan']
                    scaledSize: new this.google.maps.Size(40, 40),
                    anchor: new this.google.maps.Point(20, 20)
                },
                zIndex: 1000
            });
        } else {
            this.vehicleMarker.setMap(this.map);
        }

        // Attempt to set correct icon if possible, but trip coords might not have full vehicle info.
        // We will stick to the created marker.

        if (this.animationPath.length > 0) {
            const start = this.animationPath[0].type === 'move' ? this.animationPath[0].start : this.animationPath[0].position;
            this.vehicleMarker.setPosition(start);
        }

        const animate = (time: number) => {
            if (this.isPaused) {
                this.animationFrameId = requestAnimationFrame(animate);
                return;
            }

            const elapsed = time - this.animationStartTime - this.pausedTime;
            if (elapsed >= this.totalAnimationTime) {
                const last = this.animationPath[this.animationPath.length - 1];
                const end = last.type === 'move' ? last.end : last.position;
                this.vehicleMarker?.setPosition(end);
                this.isPaused = true;
                this.onFinish?.();
                return;
            }

            const segment = this.animationPath.find(s => elapsed >= s.startTime && elapsed < s.endTime);
            if (segment && this.vehicleMarker) {
                if (segment.type === 'stop') {
                    this.vehicleMarker.setPosition(segment.position);
                } else if (segment.type === 'move') {
                    const segElapsed = elapsed - segment.startTime;
                    const progress = segElapsed / segment.duration;
                    const lat = segment.start.lat + (segment.end.lat - segment.start.lat) * progress;
                    const lng = segment.start.lng + (segment.end.lng - segment.start.lng) * progress;
                    this.vehicleMarker.setPosition({ lat, lng });
                }
            }
            this.animationFrameId = requestAnimationFrame(animate);
        };

        this.animationFrameId = requestAnimationFrame(animate);
    }

    private prepareAnimationPath(rawPath: any[], totalDuration: number) {
        const segments: any[] = [];
        const STOP_THRESHOLD = 5;
        const STOP_PAUSE_DURATION = 400;
        let currentStop: any = null;

        for (let i = 0; i < rawPath.length - 1; i++) {
            const p1 = rawPath[i];
            const p2 = rawPath[i + 1];
            const dist = haversineDistance(p1, p2);

            if (dist < STOP_THRESHOLD) {
                if (!currentStop) {
                    currentStop = { type: 'stop', position: p1, duration: STOP_PAUSE_DURATION };
                    segments.push(currentStop);
                }
            } else {
                currentStop = null;
                segments.push({ type: 'move', start: p1, end: p2, distance: dist, duration: 0 });
            }
        }

        const totalMoveDist = segments.filter(s => s.type === 'move').reduce((acc, s) => acc + s.distance, 0);
        const totalStopDur = segments.filter(s => s.type === 'stop').reduce((acc, s) => acc + s.duration, 0);
        const availableMoveTime = Math.max(1000, totalDuration - totalStopDur);

        segments.forEach(s => {
            if (s.type === 'move') {
                s.duration = (s.distance / totalMoveDist) * availableMoveTime;
            }
        });

        let accumulated = 0;
        segments.forEach(s => {
            s.startTime = accumulated;
            accumulated += s.duration;
            s.endTime = accumulated;
        });

        this.totalAnimationTime = accumulated;
        return segments;
    }

    dispose(): void {
        if (this.liveAnimationFrameId) cancelAnimationFrame(this.liveAnimationFrameId);
        this.stopTripAnimation();
        this.clearAllMarkers();
        if (this.currentPolyline) this.currentPolyline.setMap(null);
        this.map = null;
    }
}
