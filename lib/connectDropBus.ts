/**
 * R5b — module-level bus that lets `usePlugDragSession` (deep in the canvas
 * event loop) ask a React component (the R5c `Canvas`-side handler) what to do
 * when a plug drag is dropped on top of an existing component.
 *
 * Why a module-level singleton instead of Zustand state or React context:
 *   - usePlugDragSession runs inside a `useEffect` that captures dependencies
 *     once; threading a context value through is fiddly.
 *   - The handler is a callback registered by a single React component; only
 *     one handler is active at a time; there's no reactivity needed.
 *   - This is the same pattern as a DOM-level event bus, just type-safe.
 *
 * R5c's Canvas-side hook calls `setConnectDropHandler` on mount and clears
 * it on unmount. `usePlugDragSession` calls `getConnectDropHandler()` in
 * the pointerup path; if a handler is set AND the drop landed on an existing
 * component (per findComponentTargetAtPoint), it routes there *instead* of
 * the existing branch/artifact drop behavior.
 */

import type { ConnectorSide } from "@/lib/types/component";

/** What was being dragged. Mirrors the v1 PlugDragState union we care about. */
export type ConnectDropSource =
  | {
      kind: "branch";
      /** Source v1 card id. */
      sourceCardId: string;
      /** Plug side the drag started from. */
      fromSide: ConnectorSide;
    }
  | {
      kind: "artifact";
      /** Source v1 canvas artifact node id. */
      sourceNodeId: string;
      /** Underlying SessionArtifact id (for context if R5c needs it). */
      artifactId: string;
      versionId: string;
      fromSide: ConnectorSide;
    };

/** What the drop landed on. */
export interface ConnectDropTarget {
  /** Always a v1 id today (card id or artifact node id). The unified Component
   * projection uses these same ids as the Component.id. */
  componentId: string;
  /** Whether the visual node was a Card or a CanvasArtifactNode in v1 terms. */
  visualKind: "card" | "artifact";
  /** Which edge of the target was closest to the cursor at drop time. */
  toSide: ConnectorSide;
}

export type ConnectDropHandler = (
  source: ConnectDropSource,
  target: ConnectDropTarget,
) => void;

let handler: ConnectDropHandler | null = null;

export function setConnectDropHandler(h: ConnectDropHandler | null): void {
  handler = h;
}

export function getConnectDropHandler(): ConnectDropHandler | null {
  return handler;
}
