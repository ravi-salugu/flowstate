"use client";

import { useAuth } from "@/components/AuthProvider";
import { buildDuplicateTitle } from "@/lib/collaborationPersistence";
import { useCanvasStore } from "@/lib/store";

/**
 * Makes the fork evident.
 *
 * A silent copy is the right mechanic but the wrong feel — someone who asks a
 * question needs to see, in the moment, that they are now working in their own
 * copy and that signing in is what keeps it. Figma's "(copy)" suffix does the
 * same job on the title; this says it in words.
 */
export function PublishedCanvasBanner() {
  const origin = useCanvasStore((s) => s.publishedOrigin);
  const { user, signInWithGoogle, supabaseConfigured } = useAuth();

  if (!origin) return null;

  const forked = origin.forked;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex justify-center px-4 pt-3">
      <div className="pointer-events-auto flex items-center gap-3 rounded-canvas border border-canvas-border/80 bg-canvas-card/95 px-4 py-2 shadow-card backdrop-blur-md">
        <div className="min-w-0">
          <p className="m-0 text-canvas-micro font-semibold uppercase tracking-wider text-canvas-muted">
            {forked ? "Your copy" : "Published canvas"}
          </p>
          <h1 className="m-0 truncate font-display text-base font-medium">
            {forked ? buildDuplicateTitle(origin.title) : origin.title}
          </h1>
          <p className="m-0 text-canvas-micro text-canvas-muted">
            {forked
              ? user
                ? "Saved to your canvases."
                : "Sign in to keep it — the original is untouched."
              : origin.ownerName
                ? `Published by ${origin.ownerName} · ask anything to start your own copy`
                : "Ask anything to start your own copy"}
          </p>
        </div>

        {forked && !user && supabaseConfigured && (
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="shrink-0 rounded-canvas bg-canvas-ink px-3 py-1.5 text-canvas-micro font-semibold text-canvas-card transition hover:opacity-90"
          >
            Sign in to keep
          </button>
        )}
      </div>
    </div>
  );
}
