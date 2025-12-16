/// <reference types="@types/google.maps" />
import { haversineDistance } from '../../utils/geo.js';


type GoogleNamespace = typeof google;

export class TripReplayController {
    private tripMarkers: google.maps.Marker[] = [];
    private currentPolyline: google.maps.Polyline | null = null;
    private vehicleMarker: google.maps.Marker | null = null;

    // Data state
    private coordinates: any[] = [];
    private baseDuration = 0;

    // Animation state
    private animationFrameId: number | null = null;
    private isPaused = false;
    private animationStartTime = 0;
    private pausedTime = 0;
    private totalAnimationTime = 0;
    private animationPath: any[] = [];
    private onFinish: (() => void) | null = null;
    private lastPauseTime = 0;

    constructor(
        private map: google.maps.Map,
        private google: GoogleNamespace
    ) { }

    load(coordinates: any[]): void {
        this.stop();
        this.coordinates = coordinates || [];
        this.drawPolyline(this.coordinates);

        // Calculate base duration from timestamps if available
        if (this.coordinates.length >= 2) {
            const first = this.coordinates[0];
            const last = this.coordinates[this.coordinates.length - 1];
            if (first.ts && last.ts) {
                this.baseDuration = Number(last.ts) - Number(first.ts);
            } else if (first.timestamp && last.timestamp) { // Support alternative timestamp key
                this.baseDuration = new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime();
            } else {
                this.baseDuration = 10000; // Default 10s if no timestamps
            }
        }
    }

    drawPolyline(coordinates: any[]): void {
        this.clearPolyline();

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
                        const marker = new this.google.maps.Marker({
                            position: pos,
                            map: this.map,
                            icon: {
                                url: iconUrl,
                                scaledSize: new this.google.maps.Size(32, 32),
                                anchor: new this.google.maps.Point(16, 16)
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

    play(options: { speed?: number, duration?: number } = {}, onFinish?: () => void): void {
        if (!this.coordinates || this.coordinates.length < 2) return;

        // If already playing or paused, stop first to restart unless it's a resume
        // But user implies play starts from beginning or applies new options. 
        // Let's assume play() = restart with new options.
        this.stop();

        this.onFinish = onFinish || null;

        // Determine total duration
        let duration = options.duration;
        if (!duration && options.speed) {
            duration = this.baseDuration / options.speed;
        }
        if (!duration) duration = 10000; // Fallback

        const rawPath = this.coordinates.map(c => ({
            lat: Number(c.lat),
            lng: Number(c.lng || c.lon)
        })).filter(c => !isNaN(c.lat) && !isNaN(c.lng));

        this.animationPath = this.prepareAnimationPath(rawPath, duration);
        this.animationStartTime = performance.now();
        this.pausedTime = 0;
        this.isPaused = false;

        // Create vehicle marker reuse logic
        if (!this.vehicleMarker) {
            this.vehicleMarker = new this.google.maps.Marker({
                map: this.map,
                icon: {
                    url: 'https://cdn-icons-png.flaticon.com/512/3202/3202926.png',
                    scaledSize: new this.google.maps.Size(40, 40),
                    anchor: new this.google.maps.Point(20, 20)
                },
                zIndex: 1000
            });
        } else {
            this.vehicleMarker.setMap(this.map);
        }

        if (this.animationPath.length > 0) {
            const start = this.animationPath[0].type === 'move' ? this.animationPath[0].start : this.animationPath[0].position;
            this.vehicleMarker?.setPosition(start);
        }

        this.startAnimationLoop();
    }

    private startAnimationLoop(): void {
        const animate = (time: number) => {
            if (this.isPaused) {
                // Should not happen if we cancel RAF on pause, but safety check
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

                    // Update rotation if needed (not implemented in original but good to have)
                    // if (segment.bearing) ...
                }
            }
            this.animationFrameId = requestAnimationFrame(animate);
        };
        this.animationFrameId = requestAnimationFrame(animate);
    }

    stop(): void {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.vehicleMarker) {
            this.vehicleMarker.setMap(null);
        }
        this.isPaused = false;
        this.pausedTime = 0;
    }

    pause(): void {
        if (this.isPaused || !this.animationFrameId) return;
        this.isPaused = true;
        this.lastPauseTime = performance.now();
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    resume(): void {
        if (!this.isPaused) return;
        this.isPaused = false;
        // Calculate how long we were paused
        const now = performance.now();
        const pauseDuration = now - this.lastPauseTime;
        this.pausedTime += pauseDuration;

        this.startAnimationLoop();
    }

    clearPolyline(): void {
        if (this.currentPolyline) {
            this.currentPolyline.setMap(null);
            this.currentPolyline = null;
        }
        this.tripMarkers.forEach(m => m.setMap(null));
        this.tripMarkers = [];
        this.stop();
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
}
