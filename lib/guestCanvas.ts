import type { CanvasSnapshot } from "@/lib/canvasSnapshot";

// A logged-out "guest" can build a canvas entirely in memory. Google sign-in is
// a full-page OAuth redirect, so the in-memory canvas would be lost mid-flow —
// we stash it here (localStorage) just before redirecting and adopt it into the
// user's account once they land back authenticated. See useCanvasPersistence
// (adoption on load) and AuthProvider.signInWithGoogle (the stash call).

const GUEST_STASH_KEY = "flowstate:guest-adopt";
/** Ignore a stash older than this — a stale draft shouldn't ambush a later login. */
const GUEST_STASH_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

/** Where a guest's canvas came from, when it started as a published canvas. */
export interface GuestCanvasLineage {
  sourceCanvasId?: string;
  sourcePublishedSlug?: string;
  sourcePublishedVersion?: number;
}

type GuestStash = {
  snapshot: CanvasSnapshot;
  title: string;
  at: number;
  /** Optional, so stashes written before publishing existed still parse. */
  lineage?: GuestCanvasLineage;
};

/** True when the snapshot holds anything worth saving (not a blank canvas). */
export function snapshotHasContent(
  snapshot: CanvasSnapshot | null | undefined,
): boolean {
  if (!snapshot) return false;
  const countKeys = (v: unknown) =>
    v && typeof v === "object" ? Object.keys(v as object).length : 0;
  const countArr = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  const s = snapshot as unknown as Record<string, unknown>;
  return (
    countKeys(s.cards) > 0 ||
    countKeys(s.threads) > 0 ||
    countArr(s.canvasArtifactOrder) > 0 ||
    countArr(s.canvasAssetOrder) > 0 ||
    countArr(s.canvasSkillOrder) > 0 ||
    countArr(s.canvasTextLabelOrder) > 0 ||
    countArr(s.canvasStrokeOrder) > 0 ||
    countArr(s.canvasGifOrder) > 0 ||
    countArr(s.canvas3DOrder) > 0 ||
    countArr(s.sessionArtifacts) > 0
  );
}

export function stashGuestCanvas(
  snapshot: CanvasSnapshot,
  title: string,
  lineage?: GuestCanvasLineage,
): void {
  if (typeof window === "undefined") return;
  if (!snapshotHasContent(snapshot)) return;
  try {
    const payload: GuestStash = { snapshot, title, at: Date.now(), lineage };
    window.localStorage.setItem(GUEST_STASH_KEY, JSON.stringify(payload));
  } catch {
    // Storage full / disabled — adoption is best-effort, don't block sign-in.
  }
}

export function readGuestCanvasStash(): {
  snapshot: CanvasSnapshot;
  title: string;
  lineage?: GuestCanvasLineage;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(GUEST_STASH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GuestStash>;
    if (!parsed?.snapshot || !snapshotHasContent(parsed.snapshot)) return null;
    if (parsed.at && Date.now() - parsed.at > GUEST_STASH_MAX_AGE_MS) {
      clearGuestCanvasStash();
      return null;
    }
    return {
      snapshot: parsed.snapshot,
      title: parsed.title || "My canvas",
      lineage: parsed.lineage,
    };
  } catch {
    return null;
  }
}

export function clearGuestCanvasStash(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GUEST_STASH_KEY);
  } catch {
    // no-op
  }
}
