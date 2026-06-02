/**
 * Canvas layout helpers.
 *
 * Policy: every card and artifact has a fixed absolute (x, y) in world space.
 * The only exception is a single-chat vertical chain — when a card in a chain
 * grows or shrinks vertically, its bottom-attached descendants (follow-ups in
 * the same chat) shift by the same delta so the chain stays glued and the
 * plug-to-plug connectors remain short and straight. Lateral branches and
 * canvas artifact nodes are never moved by a sibling resize.
 */
import { CARD_WIDTH, type CardBoundsInput } from "@/lib/canvasNodeBounds";
import { getLayoutCardBounds } from "@/lib/canvasMeasure";
import {
  artifactNodeAsOccupant,
  cardAsOccupant,
  computePlacement,
  FOLLOW_UP_GAP as UNIFIED_FOLLOW_UP_GAP,
  type PlacementOccupant,
} from "@/lib/canvas/placement";

/** Layout graph types (structurally compatible with store Card / Connection). */
export interface LayoutCard extends CardBoundsInput {
  id: string;
  position: { x: number; y: number };
}

export interface LayoutConnection {
  id: string;
  from: string;
  to: string;
  fromSide?: "top" | "bottom" | "left" | "right" | null;
  toSide?: "top" | "bottom" | "left" | "right" | null;
}

/** Minimal artifact-node shape used for AABB collision. */
export interface LayoutArtifactNode {
  id: string;
  position: { x: number; y: number };
  size?: { w?: number; h?: number };
}

export const FOLLOW_UP_GAP = UNIFIED_FOLLOW_UP_GAP;
export const BRANCH_CARD_WIDTH = CARD_WIDTH;
export const BRANCH_HORIZONTAL_GAP = BRANCH_CARD_WIDTH;
export const COLUMN_STEP = CARD_WIDTH + BRANCH_HORIZONTAL_GAP;

export interface CanvasLayoutState {
  cards: Record<string, LayoutCard>;
  connections: LayoutConnection[];
  cardOrder: string[];
  /** R7c — optional. When provided, follow-up placement also AABB-checks
   *  against artifact nodes so they never collide. */
  canvasArtifactNodes?: Record<string, LayoutArtifactNode>;
}

function collectSubtreeIds(
  connections: LayoutConnection[],
  rootId: string,
): Set<string> {
  const subtree = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const cid = queue.shift()!;
    if (subtree.has(cid)) continue;
    subtree.add(cid);
    for (const conn of connections) {
      if (conn.from === cid) queue.push(conn.to);
    }
  }
  return subtree;
}

function isBottomConnection(conn: LayoutConnection): boolean {
  return conn.fromSide === "bottom" || conn.fromSide == null;
}

/**
 * Collect every descendant reachable from `rootId` through bottom-side
 * connections only. Lateral branches (left/right) are NOT followed — they
 * belong to a different chat and stay absolute.
 */
function collectBottomSubtreeIds(
  connections: LayoutConnection[],
  rootId: string,
): Set<string> {
  const subtree = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const cid = queue.shift()!;
    if (subtree.has(cid)) continue;
    subtree.add(cid);
    for (const conn of connections) {
      if (conn.from === cid && isBottomConnection(conn)) {
        queue.push(conn.to);
      }
    }
  }
  return subtree;
}

/**
 * When a card's height changes, shift its bottom-attached subtree by `dy` so
 * the same-chat follow-up chain stays glued to the parent's bottom plug.
 *
 * Only follows bottom connections, so lateral branches and any subtree under
 * them stay where the user placed them. The card identified by `parentId`
 * itself is not shifted — only its bottom descendants.
 */
export function shiftBottomAttachedSubtrees<T extends LayoutCard>(
  cards: Record<string, T>,
  connections: LayoutConnection[],
  parentId: string,
  dy: number,
): Record<string, T> {
  if (dy === 0) return cards;
  const subtree = collectBottomSubtreeIds(connections, parentId);
  subtree.delete(parentId);
  if (subtree.size === 0) return cards;
  const next = { ...cards };
  for (const id of subtree) {
    const c = next[id];
    if (!c) continue;
    next[id] = {
      ...c,
      position: { ...c.position, y: c.position.y + dy },
    };
  }
  return next;
}

/** Single follow-up child; lowest Y, then earliest in cardOrder. */
export function getFollowUpChild(
  parentId: string,
  state: CanvasLayoutState,
): string | null {
  const { connections, cards, cardOrder } = state;
  const children = connections
    .filter((c) => c.from === parentId && isBottomConnection(c))
    .map((c) => c.to)
    .filter((id) => cards[id]);

  if (children.length === 0) return null;
  if (children.length === 1) return children[0];

  children.sort((a, b) => {
    const ya = cards[a].position.y;
    const yb = cards[b].position.y;
    if (ya !== yb) return ya - yb;
    return cardOrder.indexOf(a) - cardOrder.indexOf(b);
  });
  return children[0];
}

