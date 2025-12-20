import type { LiveMotionInput } from '../types.js';
import type { NetworkBuffer } from './types.js';

/**
 * A buffer that reorders packets based on timestamp and handles jitter.
 * Currently implements a simple reordering queue.
 * Future improvements could include min-delay buffering.
 */
export class SimpleNetworkBuffer implements NetworkBuffer {
    private buffer: LiveMotionInput[] = [];
    private lastProcessedTimestamp = 0;
    private maxBufferSize = 50;

    push(packet: LiveMotionInput): void {
        const ts = packet.timestamp || Date.now();

        // Discard archaic packets (older than last processed)
        if (ts < this.lastProcessedTimestamp) {
            return;
        }

        this.buffer.push(packet);
        // Keep sorted by timestamp (oldest first)
        this.buffer.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        // Trim buffer if too large (drop oldest/irrelevant? No, drop from start if we have too many?)
        // Actually, if we have too many, we might want to drop oldest or snap. 
        // For now, just a hard limit to prevent memory leaks if not popped.
        if (this.buffer.length > this.maxBufferSize) {
            this.buffer.shift(); // Drop oldest
        }
    }

    pop(): LiveMotionInput | null {
        if (this.buffer.length === 0) {
            return null;
        }

        // In a real jitter buffer, we would wait until we have X ms of data
        // or check if the gap is too large. 
        // For now, we just return the next available packet in order.

        const next = this.buffer.shift();
        if (next) {
            this.lastProcessedTimestamp = next.timestamp || Date.now();
        }
        return next || null;
    }

    getLatestTimestamp(): number {
        if (this.buffer.length === 0) {
            return this.lastProcessedTimestamp;
        }
        const last = this.buffer[this.buffer.length - 1];
        return (last && last.timestamp) || this.lastProcessedTimestamp;
    }
}
