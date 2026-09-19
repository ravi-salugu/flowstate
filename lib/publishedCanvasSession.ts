import type { CanvasSnapshotSource } from "@/lib/canvasSnapshot";

let sessionActive = false;
let restoreSnapshot: CanvasSnapshotSource | null = null;

/**
 * Isolates a published canvas (/c/<slug>) from cloud persistence.
 *
 * The signed-OUT reader needs no protection — autosave is already inert for a
 * guest. The danger is the SIGNED-IN visitor: they are not ephemeral, so
 * hydrating the published snapshot marks the store dirty and the autosave
 * writes a stranger's canvas straight over their own. This is the highest-
 * consequence failure in the whole publish feature, and it is silent.
 *
 * While a session is active the visitor's real canvas is stashed, autosave is
 * suppressed, and the real canvas is hydrated back on unmount.
 */
export function beginPublishedCanvasSession(saved: CanvasSnapshotSource): void {
  sessionActive = true;
  restoreSnapshot = JSON.parse(JSON.stringify(saved)) as CanvasSnapshotSource;
}

export function endPublishedCanvasSession(): CanvasSnapshotSource | null {
  sessionActive = false;
  const snap = restoreSnapshot;
  restoreSnapshot = null;
  return snap;
}

export function isPublishedCanvasSessionActive(): boolean {
  return sessionActive;
}
