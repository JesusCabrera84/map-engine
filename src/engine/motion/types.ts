/**
 * Core types for the Predictive Motion Engine (Stage 3).
 */

import { LiveMotionInput } from '../types.js';

/**
 * The cognitive state of the motion engine.
 * - REAL: We have recent, trusted data.
 * - COASTING: Data is slightly stale, but we trust the physics.
 * - PREDICTED: We are actively predicting beyond trusted data (e.g. latency compensation).
 * - FROZEN: Data is too old or unreliable; we have stopped moving.
 */
export type MotionState = 'REAL' | 'COASTING' | 'PREDICTED' | 'FROZEN';

/**
 * A snapshot of the vehicle's physical posistion and movement.
 */
export interface MotionPose {
    lat: number;
    lng: number;
    heading: number; // degrees, 0-360
    speed: number;   // meters per second

    /**
     * Estimated radius of uncertainty in meters.
     * Use this to render accuracy halos.
     */
    uncertaintyRadius: number;
}

/**
 * Intent classification.
 * Helps decide how strictly to follow heading vs. path.
 */
export interface Intent {
    action: 'STRAIGHT' | 'TURN' | 'STOP' | 'UNKNOWN';
    confidence: number; // 0.0 to 1.0
}

/**
 * The complete output of the Motion Engine for a single frame.
 */
export interface MotionEstimate {
    pose: MotionPose;
    state: MotionState;
    intent: Intent;
    /**
     * Timestamp of this estimate (virtual time).
     */
    timestamp: number;
}

// --- Component Interfaces ---

export interface PhysicsModel {
    /**
     * Integrates the position forward in time.
     */
    step(currentPose: MotionPose, dt: number): MotionPose;

    /**
     * Updates internal physics state based on a new real observation.
     */
    update(observation: LiveMotionInput): void;
}

export interface ConfidenceModel {
    /**
     * Updates confidence state based on new observation (or lack thereof).
     */
    update(observation?: LiveMotionInput): void;

    /**
     * Decays confidence over time.
     */
    decay(dt: number): void;

    /**
     * Returns the current confidence score (0.0 - 1.0).
     */
    getConfidence(): number;

    /**
     * Returns the appropriate MotionState based on current confidence.
     */
    getState(): MotionState;
}

export interface IntentModel {
    /**
     * Analyzes recent history to determine intent.
     */
    update(observation: LiveMotionInput): void;

    /**
     * Returns current intent.
     */
    getIntent(): Intent;
}

export interface NetworkBuffer {
    /**
     * Adds a raw packet to the buffer.
     */
    push(packet: LiveMotionInput): void;

    /**
     * Returns the next valid packet to process, if any.
     * Handles reordering and jitter buffering.
     */
    pop(): LiveMotionInput | null;

    /**
     * Returns the latest timestamp seen (for lag calculation).
     */
    getLatestTimestamp(): number;
}
