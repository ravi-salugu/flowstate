/**
 * R7+ — Tracks which component is currently under the cursor during a plug
 * drag, so card / artifact-node renderers can highlight themselves as the
 * "drop target" in real time.
 *
 * Wire-up:
 *   - usePlugDragSession updates `hoverComponentId` on every pointermove
 *     using findComponentTargetAtPoint
 *   - Card.tsx + CanvasArtifactNode.tsx subscribe and apply a ring class
 *     when their own id matches
 *   - Cleared when plug drag ends
 *
 * Why a separate Zustand store and not part of the v1 canvas store:
 *   - This is purely ephemeral UI state — no need to persist, no need to
 *     undo, doesn't belong in the main store
 *   - Keeps the v1 store untouched (R4 projection pattern)
 */

import { create } from "zustand";

interface ConnectDragHoverState {
  hoverComponentId: string | null;
  setHover: (id: string | null) => void;
  clear: () => void;
}

export const useConnectDragHoverStore = create<ConnectDragHoverState>(
  (set) => ({
    hoverComponentId: null,
    setHover: (id) => set({ hoverComponentId: id }),
    clear: () => set({ hoverComponentId: null }),
  }),
);
