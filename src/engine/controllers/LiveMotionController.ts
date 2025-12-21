import type { LiveMotionInput, LiveMotionPolicy } from "../types.js";
import type { MarkerAdapter } from "../interfaces/MarkerAdapter.js";
import { StandardMotionEngine } from "../motion/MotionEngine.js"; // Class import is fine
import type { MotionState } from "../motion/types.js";

export class LiveMotionController {
  // Map vehicle ID to its own Motion Engine brain
  private engines = new Map<string | number, StandardMotionEngine>();

  private liveAnimationFrameId: number | null = null;
  private lastLiveFrameTime = 0;
  private policy: LiveMotionPolicy;

  constructor(
    private markerAdapter: MarkerAdapter,
    policy?: Partial<LiveMotionPolicy>,
  ) {
    this.policy = {
      fullConfidenceMs: 5000,
      decayMs: 10000,
      maxStaleMs: 15 * 60 * 1000,
      ...policy,
    };
  }

  /**
   * Updates the state of a vehicle/unit using the Motion Engine.
   */
  update(input: LiveMotionInput): void {
    const { id } = input;

    let engine = this.engines.get(id);
    if (!engine) {
      engine = new StandardMotionEngine(this.policy);
      this.engines.set(id, engine);
    }

    // Feed the brain
    engine.input(input);
  }

  remove(id: string | number): void {
    this.engines.delete(id);
  }

  start(): void {
    if (typeof window === "undefined") return;
    if (this.liveAnimationFrameId !== null) return;

    const animate = (time: number) => {
      if (!this.lastLiveFrameTime) this.lastLiveFrameTime = time;
      // time is high precision monotonic, but our engines use Date.now() for wall clock sync
      // Let's stick to Date.now() for the engine tick to match the real-world timestamping of packets.
      const now = Date.now();

      this.engines.forEach((engine, id) => {
        // 1. Tick the engine (Integrate physics, decay confidence)
        engine.tick(now);

        // 2. Get the confident estimate
        const estimate = engine.getEstimate();

        // 3. Render
        this.markerAdapter.setMarkerPosition(
          id,
          estimate.pose.lat,
          estimate.pose.lng,
        );
        this.markerAdapter.setMarkerRotation?.(id, estimate.pose.heading);

        // Optional: Visualize state (e.g. opacity for coasting/frozen)
        // This would require extending MarkerAdapter to support opacity/state
        // For now, we implement "honesty" by just rendering where it thinks it is.
        this.handleStateVisuals(id, estimate.state);
      });

      this.lastLiveFrameTime = time;
      this.liveAnimationFrameId = requestAnimationFrame(animate);
    };

    this.liveAnimationFrameId = requestAnimationFrame(animate);
  }

  private handleStateVisuals(id: string | number, state: MotionState): void {
    // Placeholder for future UX hooks defined in the roadmap
    // e.g. Ghost markers, opacity, etc.
    // if (state === 'FROZEN') ...
  }

  stop(): void {
    if (this.liveAnimationFrameId !== null) {
      cancelAnimationFrame(this.liveAnimationFrameId);
      this.liveAnimationFrameId = null;
      this.lastLiveFrameTime = 0;
    }
  }

  clear(): void {
    this.engines.clear();
  }
}