/** Canonical position for a follow-up directly below its parent. */
export function computeFollowUpPosition(
  state: CanvasLayoutState,
  parentId: string,
  parent: LayoutCard,
): { x: number; y: number } {
  // R7c — route through the unified placement service so the follow-up
  // AABB-checks against artifacts to the right of the parent as well as
  // siblings in the vertical chain. Preferred anchor is still
  // (parent.x, parent.y + parentHeight + FOLLOW_UP_GAP) — the documented
  // vertical-chain invariant — but the service will lane-walk down if that
  // slot is occupied by another node.
  const { w: parentW, h: parentH } = getLayoutCardBounds(parent);

  const occupants: PlacementOccupant[] = [];
  for (const c of Object.values(state.cards)) {
    if (c.id === parentId) continue; // don't collide against self
    occupants.push(cardAsOccupant(c));
  }
  if (state.canvasArtifactNodes) {
    for (const n of Object.values(state.canvasArtifactNodes)) {
      occupants.push(artifactNodeAsOccupant(n));
    }
  }

  // Bounds for the new follow-up card — use the v1 default before measurement.
  const newCardBounds = { w: CARD_WIDTH, h: 88 }; // EMPTY_CARD_HEIGHT
  const { position } = computePlacement({
    reason: "follow-up",
    bounds: newCardBounds,
    source: {
      id: parentId,
      position: parent.position,
      size: { w: parentW, h: parentH },
    },
    occupants,
  });
  return position;
}

/** Recompute Y (and X) for an entire bottom-connected chain under `startParentId`. */
export function layoutVerticalChain(
  state: CanvasLayoutState,
  startParentId: string,
): Record<string, LayoutCard> {
  const cards = { ...state.cards };
  let currentId: string | null = startParentId;

  while (currentId) {
    const childId = getFollowUpChild(currentId, { ...state, cards });
    if (!childId) break;

    const parent = cards[currentId];
    if (!parent) break;

    const pos = computeFollowUpPosition({ ...state, cards }, currentId, parent);
    const child = cards[childId];
    if (!child) break;

    cards[childId] = {
      ...child,
      position: pos,
    };
    currentId = childId;
  }

  return cards;
}

/** Y-band for lateral branches: earliest child Y, or default below parent. */
export function childBandY(
  state: CanvasLayoutState,
  sourceId: string,
  source: LayoutCard,
): number {
  let earliest: number | null = null;
  for (const conn of state.connections) {
    if (conn.from !== sourceId) continue;
    const child = state.cards[conn.to];
    if (!child) continue;
    if (earliest === null || child.position.y < earliest) {
      earliest = child.position.y;
    }
  }
  if (earliest !== null) return earliest;
  const { h: sourceH } = getLayoutCardBounds(source);
  return source.position.y + sourceH + FOLLOW_UP_GAP;
}

function repairLateralBranchBands(
  cards: Record<string, LayoutCard>,
  connections: LayoutConnection[],
): Record<string, LayoutCard> {
  const next = { ...cards };
  const parentIds = new Set(connections.map((c) => c.from));

  for (const parentId of parentIds) {
    const parent = next[parentId];
    if (!parent) continue;

    const { h: parentH } = getLayoutCardBounds(parent);
    const bandY = parent.position.y + parentH + FOLLOW_UP_GAP;

    for (const conn of connections) {
      if (conn.from !== parentId) continue;
      if (conn.fromSide !== "left" && conn.fromSide !== "right") continue;

      const child = next[conn.to];
      if (!child) continue;

      const dy = bandY - child.position.y;
      if (dy === 0) continue;

      for (const id of collectSubtreeIds(connections, conn.to)) {
        const c = next[id];
        if (!c) continue;
        next[id] = {
          ...c,
          position: { ...c.position, y: c.position.y + dy },
        };
      }
    }
  }

  return next;
}

function independentRootIds(state: CanvasLayoutState): string[] {
  const { cards, cardOrder, connections } = state;
  return cardOrder.filter(
    (id) => cards[id] && !connections.some((c) => c.to === id),
  );
}

function lateralBranchRootIds(state: CanvasLayoutState): string[] {
  const { cards, connections } = state;
  const ids: string[] = [];
  for (const conn of connections) {
    if (conn.fromSide !== "left" && conn.fromSide !== "right") continue;
    if (!cards[conn.to]) continue;
    if (!ids.includes(conn.to)) ids.push(conn.to);
  }
  return ids;
}

/** Walk up bottom connections to the top of the vertical chain. */
export function findVerticalChainRoot(
  state: CanvasLayoutState,
  cardId: string,
): string {
  let current = cardId;
  const seen = new Set<string>();
  while (!seen.has(current)) {
    seen.add(current);
    const incoming = state.connections.find(
      (c) => c.to === current && isBottomConnection(c),
    );
    if (!incoming) return current;
    current = incoming.from;
  }
  return current;
}

