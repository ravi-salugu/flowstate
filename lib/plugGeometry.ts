import type { Viewport } from "@/lib/store";

export const COMPOSER_PROXIMITY_PX = 80;
export const RECEIVE_PLUG_HIT_RADIUS_PX = 18;
export const PLUG_DRAG_THRESHOLD_PX = 5;

export interface WorldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ComposerTarget {
  cardId: string;
  rect: WorldRect;
  distance: number;
}

export interface ReceivePlugHit {
  cardId: string;
  side: "left" | "right";
}

export function screenToWorld(
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  viewport: Viewport,
): { x: number; y: number } {
  const sx = clientX - containerRect.left;
  const sy = clientY - containerRect.top;
  return {
    x: (sx - viewport.x) / viewport.scale,
    y: (sy - viewport.y) / viewport.scale,
  };
}

export function worldRectFromClientRect(
  rect: DOMRect,
  containerRect: DOMRect,
  viewport: Viewport,
): WorldRect {
  const topLeft = screenToWorld(rect.left, rect.top, containerRect, viewport);
  const bottomRight = screenToWorld(
    rect.right,
    rect.bottom,
    containerRect,
    viewport,
  );
  return {
    x: topLeft.x,
    y: topLeft.y,
    w: bottomRight.x - topLeft.x,
    h: bottomRight.y - topLeft.y,
  };
}

function rectDistance(world: { x: number; y: number }, rect: WorldRect): number {
  const cx = Math.max(rect.x, Math.min(world.x, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(world.y, rect.y + rect.h));
  return Math.hypot(world.x - cx, world.y - cy);
}

export function findNearestComposerTarget(
  world: { x: number; y: number },
  container: HTMLElement,
  viewport: Viewport,
  thresholdPx = COMPOSER_PROXIMITY_PX,
): ComposerTarget | null {
  const containerRect = container.getBoundingClientRect();
  const composers = container.querySelectorAll<HTMLElement>(
    "[data-composer][data-card-id]",
  );

  let best: ComposerTarget | null = null;

  for (const el of composers) {
    const cardId = el.dataset.cardId;
    if (!cardId) continue;
    const rect = worldRectFromClientRect(
      el.getBoundingClientRect(),
      containerRect,
      viewport,
    );
    const distance = rectDistance(world, rect);
    if (distance > thresholdPx) continue;
    if (!best || distance < best.distance) {
      best = { cardId, rect, distance };
    }
  }

  return best;
}

export function receivePlugWorldPosition(
  rect: WorldRect,
  side: "left" | "right",
): { x: number; y: number } {
  return {
    x: side === "left" ? rect.x : rect.x + rect.w,
    y: rect.y + rect.h / 2,
  };
}

export function hitReceivePlug(
  world: { x: number; y: number },
  target: ComposerTarget,
): ReceivePlugHit | null {
  for (const side of ["left", "right"] as const) {
    const plug = receivePlugWorldPosition(target.rect, side);
    const dist = Math.hypot(world.x - plug.x, world.y - plug.y);
    if (dist <= RECEIVE_PLUG_HIT_RADIUS_PX) {
      return { cardId: target.cardId, side };
    }
  }
  return null;
}

export function expandRect(rect: WorldRect, px: number): WorldRect {
  return {
    x: rect.x - px,
    y: rect.y - px,
    w: rect.w + px * 2,
    h: rect.h + px * 2,
  };
}

export function pointInRect(
  world: { x: number; y: number },
  rect: WorldRect,
): boolean {
  return (
    world.x >= rect.x &&
    world.x <= rect.x + rect.w &&
    world.y >= rect.y &&
    world.y <= rect.y + rect.h
  );
}

// ---------------------------------------------------------------------------
// R5b — detect which existing component the pointer is over (for drag-to-connect)
// ---------------------------------------------------------------------------

export interface ComponentHit {
  componentId: string;
  visualKind: "card" | "artifact";
  /** Which edge of the rect is closest to the pointer at drop time. */
  side: "top" | "bottom" | "left" | "right";
}

/**
 * Returns the topmost canvas component element under the given client coords,
 * or null if the pointer isn't over any. Walks the DOM from the hit element
 * upward looking for `[data-canvas-card]` or `[data-canvas-artifact]`. Uses
 * the bounding rect to decide which edge is closest.
 *
 * Works regardless of viewport pan/zoom because elementFromPoint sees the
 * actual painted geometry.
 */
export function findComponentTargetAtPoint(
  clientX: number,
  clientY: number,
): ComponentHit | null {
  if (typeof document === "undefined") return null;
  let el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  while (el) {
    const cardId = el.dataset?.canvasCard;
    if (cardId) {
      return {
        componentId: cardId,
        visualKind: "card",
        side: nearestEdge(el.getBoundingClientRect(), clientX, clientY),
      };
    }
    const artifactId = el.dataset?.canvasArtifact;
    if (artifactId) {
      return {
        componentId: artifactId,
        visualKind: "artifact",
        side: nearestEdge(el.getBoundingClientRect(), clientX, clientY),
      };
    }
    el = el.parentElement;
  }
  return null;
}

function nearestEdge(
  rect: DOMRect,
  clientX: number,
  clientY: number,
): "top" | "bottom" | "left" | "right" {
  const distances = {
    top: clientY - rect.top,
    bottom: rect.bottom - clientY,
    left: clientX - rect.left,
    right: rect.right - clientX,
  };
  let nearest: "top" | "bottom" | "left" | "right" = "top";
  let best = Infinity;
  for (const [side, d] of Object.entries(distances)) {
    if (d < best) {
      best = d;
      nearest = side as typeof nearest;
    }
  }
  return nearest;
}
