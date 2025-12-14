import { haversineDistance, computeBearing, extrapolatePosition, lerpPosition } from '../../utils/geo.js';
import type { VehicleLike } from '../types.js';
import type { MarkerAdapter } from '../interfaces/MarkerAdapter.js';

interface LiveUnitState {
    lastFix: { lat: number; lon: number; ts: number }; // ts: wall-clock timestamp
    prevFix: { lat: number; lon: number; ts: number } | null;
    speed: number; // m/s
    bearing: number;
    virtualPosition: { lat: number; lon: number };
    lastUpdateTs: number;
    isStopped: boolean;
}

export class LiveMotionController {
    private liveVehicles = new Map<string | number, LiveUnitState>();
    private liveAnimationFrameId: number | null = null;
    private lastLiveFrameTime = 0;
    private readonly MAX_STALE_MS = 15 * 60 * 1000; // 15 minutes

    constructor(
        private markerAdapter: MarkerAdapter
    ) { }

    addVehicle(vehicle: VehicleLike): void {
        const id = vehicle.id || vehicle.device_id || vehicle.deviceId;
        if (!id) return;
        this.initLiveState(id, vehicle);
    }

    updateVehicle(vehicle: VehicleLike): void {
        const id = vehicle.id || vehicle.device_id || vehicle.deviceId;
        if (!id) return;

        const lat = Number(vehicle.lat || vehicle.latitude);
        const lng = Number(vehicle.lng || vehicle.longitude);

        if (!isNaN(lat) && !isNaN(lng)) {
            this.updateLiveState(id, vehicle, lat, lng);
        }
    }

    removeVehicle(id: string | number): void {
        this.liveVehicles.delete(id);
    }

    start(): void {
        if (typeof window === 'undefined') return;
        if (this.liveAnimationFrameId !== null) return;

        const animate = (time: number) => {
            if (!this.lastLiveFrameTime) this.lastLiveFrameTime = time;
            const delta = time - this.lastLiveFrameTime;
            this.lastLiveFrameTime = time;

            const dt = Math.min(delta, 100) / 1000; // cap 100ms
            const now = Date.now();

            this.liveVehicles.forEach((state, id) => {
                // Signal Loss Policy: Stop if no update for MAX_STALE_MS
                if (now - state.lastFix.ts > this.MAX_STALE_MS) {
                    state.isStopped = true;
                }

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

                this.markerAdapter.setMarkerPosition(id, state.virtualPosition.lat, state.virtualPosition.lon);
            });

            this.liveAnimationFrameId = requestAnimationFrame(animate);
        };

        this.liveAnimationFrameId = requestAnimationFrame(animate);
    }

    stop(): void {
        if (this.liveAnimationFrameId !== null) {
            cancelAnimationFrame(this.liveAnimationFrameId);
            this.liveAnimationFrameId = null;
            this.lastLiveFrameTime = 0;
        }
    }

    clear(): void {
        this.liveVehicles.clear();
    }

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

        const now = Date.now();
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
}
