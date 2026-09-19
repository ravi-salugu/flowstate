"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { showAppToast } from "@/lib/appToastStore";
import {
  fetchPublicationForCanvas,
  publishCanvas,
  publishedCanvasUrl,
  unpublishCanvas,
  type PublicationState,
} from "@/lib/publishedCanvasPersistence";

/**
 * "Publish to web" — the unlisted public link.
 *
 * Shares the Share modal's chrome with collaborator invites but NOTHING else:
 * no canvas_share_links, no canvas_collaborators, no 4-member cap. Publishing
 * grants neither editing nor membership, which is exactly why it has to be a
 * separate data model from the People tab next to it.
 */
export function PublishPanel({ canvasId }: { canvasId: string | null }) {
  const [publication, setPublication] = useState<PublicationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!canvasId) return;
    setLoading(true);
    try {
      setPublication(await fetchPublicationForCanvas(canvasId));
    } finally {
      setLoading(false);
    }
  }, [canvasId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const live = publication && publication.visibility !== "revoked";
  const url = publication ? publishedCanvasUrl(publication.slug) : "";

  const run = useCallback(
    async (fn: () => Promise<unknown>, done: string) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        await refresh();
        showAppToast(done);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  if (!canvasId) return null;
  if (loading) {
    return <p className="text-canvas-body-sm text-canvas-muted">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <p className="m-0 text-canvas-body-sm text-canvas-muted">
        A public link anyone can open without signing in. They can read it and
        ask their own questions — which starts them a private copy. Your canvas
        is never changed by anyone who opens it.
      </p>

      {!live ? (
        <Button
          onClick={() =>
            run(() => publishCanvas({ canvasId }), "Canvas published")
          }
          disabled={busy}
        >
          {busy ? "Publishing…" : "Publish to web"}
        </Button>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-canvas border border-canvas-border bg-canvas-bg px-3 py-2 text-canvas-body text-canvas-ink outline-none"
            />
            <Button
              onClick={() => {
                void navigator.clipboard.writeText(url);
                showAppToast("Link copied");
              }}
            >
              Copy
            </Button>
          </div>

          <div className="flex gap-6 text-canvas-body-sm text-canvas-muted">
            <span>
              <strong className="text-canvas-ink">{publication.viewCount}</strong>{" "}
              {publication.viewCount === 1 ? "view" : "views"}
            </span>
            <span>
              <strong className="text-canvas-ink">{publication.copyCount}</strong>{" "}
              {publication.copyCount === 1 ? "copy" : "copies"}
            </span>
            <span>version {publication.currentVersion}</span>
          </div>

          <p className="m-0 text-canvas-micro text-canvas-muted">
            Readers see the canvas as it was when you last published. Keep
            editing freely — publish an update when you want them to see it.
          </p>

          <div className="flex gap-2">
            <Button
              onClick={() =>
                run(() => publishCanvas({ canvasId }), "Update published")
              }
              disabled={busy}
            >
              {busy ? "Working…" : "Publish update"}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                run(() => unpublishCanvas(canvasId), "Canvas unpublished")
              }
              disabled={busy}
            >
              Unpublish
            </Button>
          </div>
        </>
      )}

      {error && (
        <p className="m-0 text-canvas-body-sm text-canvas-danger">{error}</p>
      )}
    </div>
  );
}
