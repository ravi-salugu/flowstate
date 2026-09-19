/**
 * Server-safe handling of a saved canvas blob.
 *
 * Deliberately does NOT import @/lib/canvasSnapshot. That module reaches
 * canvasBackgroundTheme -> @/lib/store -> back to canvasSnapshot, a cycle that
 * also drags the whole client store (and a PNG import) into the server bundle.
 * On the server one of those bindings evaluates undefined and publishing died
 * with "CANVAS_BACKGROUND_STYLES is not a function".
 *
 * Publishing does not need normalization anyway: the blob was already
 * normalized when it was saved, and the scrub, asset walk and rewrite are all
 * generic JSON walks. All that is needed here is a sanity check and the
 * version stamp.
 */

/** The shape every saved snapshot has. Enough to reject junk, no more. */
export function isPublishableSnapshot(state: unknown): state is
  Record<string, unknown> {
  if (!state || typeof state !== "object" || Array.isArray(state)) return false;
  const s = state as Record<string, unknown>;
  // `cards` is present on every real snapshot, empty or not.
  return typeof s.cards === "object" && s.cards !== null;
}

/**
 * The snapshot format version the blob was written in, recorded per published
 * version so a future format bump has a hook instead of breaking every link.
 */
export function snapshotVersionOf(state: Record<string, unknown>): number {
  const v = state.version;
  return typeof v === "number" && Number.isFinite(v) ? v : 1;
}
