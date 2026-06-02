/**
 * R8b — Parity verifier between v1 JSONB blob and v2 normalized tables.
 *
 * Usage from the browser console (in dev):
 *   await window.__verifyV1V2Parity()
 *
 * Output: a structural diff showing counts on both sides. Returns true if
 * the shapes match within tolerance, false otherwise.
 *
 * Tolerances:
 *   - Card count: must match exactly
 *   - Artifact node count: must match exactly
 *   - Thread count: must match exactly
 *   - Connection count: v2 may have MORE than v1 because the dual-write
 *     injects synthetic source-card→artifact edges; v2 should equal
 *     v1.connections.length + canvasArtifactNodes.size
 *
 * Run this BEFORE flipping NEXT_PUBLIC_USE_V2_READS=1. If parity is off,
 * something in dual-write or loadCanvasFromV2 needs fixing.
 */

import { createClient } from "@/lib/supabase/client";
import { fetchDefaultCanvas } from "@/lib/canvasPersistence";
import { loadCanvasFromV2 } from "@/lib/canvasV2Load";
import { useCanvasStore } from "@/lib/store";

export interface ParityReport {
  ok: boolean;
  canvasId: string;
  v1Counts: { cards: number; nodes: number; threads: number; connections: number };
  v2Counts: { cards: number; nodes: number; threads: number; connections: number };
  diff: string[];
}

export async function verifyV1V2Parity(): Promise<ParityReport | null> {
  if (typeof window === "undefined") return null;

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) {
    // eslint-disable-next-line no-console
    console.warn(
      "[verifyV1V2Parity] no signed-in user; sign in then call again",
    );
    return null;
  }

  // v1 path — reads canvases.state JSONB
  const v1 = await fetchDefaultCanvas(supabase, user.id);
  if (!v1) {
    // eslint-disable-next-line no-console
    console.warn("[verifyV1V2Parity] no default canvas for user");
    return null;
  }

  // v2 path — reconstruct from normalized tables
  const v2 = await loadCanvasFromV2(supabase, v1.id);
  if (!v2) {
    // eslint-disable-next-line no-console
    console.warn(
      "[verifyV1V2Parity] v2 returned null — canvas exists in v1 but not in v2 tables. Likely the dual-write never ran for this canvas. Edit anything in the canvas to trigger a save.",
    );
    return null;
  }

  const v1Counts = {
    cards: Object.keys(v1.state.cards).length,
    nodes: Object.keys(v1.state.canvasArtifactNodes ?? {}).length,
    threads: Object.keys(v1.state.threads).length,
    connections: v1.state.connections.length,
  };
  const v2Counts = {
    cards: Object.keys(v2.state.cards).length,
    nodes: Object.keys(v2.state.canvasArtifactNodes ?? {}).length,
    threads: Object.keys(v2.state.threads).length,
    connections: v2.state.connections.length,
  };

  const diff: string[] = [];
  if (v1Counts.cards !== v2Counts.cards)
    diff.push(
      `cards: v1=${v1Counts.cards}, v2=${v2Counts.cards}`,
    );
  if (v1Counts.nodes !== v2Counts.nodes)
    diff.push(`nodes: v1=${v1Counts.nodes}, v2=${v2Counts.nodes}`);
  if (v1Counts.threads !== v2Counts.threads)
    diff.push(
      `threads: v1=${v1Counts.threads}, v2=${v2Counts.threads}`,
    );
  if (v1Counts.connections !== v2Counts.connections)
    diff.push(
      `connections: v1=${v1Counts.connections}, v2=${v2Counts.connections}`,
    );

  const report: ParityReport = {
    ok: diff.length === 0,
    canvasId: v1.id,
    v1Counts,
    v2Counts,
    diff,
  };

  // eslint-disable-next-line no-console
  console.log("[verifyV1V2Parity]", report);
  return report;
}

/**
 * Attach to window in dev for quick console access. Idempotent.
 */
export function installParityHelper(): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "production") return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__verifyV1V2Parity = verifyV1V2Parity;
  // Silence the unused-import warning by also exposing the store for ad-hoc debugging.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__canvasStore = useCanvasStore;
}
