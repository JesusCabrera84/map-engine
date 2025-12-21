import type { LiveMotionInput, LiveMotionPolicy } from "../types.js";
import type {
  MotionEstimate,
  MotionPose,
  NetworkBuffer,
  PhysicsModel,
  ConfidenceModel,
  IntentModel,
} from "./types.js";
import { SimpleNetworkBuffer } from "./NetworkBuffer.js";
import { KinematicPhysicsModel } from "./PhysicsModel.js";
import { TimeBasedConfidenceModel } from "./ConfidenceModel.js";
import { VarianceIntentModel } from "./IntentModel.js";
import { lerpAngle, lerpPosition } from "../../utils/geo.js";

export class StandardMotionEngine {
  private buffer: NetworkBuffer;
  private physics: PhysicsModel;
  private confidence: ConfidenceModel;
  private intent: IntentModel;

  // Current best estimate
  private currentPose: MotionPose = {
    lat: 0,
    lng: 0,
    heading: 0,
    speed: 0,
    uncertaintyRadius: 0,
  };

  private lastTickTime = 0;
  private initialized = false;

  constructor(policy?: Partial<LiveMotionPolicy>) {
    this.buffer = new SimpleNetworkBuffer();
    this.physics = new KinematicPhysicsModel();
    this.confidence = new TimeBasedConfidenceModel(policy);
    this.intent = new VarianceIntentModel();
  }

  input(packet: LiveMotionInput): void {
    this.buffer.push(packet);

    // If not initialized, take valid packet immediately to start
    if (!this.initialized && packet.timestamp) {
      this.processObservation(packet);
      this.initialized = true;
      this.lastTickTime = packet.timestamp; // Start clock at packet time? Or Date.now()?
      // If we are simulating, we use packet time. If live, we use Date.now().
      // For now, assume Real-Time operation.
      this.lastTickTime = Date.now();
    }
  }

  getEstimate(): MotionEstimate {
    return {
      pose: this.currentPose,
      state: this.confidence.getState(),
      intent: this.intent.getIntent(),
      timestamp: this.lastTickTime, // Virtual time
    };
  }

  tick(now: number): void {
    if (!this.initialized) return;

    // 1. Process Message Queue
    // In a real loop, we might process multiple packets if we fell behind.
    // For simple live logic, we usually empty the buffer of everything "due".
    let packet = this.buffer.pop();
    while (packet) {
      this.processObservation(packet);
      packet = this.buffer.pop();
    }

    // 2. Calculate dt
    // We use system clock for dt in live mode.
    const dt = (now - this.lastTickTime) / 1000;
    this.lastTickTime = now;

    if (dt <= 0) return;

    // 3. Decay Confidence
    this.confidence.decay(dt);
    const state = this.confidence.getState();

    // 4. Physics Step
    if (state === "FROZEN") {
      // Stop physics integration
      this.currentPose.speed = 0;
    } else {
      // COASTING or REAL or PREDICTED
      // Integrate
      this.currentPose = this.physics.step(this.currentPose, dt);
    }
  }

  private processObservation(packet: LiveMotionInput): void {
    // Update physics state (snap or blend?)
    // Ideally we blend, but for Step 1 of Stage 3, let's snap physics parameters to reality
    // and blend position.

    this.physics.update(packet);
    this.confidence.update(packet);
    this.intent.update(packet);

    // Correction Step (Kalman-lite)
    // Lerp current position towards observation
    const observedLat = packet.lat;
    const observedLng = packet.lng;

    // Simple trust-weighted blend
    // If we are fully confident, we trust observation high
    // FIX: If not initialized (first fix), snap 100%. Otherwise blend.
    const blendFactor = this.initialized ? 0.5 : 1.0;

    const corrected = lerpPosition(
      { lat: this.currentPose.lat, lon: this.currentPose.lng },
      { lat: observedLat, lon: observedLng },
      blendFactor,
    );

    this.currentPose.lat = corrected.lat;
    this.currentPose.lng = corrected.lon;

    // Update heading if provided, otherwise trust physics integration or blend
    if (packet.bearing !== undefined) {
      const angleBlend = this.initialized ? 0.5 : 1.0;
      this.currentPose.heading = lerpAngle(
        this.currentPose.heading,
        packet.bearing,
        angleBlend,
      );
    }

    // Reset uncertainty on fresh observation (to some sensor noise baseline)
    this.currentPose.uncertaintyRadius = 5; // 5 meters base error
  }
}
