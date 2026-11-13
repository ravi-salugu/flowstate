"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { CanvasGridCard } from "@/components/home/CanvasGridCard";
import { HomeHeader } from "@/components/home/HomeHeader";
import { NewCanvasCard } from "@/components/home/NewCanvasCard";
import { ImportChatCard } from "@/components/home/ImportChatCard";
import { showAppErrorToast } from "@/lib/appToastStore";
import { dedupeTitle } from "@/lib/canvasTitles";
import { createCanvasFromSnapshot } from "@/lib/canvasPersistence";
import { createClient } from "@/lib/supabase/client";
import { PaginatedGrid, type GridSlot } from "@/components/home/PaginatedGrid";
import { SectionHeading } from "@/components/home/SectionHeading";
import { useCanvasSnapshotThumbnailUrls } from "@/components/home/useCanvasSnapshotThumbnailUrls";
import { useHomeCanvasCollaborators } from "@/components/home/useHomeCanvasCollaborators";
import { WhatYouCanDoSection } from "@/components/home/WhatYouCanDoSection";
import { SearchField } from "@/components/ui/SearchField";
import { canvasTitleMatches } from "@/lib/canvasTitleSearch";

const GRID_CLASS = "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4";

export function HomeView({ onOpenCanvas }: { onOpenCanvas: () => void }) {
  const {
    user,
    supabaseConfigured,
    persistenceStatus,
    canvases,
    sharedCanvases,
    ownedCanvasShareFlags,
    isSwitchingCanvas,
    switchingCanvasId,
    switchCanvas,
    createNewCanvas,
    refreshCanvasList,
  } = useAuth();

  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const searching = query.trim().length > 0;

  const visibleCanvases = useMemo(
    () => canvases.filter((c) => canvasTitleMatches(c.title, query)),
    [canvases, query],
  );
  const visibleShared = useMemo(
    () => sharedCanvases.filter((c) => canvasTitleMatches(c.title, query)),
    [sharedCanvases, query],
  );

  // "/" jumps to the search field from anywhere on Home, unless you're
  // already typing somewhere.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const sharedCanvasIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of canvases) {
      if (ownedCanvasShareFlags[c.id]) ids.add(c.id);
    }
    for (const c of sharedCanvases) ids.add(c.id);
    return [...ids];
  }, [canvases, ownedCanvasShareFlags, sharedCanvases]);

  const membersByCanvas = useHomeCanvasCollaborators(
    sharedCanvasIds,
    Boolean(user && supabaseConfigured),
  );

  const allCanvasIds = useMemo(
    () => [...canvases.map((c) => c.id), ...sharedCanvases.map((c) => c.id)],
    [canvases, sharedCanvases],
  );
  const snapshotUrls = useCanvasSnapshotThumbnailUrls(
    allCanvasIds,
    Boolean(user && supabaseConfigured),
  );

  const handleOpen = useCallback(
    async (canvasId: string) => {
      if (isSwitchingCanvas) return;
      // Go to the canvas straight away: the workspace shows the canvas's
      // cached layout as skeletons (or the loader) while its data arrives,
      // rather than leaving Home frozen until the fetch finishes.
      const switching = switchCanvas(canvasId);
      onOpenCanvas();
      await switching;
    },
    [isSwitchingCanvas, onOpenCanvas, switchCanvas],
  );

  const handleCreate = useCallback(async () => {
    if (isSwitchingCanvas || creating) return;
    setCreating(true);
    try {
      const id = await createNewCanvas();
      if (id) onOpenCanvas();
    } finally {
      setCreating(false);
    }
  }, [createNewCanvas, creating, isSwitchingCanvas, onOpenCanvas]);

  // Upload a consolidated chat → one metered LLM call → a new canvas holding
  // just the import, opened straight away.
  const handleImportChat = useCallback(
    async (file: File) => {
      if (!user || importing || isSwitchingCanvas) return;
      setImporting(true);
      try {
        const { requestConversationImport, snapshotForImport } = await import(
          "@/lib/conversationImport/client"
        );
        const result = await requestConversationImport(file);
        if (!result.ok) {
          if (result.error) showAppErrorToast(result.error);
          return;
        }
        const title = dedupeTitle(
          result.spec.title,
          canvases.map((c) => c.title),
        );
        const created = await createCanvasFromSnapshot(
          createClient(),
          user.id,
          title,
          snapshotForImport(result.spec),
        );
        // Inserted directly, so the provider's list doesn't know it yet.
        await refreshCanvasList();
        await handleOpen(created.id);
      } catch (error) {
        showAppErrorToast(
          error instanceof Error ? error.message : "Couldn't create the canvas.",
        );
      } finally {
        setImporting(false);
      }
    },
    [canvases, handleOpen, importing, isSwitchingCanvas, refreshCanvasList, user],
  );

  const loading = supabaseConfigured && persistenceStatus !== "ready";

  const yourCanvasSlots: GridSlot[] = [
    // A search is looking for an existing canvas, so the create tile steps
    // aside rather than taking the first result's spot.
    ...(searching
      ? []
      : [
          {
            key: "new-canvas",
            node: (
              <NewCanvasCard
                disabled={!supabaseConfigured || isSwitchingCanvas}
                busy={creating}
                onCreate={() => void handleCreate()}
              />
            ),
          },
          {
            key: "import-chat",
            node: (
              <ImportChatCard
                disabled={!supabaseConfigured || !user || isSwitchingCanvas}
                busy={importing}
                onFile={(file) => void handleImportChat(file)}
              />
            ),
          },
        ]),
    ...visibleCanvases.map((canvas) => ({
      key: canvas.id,
      node: (
        <CanvasGridCard
          canvasId={canvas.id}
          title={canvas.title}
          updatedAt={canvas.contentEditedAt ?? canvas.updatedAt}
          // An owner-picked image wins over the auto-captured snapshot.
          thumbnailUrl={canvas.thumbnailUrl ?? snapshotUrls[canvas.id]}
          members={membersByCanvas[canvas.id]}
          isSwitching={isSwitchingCanvas}
          isPendingSwitch={switchingCanvasId === canvas.id}
          onOpen={() => void handleOpen(canvas.id)}
        />
      ),
    })),
  ];

  const sharedCanvasSlots: GridSlot[] = visibleShared.map((canvas) => ({
    key: canvas.id,
    node: (
      <CanvasGridCard
        canvasId={canvas.id}
        title={canvas.title}
        updatedAt={canvas.updatedAt}
        thumbnailUrl={snapshotUrls[canvas.id]}
        members={membersByCanvas[canvas.id]}
        isSwitching={isSwitchingCanvas}
        isPendingSwitch={switchingCanvasId === canvas.id}
        onOpen={() => void handleOpen(canvas.id)}
      />
    ),
  }));

  return (
    <div
      className="theme-scope-light relative h-full w-full overflow-y-auto bg-canvas-bg text-canvas-ink"
      style={{ colorScheme: "light" }}
    >
      {/* Dot-grid backdrop — echoes the canvas, fading out below the header. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgb(var(--canvas-dot) / 0.3) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
          maskImage: "linear-gradient(to bottom, black, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent)",
        }}
      />

      <HomeHeader
        search={
          user && supabaseConfigured ? (
            <SearchField
              ref={searchRef}
              value={query}
              onChange={setQuery}
              placeholder="Search canvases"
              hint="/"
              className="w-full bg-canvas-bg"
            />
          ) : undefined
        }
      />

      <div className="relative mx-auto w-full max-w-[86rem] px-6 py-8 sm:px-8">
        {(!searching || visibleCanvases.length > 0) && (
          <section>
            <SectionHeading
              title="Your canvases"
              count={searching ? visibleCanvases.length : canvases.length}
            />

            {loading ? (
              <div className={GRID_CLASS}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-[16/10] animate-pulse rounded-canvas-lg border border-canvas-border bg-canvas-card"
                  />
                ))}
              </div>
            ) : (
              // Keyed on the query so each new search starts on page one.
              <PaginatedGrid
                key={query}
                slots={yourCanvasSlots}
                gridClassName={GRID_CLASS}
              />
            )}
          </section>
        )}

        {visibleShared.length > 0 && (
          <section className={searching && visibleCanvases.length === 0 ? "" : "mt-12"}>
            <SectionHeading title="Shared with me" count={visibleShared.length} />
            <PaginatedGrid
              key={query}
              slots={sharedCanvasSlots}
              gridClassName={GRID_CLASS}
            />
          </section>
        )}

        {searching && visibleCanvases.length === 0 && visibleShared.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <p className="text-canvas-body text-canvas-ink">
              No canvases match “{query.trim()}”
            </p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-canvas-body-sm text-canvas-accent hover:underline"
            >
              Clear search
            </button>
          </div>
        )}

        {!searching && <WhatYouCanDoSection />}
      </div>
    </div>
  );
}
