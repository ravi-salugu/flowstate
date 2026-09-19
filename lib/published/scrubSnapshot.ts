/**
 * Strips from a snapshot everything that must not reach the public web.
 *
 * Two separate concerns:
 *  - PRIVACY: contributorIds / createdByUserId / asset ownerId are raw auth
 *    user UUIDs. Publishing them hands every reader a list of real user ids.
 *  - WEIGHT: uploadedAttachments carries base64 file bodies that nothing
 *    renders from the snapshot. On a canvas with a few PDFs it is most of the
 *    payload, and every reader would download it.
 *
 * Runs on a structured clone, so the owner's live canvas is untouched.
 *
 * Generic over the blob type rather than typed to CanvasSnapshot: that type
 * lives in a module which drags the client store into the server bundle, and
 * this is a plain JSON walk that does not need it.
 */
export function scrubSnapshotForPublish<T>(snapshot: T): T {
  const out = structuredClone(snapshot) as unknown as Record<string, unknown>;

  delete out.uploadedAttachments;

  const cards = (out.cards ?? {}) as Record<string, Record<string, unknown>>;
  for (const card of Object.values(cards)) {
    delete card.contributorIds;
    delete card.pendingFiles;
    delete card.customUiSource;
  }

  const artifacts = (out.sessionArtifacts ?? {}) as Record<
    string,
    { versions?: Record<string, unknown>[] }
  >;
  for (const artifact of Object.values(artifacts)) {
    for (const version of artifact.versions ?? []) {
      delete version.createdByUserId;
    }
  }

  const assets = (out.canvasAssets ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  for (const asset of Object.values(assets)) {
    delete asset.ownerId;
    delete asset.canvasId;
  }

  return out as unknown as T;
}