/** After a card resizes: re-anchor its vertical chain and lateral branch band. */
export function relayoutChildrenOf<T extends LayoutCard>(
  state: {
    cards: Record<string, T>;
    connections: LayoutConnection[];
    cardOrder: string[];
  },
  cardId: string,
): Record<string, T> {
  const rootId = findVerticalChainRoot(state, cardId);
  const laid = layoutVerticalChain(state, rootId);
  const merged = { ...state.cards };
  for (const id of Object.keys(laid)) {
    const c = laid[id];
    if (c && merged[id]) merged[id] = { ...merged[id], position: c.position };
  }
  const rebanded = repairLateralBranchBands(merged, state.connections);
  const next = { ...merged };
  for (const id of Object.keys(rebanded)) {
    const c = rebanded[id];
    if (c && next[id]) next[id] = { ...next[id], position: c.position };
  }
  return next;
}

/**
 * Re-snap a card's bottom-attached follow-up chain to the canonical
 * `parent.bottom + FOLLOW_UP_GAP` invariant, using current (DOM-measured if
 * mounted) heights. Lateral branches are NOT touched — only the same-chat
 * vertical chain. Use this whenever a card is (re)measured so descendants
 * stay glued to the parent's plug with no extra gap.
 */
export function relayoutVerticalChainOf<T extends LayoutCard>(
  state: {
    cards: Record<string, T>;
    connections: LayoutConnection[];
    cardOrder: string[];
  },
  cardId: string,
): Record<string, T> {
  const rootId = findVerticalChainRoot(state, cardId);
  const laid = layoutVerticalChain(state, rootId);
  const next = { ...state.cards };
  for (const id of Object.keys(laid)) {
    const c = laid[id];
    if (c && next[id]) next[id] = { ...next[id], position: c.position };
  }
  return next;
}

/**
 * Repair only vertical chains across the whole canvas — used on hydrate so
 * any stale snapshot positions get re-snapped to the canonical gap.
 * Lateral branches stay where they are (per the absolute-positions policy).
 */
export function repairVerticalChainsOnly<T extends LayoutCard>(
  cards: Record<string, T>,
  connections: LayoutConnection[],
  cardOrder: string[],
): Record<string, T> {
  const layoutState: CanvasLayoutState = { cards, connections, cardOrder };

  const roots = new Set([
    ...independentRootIds(layoutState),
    ...lateralBranchRootIds(layoutState),
  ]);

  let next: Record<string, T> = { ...cards };
  for (const rootId of roots) {
    const laid = layoutVerticalChain(
      { cards: next, connections, cardOrder },
      rootId,
    );
    for (const id of Object.keys(laid)) {
      const c = laid[id];
      if (c && next[id]) {
        next[id] = { ...next[id], position: c.position };
      }
    }
  }
  return next;
}

/** Full layout repair on hydrate or thread completion. */
export function repairCanvasLayout<T extends LayoutCard>(
  cards: Record<string, T>,
  connections: LayoutConnection[],
  cardOrder: string[],
): Record<string, T> {
  const layoutState: CanvasLayoutState = { cards, connections, cardOrder };

  const roots = new Set([
    ...independentRootIds(layoutState),
    ...lateralBranchRootIds(layoutState),
  ]);

  let next: Record<string, T> = { ...cards };
  for (const rootId of roots) {
    const laid = layoutVerticalChain(
      { cards: next, connections, cardOrder },
      rootId,
    );
    for (const id of Object.keys(laid)) {
      const c = laid[id];
      if (c && next[id]) {
        next[id] = { ...next[id], position: c.position };
      }
    }
  }

  const rebanded = repairLateralBranchBands(next, connections);
  for (const id of Object.keys(rebanded)) {
    const c = rebanded[id];
    if (c && next[id]) {
      next[id] = { ...next[id], position: c.position };
    }
  }
  return next;
}

/** Apply layout position updates onto full card records. */
export function mergeLayoutPositions<T extends LayoutCard>(
  original: Record<string, T>,
  positioned: Record<string, LayoutCard>,
): Record<string, T> {
  const next = { ...original };
  for (const id of Object.keys(positioned)) {
    const c = positioned[id];
    if (c && next[id]) next[id] = { ...next[id], position: c.position };
  }
  return next;
}

/** Whether `childId` sits at the canonical gap below `parentId`. */
export function followUpInvariantHolds(
  state: CanvasLayoutState,
  parentId: string,
  childId: string,
): boolean {
  const parent = state.cards[parentId];
  const child = state.cards[childId];
  if (!parent || !child) return false;
  const expected = computeFollowUpPosition(state, parentId, parent);
  return (
    child.position.x === expected.x &&
    child.position.y === expected.y
  );
}
