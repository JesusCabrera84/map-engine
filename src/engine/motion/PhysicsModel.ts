import type { LiveMotionInput } from '../types.js';
import { extrapolatePosition } from '../../utils/geo.js';
import type { PhysicsModel, MotionPose } from './types.js';

export class KinematicPhysicsModel implements PhysicsModel {
    // We keep track of the "physics" velocity, which might differ from the last reported speed
    // if we want to model inertia. For now, we trust the telemetry speed but allow integration.
    private currentSpeed = 0;
    private currentHeading = 0;

    step(currentPose: MotionPose, dt: number): MotionPose {
        // Integrate position
        const newPos = extrapolatePosition(
            currentPose.lat,
            currentPose.lng,
            this.currentSpeed,
            this.currentHeading,
            dt
        );

        // Simple uncertainty growth (more time = more uncertainty)
        // e.g. grows by 1 meter per second of blind prediction?
        const newUncertainty = currentPose.uncertaintyRadius + (this.currentSpeed * 0.1 * dt);

        return {
            lat: newPos.lat,
            lng: newPos.lon,
            heading: this.currentHeading,
            speed: this.currentSpeed,
            uncertaintyRadius: newUncertainty
        };
    }

    update(observation: LiveMotionInput): void {
        const speedMs = (observation.speedKmh || 0) * 1000 / 3600;
        this.currentSpeed = speedMs;

        if (observation.bearing !== undefined) {
            this.currentHeading = observation.bearing;
        }
    }
}
