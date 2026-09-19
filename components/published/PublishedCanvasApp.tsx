"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePersistenceReady } from "@/components/AuthProvider";
import { CanvasWorkspace } from "@/components/CanvasWorkspace";
import { PublishedCanvasBanner } from "@/components/published/PublishedCanvasBanner";
import { ThemeApplier } from "@/components/ThemeApplier";
import { buildCanvasSnapshot, parseCanvasSnapshot } from "@/lib/canvasSnapshot";
import {
  markViewportRestoredFromSnapshot,
  resetViewportBootstrap,
} from "@/lib/canvasViewportBootstrap";
import {
  beginPublishedCanvasSession,
  endPublishedCanvasSession,
} from "@/lib/publishedCanvasSession";
import { useCanvasStore } from "@/lib/store";

interface PublishedCanvasAppProps {
  slug: string;
  publishedCanvasId: string;
  version: number;
  title: string;
  ownerName: string | null;
}

/**
 * Renders a published canvas on the REAL canvas, for anyone, signed in or not.
 *
 * The visitor is fully editable from the first pixel — exactly like today's
 * guest canvas — because the fork is bookkeeping, not a data operation: the
 * store already holds their copy and they have no write path to the original.
 * Read-only would be theatre, and it would disable the very ask button whose
 * click is supposed to start the fork.
 *
 * Everything here runs inside a published session, which stashes a signed-in
 * visitor's own canvas and mutes autosave. Without it, hydrating this snapshot
 * would silently overwrite their canvas.
 */
export function PublishedCanvasApp({
  slug,
  publishedCanvasId,
  version,
  title,
  ownerName,
}: PublishedCanvasAppProps) {
  const router = useRouter();
  const persistenceReady = usePersistenceReady();
  const hydrateFromSnapshot = useCanvasStore((s) => s.hydrateFromSnapshot);
  const setPublishedOrigin = useCanvasStore((s) => s.setPublishedOrigin);
  const sessionStartedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!persistenceReady || sessionStartedRef.current) return;

    // Stash the visitor's real canvas and mute autosave BEFORE touching the
    // store — the order matters, not just the fact of doing it.
    beginPublishedCanvasSession(
      useCanvasStore.getState().getCanvasSnapshotSource(),
    );
    sessionStartedRef.current = true;

    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`/api/published/${slug}/${version}`);
        if (!res.ok) throw new Error("This canvas is no longer available.");
        const raw = (await res.json()) as unknown;
        if (cancelled) return;

        const snapshot = parseCanvasSnapshot(raw);
        if (!snapshot) throw new Error("This canvas could not be read.");

        resetViewportBootstrap();
        hydrateFromSnapshot(snapshot, {
          applyViewport: true,
          canvasReveal: true,
        });
        markViewportRestoredFromSnapshot();
        setPublishedOrigin({
          slug,
          publishedCanvasId,
          version,
          title,
          ownerName,
          forked: false,
        });
        setLoaded(true);

        // Fire-and-forget view beacon. Deduped per visitor per day server-side.
        void fetch("/api/published/view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publishedCanvasId }),
        }).catch(() => {});
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    persistenceReady,
    slug,
    version,
    publishedCanvasId,
    title,
    ownerName,
    hydrateFromSnapshot,
    setPublishedOrigin,
  ]);

  // Restore the visitor's own canvas on the way out.
  useEffect(() => {
    return () => {
      if (!sessionStartedRef.current) return;
      const restore = endPublishedCanvasSession();
      sessionStartedRef.current = false;
      useCanvasStore.getState().setPublishedOrigin(null);
      if (restore) {
        resetViewportBootstrap();
        useCanvasStore
          .getState()
          .hydrateFromSnapshot(buildCanvasSnapshot(restore), {
            applyViewport: true,
            canvasReveal: false,
          });
      }
    };
  }, []);

  return (
    <main className="relative h-full w-full overflow-hidden">
      <ThemeApplier />
      {loaded && <PublishedCanvasBanner />}
      {error && (
        <div className="absolute inset-0 z-50 flex items-center justify-center">
          <p className="rounded-canvas border border-canvas-border bg-canvas-card px-6 py-4 text-canvas-muted">
            {error}
          </p>
        </div>
      )}
      {/* No Home grid on this surface — the visitor may not have an account.
          The logo goes to Flowstate itself. */}
      <CanvasWorkspace onGoHome={() => router.push("/")} />
    </main>
  );
}
