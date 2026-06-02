/**
 * R7 — Unified placement service.
 *
 * Single source of truth for where any new canvas node lands. Replaces the
 * dual-pass logic that previously lived in:
 *   - `lib/canvasArtifacts.ts:computeDefaultSpawnPosition` (artifact nodes)
 *   - `lib/canvasLayout.ts:computeFollowUpPosition`         (chat follow-ups)
 *
 * Both files now call into `computePlacement` here so artifact and follow-up
 * placement participate in the SAME AABB collision grid — a follow-up can't
 * land on top of an artifact and vice versa.
 *
 * Policy by SpawnReason:
 *   - 'follow-up' → below source (source.x, source.y + source.h + FOLLOW_UP_GAP)
 *                   This preserves the documented vertical-chain invariant
 *                   in `docs/canvas-card-position-rules.md`.
 *   - 'branch'    → lateral, same Y as source, on the requested side
 *   - 'auto'      → right of source at source.y (artifact spawn default)
 *   - 'user'      → right of source (manual user create)
 *
 * If the preferred slot collides with any existing node (card or artifact),
 * we lane-walk: row-by-row within the same column, then shift one column
 * over and retry. First non-colliding slot wins. Deterministic, predictable
 * adjacency.
 */

import {
  CARD_WIDTH,
  DEFAULT_ARTIFACT_HEIGHT,
  EMPTY_CARD_HEIGHT,
  FALLBACK_CARD_HEIGHT,
} from "@/lib/canvasNodeBounds";

export const FOLLOW_UP_GAP = 40;
export const ARTIFACT_SPAWN_GAP_X = 24;
const PADDING = 12;
const MAX_ROWS = 40;
const MAX_COLS = 6;

export type SpawnReason = "follow-up" | "branch" | "lateral" | "auto" | "user";

export interface PlacementBounds {
  w: number;
  h: number;
}

export interface PlacementSource {
  id: string;
  position: { x: number; y: number };
  size: PlacementBounds;
}

/**
 * Anything visible on the canvas that should be respected by collision
 * detection. Includes both v1 Cards and v1 CanvasArtifactNodes — flattened
 * to a uniform shape.
 */
export interface PlacementOccupant {
  id: string;
  position: { x: number; y: number };
  size: PlacementBounds;
}

export interface PlacementInput {
  /** Why is this spawn happening? Controls the preferred (X, Y) anchor. */
  reason: SpawnReason;
  /** Bounds of the new node. */
  bounds: PlacementBounds;
  /** Source / parent component, if any. */
  source: PlacementSource | null;
  /** Every other node currently on the canvas. */
  occupants: PlacementOccupant[];
  /**
   * For lateral / branch placements: which side of the source.
   * Ignored for follow-up / auto.
   */
  side?: "left" | "right";
}

export interface PlacementResult {
  position: { x: number; y: number };
  /** True if we had to spiral past the preferred slot to avoid a collision. */
  shifted: boolean;
}

// --- internal helpers ------------------------------------------------------

function aabbCollides(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  occupants: ReadonlyArray<PlacementOccupant>,
  excludeId?: string,
): boolean {
  const ax1 = ax - PADDING;
  const ay1 = ay - PADDING;
  const ax2 = ax + aw + PADDING;
  const ay2 = ay + ah + PADDING;
  for (const o of occupants) {
    if (excludeId && o.id === excludeId) continue;
    const bx1 = o.position.x;
    const by1 = o.position.y;
    const bx2 = bx1 + o.size.w;
    const by2 = by1 + o.size.h;
    if (ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1) return true;
  }
  return false;
}

function preferredAnchor(input: PlacementInput): { x: number; y: number } {
  const { reason, source, bounds, side } = input;
  if (!source) {
    return {
      x: 0,
      y: 0,
    };
  }
  const sw = source.size.w;
  const sh = source.size.h;
  switch (reason) {
    case "follow-up":
      return {
        x: source.position.x,
        y: source.position.y + sh + FOLLOW_UP_GAP,
      };
    case "branch":
    case "lateral": {
      const onRight = side !== "left";
      return {
        x: onRight
          ? source.position.x + sw + ARTIFACT_SPAWN_GAP_X
          : source.position.x - bounds.w - ARTIFACT_SPAWN_GAP_X,
        y: source.position.y,
      };
    }
    case "auto":
    case "user":
    default:
      return {
        x: source.position.x + sw + ARTIFACT_SPAWN_GAP_X,
        y: source.position.y,
      };
  }
}

