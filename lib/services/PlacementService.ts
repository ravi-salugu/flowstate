/**
 * PlacementService — stateless placement helper for v2 Components.
 *
 * R3 ships the same lane-walk AABB algorithm as R0b
 * (lib/canvasArtifacts.ts:computeDefaultSpawnPosition), but operating on v2
 * ServiceComponent rows so the server can pre-compute positions before
 * issuing a create-component mutation.
 *
 * R7 retires this stub in favour of a unified system that ALSO governs
 * follow-up cards (today still in lib/canvasLayout.ts). After R7, every
 * spawn — user-click, follow-up, branch, auto-artifact — goes through
 * this one algorithm.
 */

import type { ServiceComponent } from "@/lib/services/types";

export type SpawnReason = "user" | "follow-up" | "lateral" | "auto";

export interface PlacementInput {
  /** All current components on the canvas (excluding the one being placed). */
  existing: ServiceComponent[];
  /** Parent / source component, if any. */
  source?: ServiceComponent | null;
  /** Bounding size of the new component. */
  bounds: { w: number; h: number };
  /** What kind of placement this is — controls preferred direction. */
  reason: SpawnReason;
}

export interface PlacementResult {
  position: { x: number; y: number };
}

const DEFAULT_GAP = 24;
const PADDING = 12;
const MAX_ROWS = 40;
const MAX_COLS = 6;

export class PlacementService {
  /** Stateless — same instance is safe across requests. */
  computePlacement(input: PlacementInput): PlacementResult {
    const { existing, source, bounds, reason } = input;
    const ROW_STEP = bounds.h + DEFAULT_GAP;
    const COL_STEP = bounds.w + DEFAULT_GAP;

    // 1. Preferred (source-relative) anchor
    let preferredX = 0;
    let preferredY = 0;
    if (source) {
      const sw = source.size.w ?? bounds.w;
      const sh = source.size.h ?? bounds.h;
      switch (reason) {
        case "follow-up":
          preferredX = source.position.x;
          preferredY = source.position.y + sh + DEFAULT_GAP;
          break;
        case "lateral":
        case "auto":
        case "user":
          preferredX = source.position.x + sw + DEFAULT_GAP;
          preferredY = source.position.y;
          break;
      }
    }

    // 2. Build occupied AABBs
    const occupied = existing.map((c) => ({
      x: c.position.x,
      y: c.position.y,
      w: c.size.w ?? bounds.w,
      h: c.size.h ?? bounds.h,
    }));

    // 3. AABB collision test with padding
    const collides = (x: number, y: number): boolean => {
      const ax1 = x - PADDING;
      const ay1 = y - PADDING;
      const ax2 = x + bounds.w + PADDING;
      const ay2 = y + bounds.h + PADDING;
      for (const r of occupied) {
        if (ax1 < r.x + r.w && ax2 > r.x && ay1 < r.y + r.h && ay2 > r.y) {
          return true;
        }
      }
      return false;
    };

    // 4. Walk lanes — first non-colliding slot wins
    for (let col = 0; col < MAX_COLS; col++) {
      for (let row = 0; row < MAX_ROWS; row++) {
        const x = preferredX + col * COL_STEP;
        const y = preferredY + row * ROW_STEP;
        if (!collides(x, y)) return { position: { x, y } };
      }
    }

    // 5. Saturated fallback
    return {
      position: {
        x: preferredX,
        y: preferredY + MAX_ROWS * ROW_STEP,
      },
    };
  }
}
