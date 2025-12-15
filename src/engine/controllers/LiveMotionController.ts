import { haversineDistance, computeBearing, extrapolatePosition, lerpPosition, lerpAngle } from '../../utils/geo.js';
import type { LiveMotionInput, LiveMotionPolicy } from '../types.js';
import type { MarkerAdapter } from '../interfaces/MarkerAdapter.js';

interface LiveUnitState {
    // Última posición REAL reportada por el backend
    realPosition: {
        lat: number;
        lon: number;
        ts: number;
        speed: number;
        bearing: number;
    };

    // Posición previa para cálculos de bearing si falta
    prevPosition: {
        lat: number;
        lon: number;
        ts: number;
    } | null;

    // Estado VISUAL (Interpolado/Extrapolado)
    virtualPosition: {
        lat: number;
        lon: number;
        bearing: number; // visual bearing
    };

    // Target físico para suavizado de rotación
    targetBearing: number;

    isStopped: boolean;
}

const DEFAULT_POLICY: LiveMotionPolicy = {
    fullConfidenceMs: 5000,
    decayMs: 10000,
    maxStaleMs: 15 * 60 * 1000
};

export class LiveMotionController {
    private liveVehicles = new Map<string | number, LiveUnitState>();
    private liveAnimationFrameId: number | null = null;
    private lastLiveFrameTime = 0;
    private policy: LiveMotionPolicy;

    constructor(
        private markerAdapter: MarkerAdapter,
        policy?: Partial<LiveMotionPolicy>
    ) {
        this.policy = { ...DEFAULT_POLICY, ...policy };
    }

    /**
     * Updates the state of a vehicle/unit based on standardized input.
     * Decoupled from backend models.
     */
    update(input: LiveMotionInput): void {
        const { id, lat, lng, speedKmh = 0, bearing, timestamp } = input;

        let state = this.liveVehicles.get(id);
        const now = timestamp || Date.now();
        const speedMs = (speedKmh * 1000) / 3600;

        // Determine if stopped based on explicit motion flag or speed
        // Logic: if input.motion.moving is defined, use it. Otherwise fallback to speed.
        let isStopped = false;
        if (input.motion?.moving !== undefined) {
            isStopped = !input.motion.moving;
        } else {
            isStopped = speedMs < 0.5;
        }

        // If ignition is explicitly off, force stop
        if (input.motion?.ignition === 'off') {
            isStopped = true;
        }

        if (!state) {
            // Initialize new state
            this.liveVehicles.set(id, {
                realPosition: { lat, lon: lng, ts: now, speed: speedMs, bearing: bearing || 0 },
                prevPosition: null,
                virtualPosition: { lat, lon: lng, bearing: bearing || 0 },
                targetBearing: bearing || 0,
                isStopped
            });
            return;
        }

        // --- UPDATE EXISTING STATE ---

        // Update real position references
        state.prevPosition = {
            lat: state.realPosition.lat,
            lon: state.realPosition.lon,
            ts: state.realPosition.ts
        };

        state.realPosition = {
            lat,
            lon: lng,
            ts: now,
            speed: speedMs,
            bearing: bearing || state.realPosition.bearing
        };

        state.isStopped = isStopped;

        // Update target bearing (Physical direction)
        // If bearing provided, use it. If not, calculate from movement.
        if (bearing !== undefined) {
            state.targetBearing = bearing;
        } else if (!isStopped && state.prevPosition) {
            const dist = haversineDistance(
                { lat: state.prevPosition.lat, lng: state.prevPosition.lon },
                { lat, lng }
            );
            // Only update derived bearing if moved enough to be significant
            if (dist > 2) {
                state.targetBearing = computeBearing(state.prevPosition.lat, state.prevPosition.lon, lat, lng);
            }
        }

        // Snap if too far (teleport detection)
        const distVirtual = haversineDistance(
            { lat: state.virtualPosition.lat, lng: state.virtualPosition.lon },
            { lat, lng }
        );

        if (distVirtual > 500) {
            state.virtualPosition.lat = lat;
            state.virtualPosition.lon = lng;
        }
    }

    remove(id: string | number): void {
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
                // Determine effective timestamp for age calculation
                // We use state.realPosition.ts. If it's a backend TS, it might be slightly offset from Date.now()
                // dependent on clock sync. Assuming reasonable sync or relative use.
                const age = now - state.realPosition.ts;

                // 1. Signal Loss Policy
                if (age > this.policy.maxStaleMs) {
                    state.isStopped = true;
                }

                if (state.isStopped) {
                    // Decay virtual position to real last known position
                    const nextPos = lerpPosition(
                        state.virtualPosition,
                        { lat: state.realPosition.lat, lon: state.realPosition.lon },
                        0.1 // fast settlement
                    );
                    state.virtualPosition = { ...nextPos, bearing: state.virtualPosition.bearing };
                } else {
                    // 2. Prediction Window (Configurable Policy)
                    let confidence = 0;
                    if (age < this.policy.fullConfidenceMs) {
                        confidence = 1;
                    } else if (age < (this.policy.fullConfidenceMs + this.policy.decayMs)) {
                        // Decay range
                        const decayStart = this.policy.fullConfidenceMs;
                        const decayEnd = decayStart + this.policy.decayMs;
                        confidence = 1 - (age - decayStart) / (decayEnd - decayStart);
                    } else {
                        confidence = 0;
                    }

                    const effectiveSpeed = state.realPosition.speed * confidence;

                    const projected = extrapolatePosition(
                        state.virtualPosition.lat,
                        state.virtualPosition.lon,
                        effectiveSpeed,
                        state.targetBearing,
                        dt
                    );

                    // Pull towards real position to correct drift
                    const nextVirtual = lerpPosition(
                        projected,
                        { lat: state.realPosition.lat, lon: state.realPosition.lon },
                        0.05
                    );
                    state.virtualPosition = { ...nextVirtual, bearing: state.virtualPosition.bearing };

                    // 3. Smooth Visual Rotation
                    state.virtualPosition.bearing = lerpAngle(
                        state.virtualPosition.bearing,
                        state.targetBearing,
                        0.15
                    );
                }

                this.markerAdapter.setMarkerPosition(id, state.virtualPosition.lat, state.virtualPosition.lon);
                this.markerAdapter.setMarkerRotation?.(id, state.virtualPosition.bearing);
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
}