// --- main entry point ------------------------------------------------------

/**
 * Find the (x, y) for a new node. Pure function — deterministic for a given
 * input. Same arguments always produce the same result, suitable for repeated
 * recomputation during streaming / undo / replay.
 */
export function computePlacement(input: PlacementInput): PlacementResult {
  const { bounds, occupants, reason } = input;

  const anchor = preferredAnchor(input);

  // Step axes — direction we shift to avoid collision.
  // follow-ups stack vertically below; everything else stacks vertically in a
  // column right of source.
  const ROW_STEP = bounds.h + (reason === "follow-up" ? FOLLOW_UP_GAP : 24);
  const COL_STEP = bounds.w + ARTIFACT_SPAWN_GAP_X;

  // Try preferred slot first (fast path — no collision = unchanged behaviour
  // for solo cards or empty canvases).
  if (!aabbCollides(anchor.x, anchor.y, bounds.w, bounds.h, occupants)) {
    return { position: anchor, shifted: false };
  }

  // Lane walk: column-by-column, row-by-row within each column.
  for (let col = 0; col < MAX_COLS; col++) {
    for (let row = 0; row < MAX_ROWS; row++) {
      if (col === 0 && row === 0) continue; // already tried as anchor
      const x = anchor.x + col * COL_STEP;
      const y = anchor.y + row * ROW_STEP;
      if (!aabbCollides(x, y, bounds.w, bounds.h, occupants)) {
        return { position: { x, y }, shifted: true };
      }
    }
  }

  // Pathological fallback (canvas saturated)
  return {
    position: {
      x: anchor.x,
      y: anchor.y + MAX_ROWS * ROW_STEP,
    },
    shifted: true,
  };
}

// --- convenience builders for callers --------------------------------------

/**
 * Turn a v1-store Card into a PlacementOccupant. Uses fallback heights when
 * `card.size` isn't measured yet.
 */
export function cardAsOccupant(card: {
  id: string;
  position: { x: number; y: number };
  size?: { w?: number; h?: number };
  status?: string;
}): PlacementOccupant {
  return {
    id: card.id,
    position: card.position,
    size: {
      w: card.size?.w ?? CARD_WIDTH,
      h:
        card.size?.h ??
        (card.status === "empty" ? EMPTY_CARD_HEIGHT : FALLBACK_CARD_HEIGHT),
    },
  };
}

/**
 * Turn a v1 CanvasArtifactNode into a PlacementOccupant.
 */
export function artifactNodeAsOccupant(
  node: {
    id: string;
    position: { x: number; y: number };
    size?: { w?: number; h?: number };
  },
  fallbackBounds: PlacementBounds = {
    w: 520,
    h: DEFAULT_ARTIFACT_HEIGHT,
  },
): PlacementOccupant {
  return {
    id: node.id,
    position: node.position,
    size: {
      w: node.size?.w ?? fallbackBounds.w,
      h: node.size?.h ?? fallbackBounds.h,
    },
  };
}

/**
 * Build the full occupants list from store maps. Convenience for callers that
 * want unified AABB collision against everything visible.
 */
export function buildOccupants(
  cards: Record<
    string,
    {
      id: string;
      position: { x: number; y: number };
      size?: { w?: number; h?: number };
      status?: string;
    }
  >,
  canvasArtifactNodes: Record<
    string,
    {
      id: string;
      position: { x: number; y: number };
      size?: { w?: number; h?: number };
    }
  >,
): PlacementOccupant[] {
  const out: PlacementOccupant[] = [];
  for (const c of Object.values(cards)) out.push(cardAsOccupant(c));
  for (const n of Object.values(canvasArtifactNodes))
    out.push(artifactNodeAsOccupant(n));
  return out;
}
