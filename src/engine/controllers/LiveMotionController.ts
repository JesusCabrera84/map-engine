import { haversineDistance, computeBearing, extrapolatePosition, lerpPosition, lerpAngle, clamp } from '../../utils/geo.js';
import type { VehicleLike } from '../types.js';
import type { MarkerAdapter } from '../interfaces/MarkerAdapter.js';

interface LiveUnitState {
    lastFix: { lat: number; lon: number; ts: number }; // ts: backend timestamp or now
    prevFix: { lat: number; lon: number; ts: number } | null;
    speed: number; // m/s
    bearing: number; // visual bearing (interpolated)
    targetBearing: number; // physical bearing (from GPS/course)
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
                // 1. Calculate age of the data
                const age = now - state.lastFix.ts;

                // Signal Loss Policy: Stop if no update for MAX_STALE_MS
                // We use age here (assuming system clocks are roughly synced or using wall clock fallback)
                // If using backend TS, 'now' should be Date.now(). If backend TS is from 10 mins ago, age is huge.
                if (age > this.MAX_STALE_MS) {
                    state.isStopped = true;
                }

                if (state.isStopped) {
                    state.virtualPosition = lerpPosition(
                        state.virtualPosition,
                        { lat: state.lastFix.lat, lon: state.lastFix.lon },
                        0.1
                    );
                } else {
                    // 2. Prediction Window
                    // 0-5s: Full extrapolation
                    // 5-15s: Decay
                    // >15s: Freeze
                    let confidence = 0;
                    if (age < 5000) {
                        confidence = 1;
                    } else if (age < 15000) {
                        confidence = 1 - (age - 5000) / 10000;
                    } else {
                        confidence = 0;
                    }

                    const effectiveSpeed = state.speed * confidence;

                    const projected = extrapolatePosition(
                        state.virtualPosition.lat,
                        state.virtualPosition.lon,
                        effectiveSpeed,
                        state.targetBearing, // extrapolate relative to target physical heading
                        dt
                    );

                    state.virtualPosition = lerpPosition(
                        projected,
                        { lat: state.lastFix.lat, lon: state.lastFix.lon },
                        0.05
                    );

                    // 3. Smooth Linearly Interpolated Bearing
                    // Lerp visual bearing towards physical targetBearing
                    state.bearing = lerpAngle(state.bearing, state.targetBearing, 0.15);
                }

                this.markerAdapter.setMarkerPosition(id, state.virtualPosition.lat, state.virtualPosition.lon);
                this.markerAdapter.setMarkerRotation?.(id, state.bearing);
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

        // 1. Backend timestamp preference
        // vehicle.ts might be seconds or ms, usually ms in modern systems, but check if user provided
        // standardizing on ms. If vehicle.ts is very small (unix seconds), multiply by 1000? 
        // For safty let's assume input is correct or try to parse
        let ts = Date.now();
        if (vehicle.ts) ts = Number(vehicle.ts);
        else if (vehicle.timestamp) ts = Number(vehicle.timestamp);
        else if (vehicle.created_at) ts = new Date(vehicle.created_at).getTime();

        const course = parseFloat(String(vehicle.course || 0));

        this.liveVehicles.set(id, {
            lastFix: { lat, lon: lng, ts },
            prevFix: null,
            speed: (speedKmh * 1000) / 3600, // m/s
            bearing: course,       // visual starts at actual
            targetBearing: course, // physical starts at actual
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

        // Policy: Motion Control
        if (!this.shouldAffectMotion(vehicle)) {
            return;
        }

        const now = Date.now(); // wall clock for age calc (locally) if needed, but we use fix ts for delta
        // Actually, we need the FIX timestamp for the record, not Date.now()
        let fixTs = Date.now();
        if (vehicle.ts) fixTs = Number(vehicle.ts);
        else if (vehicle.timestamp) fixTs = Number(vehicle.timestamp);
        else if (vehicle.created_at) fixTs = new Date(vehicle.created_at).getTime();

        const speedKmh = Number(vehicle.speed || 0);

        // Calculate stopped status first
        const newIsStopped = this.isVehicleStopped(vehicle);
        const isAlert = String(vehicle.msg_class) === 'Alert';

        state.prevFix = { ...state.lastFix };
        state.lastFix = { lat: newLat, lon: newLon, ts: fixTs };

        // Only update physical bearing if moving or alert
        if (!newIsStopped || isAlert) {
            if (state.prevFix) {
                const dist = haversineDistance(
                    { lat: state.prevFix.lat, lng: state.prevFix.lon },
                    { lat: newLat, lng: newLon }
                );
                if (dist > 2) {
                    state.targetBearing = computeBearing(state.prevFix.lat, state.prevFix.lon, newLat, newLon);
                } else if (vehicle.course) {
                    state.targetBearing = Number(vehicle.course);
                }
            }
        }

        state.speed = (speedKmh * 1000) / 3600;
        state.isStopped = newIsStopped;

        // Snap if too far
        const distVirtual = haversineDistance(
            { lat: state.virtualPosition.lat, lng: state.virtualPosition.lon },
            { lat: newLat, lng: newLon }
        );

        if (distVirtual > 500) {
            state.virtualPosition = { lat: newLat, lon: newLon };
        }
    }

    private shouldAffectMotion(vehicle: VehicleLike): boolean {
        if (String(vehicle.msg_class) === 'Alert') {
            const alert = String(vehicle.alert);
            return alert === 'Turn Off' || alert === 'Turn On';
        }
        return true;
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
