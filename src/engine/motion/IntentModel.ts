import type { LiveMotionInput } from "../types.js";
import type { IntentModel, Intent } from "./types.js";

export class VarianceIntentModel implements IntentModel {
  private recentBearings: number[] = [];
  private windowSize = 5;

  update(observation: LiveMotionInput): void {
    if (observation.bearing !== undefined) {
      this.recentBearings.push(observation.bearing);
      if (this.recentBearings.length > this.windowSize) {
        this.recentBearings.shift();
      }
    }
  }

  getIntent(): Intent {
    if (this.recentBearings.length < 2) {
      return { action: "UNKNOWN", confidence: 0 };
    }

    const variance = this.calculateCircularVariance(this.recentBearings);

    // Thresholds (totally heuristic for now)
    // Variance is between 0 (perfectly aligned) and 1 (isotropic)
    // Using degrees standard deviation might be easier to reason about?
    // Let's use simple variance 0-1.

    if (variance < 0.01) {
      return { action: "STRAIGHT", confidence: 1 - variance };
    } else if (variance > 0.1) {
      return { action: "TURN", confidence: variance };
    } else {
      return { action: "STRAIGHT", confidence: 0.5 };
    }
  }

  private calculateCircularVariance(angles: number[]): number {
    // R = sqrt( (sum cos)^2 + (sum sin)^2 )
    // Mean Resultant Length R_bar = R / N
    // Variance = 1 - R_bar

    // Convert to radians
    const rads = angles.map((d) => (d * Math.PI) / 180);

    let sumCos = 0;
    let sumSin = 0;

    for (const r of rads) {
      sumCos += Math.cos(r);
      sumSin += Math.sin(r);
    }

    const R = Math.sqrt(sumCos * sumCos + sumSin * sumSin);
    const R_bar = R / angles.length;

    return 1 - R_bar;
  }
}
