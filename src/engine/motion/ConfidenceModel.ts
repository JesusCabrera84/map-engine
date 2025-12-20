import type { LiveMotionInput, LiveMotionPolicy } from '../types.js';
import type { ConfidenceModel, MotionState } from './types.js';

const DEFAULT_POLICY: LiveMotionPolicy = {
    fullConfidenceMs: 5000,
    decayMs: 10000,
    maxStaleMs: 15 * 60 * 1000
};

export class TimeBasedConfidenceModel implements ConfidenceModel {
    private lastUpdateTime: number = 0;
    private currentTime: number = 0;
    private policy: LiveMotionPolicy;

    constructor(policy?: Partial<LiveMotionPolicy>) {
        this.policy = { ...DEFAULT_POLICY, ...policy };
    }

    update(observation?: LiveMotionInput): void {
        const now = Date.now(); // Or use observation timestamp if we are strictly event driven
        this.lastUpdateTime = now;
        this.currentTime = now;
    }

    decay(dt: number): void {
        // dt is in seconds, convert to ms
        this.currentTime += (dt * 1000);
    }

    getConfidence(): number {
        const age = this.currentTime - this.lastUpdateTime;

        if (age < this.policy.fullConfidenceMs) {
            return 1.0;
        } else if (age < (this.policy.fullConfidenceMs + this.policy.decayMs)) {
            const decayStart = this.policy.fullConfidenceMs;
            const decayEnd = decayStart + this.policy.decayMs;
            return 1 - (age - decayStart) / (decayEnd - decayStart);
        } else {
            return 0.0;
        }
    }

    getState(): MotionState {
        const age = this.currentTime - this.lastUpdateTime;
        const confidence = this.getConfidence();

        if (age < this.policy.fullConfidenceMs) {
            return 'REAL';
        } else if (confidence > 0) {
            return 'COASTING';
        } else if (age > this.policy.maxStaleMs) {
            return 'FROZEN';
        } else {
            // In the gap between decay end and maxStale, we are "Predicted" but with 0 confidence?
            // Or maybe "Frozen"? 
            // Let's call it PREDICTED if we are still moving technically, but confidence is low.
            // Actually, if confidence is 0, we shouldn't trust position. 
            // But let's follow the buckets.
            return 'PREDICTED';
        }
    }
}
