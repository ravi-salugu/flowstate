"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  classifyCanvasPersistChange,
  classifyCanvasPersistChangeFast,
  pickCanvasPersistSlice,
} from "@/lib/canvasPersistDirty";
import { diffSlices, opsByteSize } from "@/lib/canvasOps";
import {
  canvasOpsEnabled,
  sendCanvasOpsBroadcast,
} from "@/lib/collabOpsChannel";
import {
  buildCanvasSnapshot,
  buildEmptyCanvasSnapshot,
  mergeCanvasSnapshots,
  type CanvasSnapshot,
} from "@/lib/canvasSnapshot";
import {
  clearCanvasLocalBackup,
  readCanvasLocalBackup,
  shouldRestoreCanvasLocalBackup,
  writeCanvasLocalBackup,
} from "@/lib/canvasLocalBackup";
import { isCanvasSaveConflictError } from "@/lib/canvasSaveConflict";
import {
  createCanvas,
  createCanvasFromSnapshot,
  createDefaultCanvas,
  fetchCanvasById,
  fetchCanvasList,
  fetchUserPreferences,
  generateUntitledCanvasTitle,
  resolveInitialCanvasId,
  saveCanvasState,
  sortCanvasesByContentEditedAt,
  updateCanvasThumbnail,
  updateCanvasTitle,
  updateLastActiveCanvas,
  type CanvasMeta,
  type CanvasRow,
} from "@/lib/canvasPersistence";
import { isLocalReadOnlyClient } from "@/lib/supabase/localReadOnly";
import {
  clearGuestCanvasStash,
  readGuestCanvasStash,
} from "@/lib/guestCanvas";
import {
  formatPersistenceError,
  isStatementTimeoutError,
  SAVE_PAYLOAD_WARN_BYTES,
  withSaveRetry,
} from "@/lib/canvasSaveRetry";
import {
  deleteCanvas,
  fetchSharedCanvasList,
  snapshotWithOwnerAttribution,
} from "@/lib/collaborationPersistence";
import { deleteCanvasStorageAssets } from "@/lib/attachments";
import {
  markViewportRestoredFromSnapshot,
  resetViewportBootstrap,
} from "@/lib/canvasViewportBootstrap";
import { clearLandingAnimated } from "@/lib/motion/performance";
import type { Viewport } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { isEphemeralFixtureSessionActive } from "@/lib/ephemeralCanvasSessions";
import { isPublishedCanvasSessionActive } from "@/lib/publishedCanvasSession";
import { useCanvasStore } from "@/lib/store";
import type { PersistenceStatus, SaveStatus } from "@/lib/authTypes";

const SAVE_DEBOUNCE_MS = 800;
/** Persist viewport after pan/zoom settles so switch-time flush is lighter. */
const VIEWPORT_SAVE_DEBOUNCE_MS = 2000;
/** Max wait for pre-switch save; avoids hanging on large payloads / DB timeouts. */
const FLUSH_SAVE_DEADLINE_MS = 4_000;

function hasMeaningfulSavedViewport(viewport: Viewport): boolean {
  return viewport.x !== 0 || viewport.y !== 0 || viewport.scale !== 1;
}

interface UseCanvasPersistenceOptions {
  user: User | null;
  authLoading: boolean;
  supabaseConfigured: boolean;
  persistenceStatus: PersistenceStatus;
  setPersistenceStatus: (status: PersistenceStatus) => void;
  setSaveStatus: (status: SaveStatus) => void;
  isRemoteUpdateRef?: React.MutableRefObject<boolean>;
}

export function useCanvasPersistence({
  user,
  authLoading,
  supabaseConfigured,
  persistenceStatus,
  setPersistenceStatus,
  setSaveStatus,
  isRemoteUpdateRef,
}: UseCanvasPersistenceOptions) {
  const canvasIdRef = useRef<string | null>(null);
  /** Bumps on user change / effect cleanup so stale in-flight loads cannot hydrate. */
  const loadGenerationRef = useRef(0);
  const isHydratingRef = useRef(false);
  const isSwitchingRef = useRef(false);
  /** Blocks cloud auto-save until the first successful hydrate for this user session. */
  const initialHydrationCompleteRef = useRef(false);
  /**
   * Baseline for op-log diffs (NEXT_PUBLIC_CANVAS_OPS=1): the last slice
   * whose changes were broadcast as ops, tagged with its canvas id so a
   * canvas switch re-baselines instead of diffing across canvases. Null
   * until the first save — that save's changes ride the snapshot, so remote
   * peers never receive a "create everything" op storm.
   */
  const lastOpsSliceRef = useRef<{
    canvasId: string;
    slice: ReturnType<typeof pickCanvasPersistSlice>;
  } | null>(null);
  const isDirtyRef = useRef(false);
  const contentEditDirtyRef = useRef(false);
  /** Guards against stacking multiple idle local-backup writes. */
  const idleBackupPendingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  /** Pause viewport-only auto-save after DB statement timeout (large payload). */
  const viewportSaveBlockedUntilRef = useRef(0);
  const localReadOnlyRef = useRef(false);
  /**
   * Ephemeral (in-memory, no DB writes) mode: the localhost sandbox OR a
   * logged-out guest browsing production. Guests can create + edit canvases
   * that live only in `sessionSnapshotsRef`; nothing is persisted until they
   * sign in, at which point the active canvas is adopted (see guestCanvas.ts).
   */
  const ephemeralRef = useRef(false);
  /** Row `updated_at` from the last successful load or save — optimistic lock token. */
  const canvasUpdatedAtRef = useRef<string | null>(null);
  /** In-memory canvas state for localhost read-only session (lost on reload). */
  const sessionSnapshotsRef = useRef(new Map<string, CanvasSnapshot>());

  const [localReadOnly, setLocalReadOnly] = useState(false);
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
  const [canvases, setCanvases] = useState<CanvasMeta[]>([]);
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchingCanvasId, setSwitchingCanvasId] = useState<string | null>(
    null,
  );
  const [switchingCanvasTitle, setSwitchingCanvasTitle] = useState<
    string | null
  >(null);

  const hydrateFromSnapshot = useCanvasStore((s) => s.hydrateFromSnapshot);
  const getSnapshotSource = useCanvasStore((s) => s.getCanvasSnapshotSource);
  const resetCanvasState = useCanvasStore((s) => s.resetCanvasState);
  const closeArtifact = useCanvasStore((s) => s.closeArtifact);

  useEffect(() => {
    const readOnly = isLocalReadOnlyClient();
    localReadOnlyRef.current = readOnly;
    setLocalReadOnly(readOnly);
  }, []);

  // Keep the ephemeral flag in sync: localhost sandbox, or a signed-out guest
  // once auth has resolved (avoid flipping to guest during the initial auth
  // check, which would briefly treat a returning user as a guest).
  useEffect(() => {
    ephemeralRef.current =
      localReadOnly ||
      isPublishedCanvasSessionActive() ||
      (supabaseConfigured && !authLoading && !user);
  }, [authLoading, localReadOnly, supabaseConfigured, user]);

  const cacheActiveSessionSnapshot = useCallback(() => {
    const canvasId = canvasIdRef.current;
    if (!canvasId) return;
    sessionSnapshotsRef.current.set(
      canvasId,
      buildCanvasSnapshot(getSnapshotSource()),
    );
  }, [getSnapshotSource]);

  const bumpCanvasInList = useCallback(
    (canvasId: string, patch?: Partial<CanvasMeta>) => {
      const now = new Date().toISOString();
      setCanvases((prev) =>
        sortCanvasesByContentEditedAt(
          prev.map((c) =>
            c.id === canvasId
              ? {
                  ...c,
                  ...patch,
                  contentEditedAt: now,
                }
              : c,
          ),
        ),
      );
    },
    [],
  );

  const persistLocalBackup = useCallback(
    (canvasId: string, snapshot: CanvasSnapshot) => {
      if (!user || localReadOnlyRef.current) return;
      writeCanvasLocalBackup({
        canvasId,
        userId: user.id,
        writtenAt: Date.now(),
        dbUpdatedAt: canvasUpdatedAtRef.current,
        snapshot,
      });
    },
    [user],
  );

  const executeSave = useCallback(
    async (
      targetCanvasId: string,
      snapshotSource: ReturnType<typeof getSnapshotSource>,
      touchContentEditedAt: boolean,
    ) => {
      const payloadBytes = JSON.stringify(snapshotSource).length;

      setSaveStatus("saving");
      try {
        const supabase = createClient();
        let sourceToSave = snapshotSource;
        let expectedUpdatedAt = canvasUpdatedAtRef.current ?? undefined;

        const attemptSave = () =>
          saveCanvasState(supabase, targetCanvasId, sourceToSave, {
            touchContentEditedAt,
            expectedUpdatedAt,
          });

        let result: Awaited<ReturnType<typeof saveCanvasState>>;
        try {
          result = await withSaveRetry(attemptSave);
        } catch (err) {
          if (!isCanvasSaveConflictError(err)) throw err;

          const remote = await fetchCanvasById(supabase, targetCanvasId);
          if (!remote) throw err;

          const localSnapshot = buildCanvasSnapshot(snapshotSource);
          const merged = mergeCanvasSnapshots(remote.state, localSnapshot);
          sourceToSave = {
            ...snapshotSource,
            ...merged,
            viewport: merged.viewport,
            cards: merged.cards,
            cardOrder: merged.cardOrder,
            connections: merged.connections,
            threads: merged.threads,
            threadOrder: merged.threadOrder,
            groups: merged.groups,
            sessionArtifacts: merged.sessionArtifacts,
            canvasAssets: merged.canvasAssets,
            canvasArtifactNodes: merged.canvasArtifactNodes ?? {},
            canvasArtifactOrder: merged.canvasArtifactOrder ?? [],
            canvasAssetNodes: merged.canvasAssetNodes,
            canvasAssetOrder: merged.canvasAssetOrder,
            canvasSkills: merged.canvasSkills,
            canvasSkillNodes: merged.canvasSkillNodes,
            canvasSkillOrder: merged.canvasSkillOrder,
            canvasTextLabels: merged.canvasTextLabels ?? {},
            canvasTextLabelOrder: merged.canvasTextLabelOrder ?? [],
            canvasStrokes: merged.canvasStrokes ?? {},
            canvasStrokeOrder: merged.canvasStrokeOrder ?? [],
            canvasGifNodes: merged.canvasGifNodes,
            canvasGifOrder: merged.canvasGifOrder,
            canvas3DNodes: merged.canvas3DNodes,
            canvas3DOrder: merged.canvas3DOrder,
            uploadedAttachments: merged.uploadedAttachments ?? [],
            collaborationHasEdits: merged.collaborationHasEdits ?? false,
          };
          expectedUpdatedAt = remote.updatedAt;
          canvasUpdatedAtRef.current = remote.updatedAt;

          if (canvasIdRef.current === targetCanvasId) {
            hydrateFromSnapshot(merged, { applyViewport: false });
          }

          result = await withSaveRetry(() =>
            saveCanvasState(supabase, targetCanvasId, sourceToSave, {
              touchContentEditedAt: true,
              expectedUpdatedAt,
            }),
          );
        }

        canvasUpdatedAtRef.current = result.updatedAt;

        if (canvasIdRef.current === targetCanvasId) {
          isDirtyRef.current = false;
          contentEditDirtyRef.current = false;
          setSaveStatus("saved");
          clearCanvasLocalBackup(targetCanvasId);
          window.dispatchEvent(
            new CustomEvent("flowstate:canvas-saved", {
              detail: { canvasId: targetCanvasId },
            }),
          );
        }

        if (touchContentEditedAt) {
          bumpCanvasInList(targetCanvasId);
        }
      } catch (err) {
        console.warn("[canvas] save failed:", formatPersistenceError(err), {
          payloadBytes,
          canvasId: targetCanvasId,
          touchContentEditedAt,
          ...(payloadBytes >= SAVE_PAYLOAD_WARN_BYTES
            ? {
                hint: "Payload may exceed Supabase row limits — consider splitting artifacts",
              }
            : {}),
        });
        if (canvasIdRef.current === targetCanvasId) {
          setSaveStatus("error");
          persistLocalBackup(
            targetCanvasId,
            buildCanvasSnapshot(snapshotSource),
          );
        }
        if (!touchContentEditedAt && isStatementTimeoutError(err)) {
          // Avoid hammering Postgres with repeated full-state writes after timeout.
          viewportSaveBlockedUntilRef.current = Date.now() + 60_000;
        }
        throw err;
      }
    },
    [bumpCanvasInList, hydrateFromSnapshot, persistLocalBackup, setSaveStatus],
  );

  const performSave = useCallback(async () => {
    if (!supabaseConfigured) return;

    if (ephemeralRef.current) {
      if (isDirtyRef.current) {
        cacheActiveSessionSnapshot();
      }
      isDirtyRef.current = false;
      contentEditDirtyRef.current = false;
      return;
    }

    if (!user) return;

    if (
      isEphemeralFixtureSessionActive() ||
      useCanvasStore.getState().canvasReadOnly
    ) {
      return;
    }

    if (user && !initialHydrationCompleteRef.current) {
      return;
    }

    if (!isDirtyRef.current) {
      setSaveStatus("saved");
      return;
    }

    if (saveInFlightRef.current) {
      await saveInFlightRef.current;
      if (!isDirtyRef.current) {
        setSaveStatus("saved");
        return;
      }
    }

    const targetCanvasId = canvasIdRef.current;
    if (!targetCanvasId) return;

    const touchContentEditedAt = contentEditDirtyRef.current;
    const snapshotSource = getSnapshotSource();

    // Flag-gated op-log path: diff against the last broadcast slice and ship
    // the delta (1–5KB) to collaborators + the canvas_ops table. The full
    // snapshot save below stays authoritative during rollout — ops give
    // low-latency collab sync; postgres_changes remains the safety net.
    if (canvasOpsEnabled()) {
      try {
        const nextSlice = pickCanvasPersistSlice(useCanvasStore.getState());
        const prev = lastOpsSliceRef.current;
        if (prev && prev.canvasId === targetCanvasId) {
          const ops = diffSlices(prev.slice, nextSlice);
          if (ops.length > 0 && opsByteSize(ops) <= 256_000) {
            const batch = {
              batchId: crypto.randomUUID(),
              actorId: user.id,
              baseRev: 0,
              ops,
            };
            sendCanvasOpsBroadcast(batch);
            const supabase = createClient();
            // Table is newer than the generated database types — regenerate
            // types after applying the canvas_ops migration to drop the cast.
            void (
              supabase.from("canvas_ops") as unknown as {
                insert: (row: Record<string, unknown>) => PromiseLike<unknown>;
              }
            ).insert({
              canvas_id: targetCanvasId,
              actor_id: user.id,
              base_rev: batch.baseRev,
              ops: batch.ops,
              batch_id: batch.batchId,
            });
          }
        }
        lastOpsSliceRef.current = {
          canvasId: targetCanvasId,
          slice: nextSlice,
        };
      } catch {
        // Op-log is additive during rollout — snapshot save still runs.
      }
    }

    const savePromise = executeSave(
      targetCanvasId,
      snapshotSource,
      touchContentEditedAt,
    );

    saveInFlightRef.current = savePromise;
    try {
      await savePromise;
    } finally {
      if (saveInFlightRef.current === savePromise) {
        saveInFlightRef.current = null;
      }
    }
  }, [
    cacheActiveSessionSnapshot,
    executeSave,
    getSnapshotSource,
    setSaveStatus,
    supabaseConfigured,
    user,
  ]);

  const flushSave = useCallback(async () => {
    if (ephemeralRef.current) {
      cacheActiveSessionSnapshot();
      isDirtyRef.current = false;
      contentEditDirtyRef.current = false;
      return;
    }
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (viewportSaveTimerRef.current) {
      clearTimeout(viewportSaveTimerRef.current);
      viewportSaveTimerRef.current = null;
    }
    await performSave();
  }, [cacheActiveSessionSnapshot, performSave]);

  /** Flush dirty state; content edits always complete before switch, viewport may use a deadline. */
  const flushSaveWithDeadline = useCallback(
    async (deadlineMs = FLUSH_SAVE_DEADLINE_MS) => {
      if (!isDirtyRef.current) return;

      if (Date.now() < viewportSaveBlockedUntilRef.current) {
        void flushSave().catch(() => setSaveStatus("error"));
        return;
      }

      if (contentEditDirtyRef.current) {
        const leavingCanvasId = canvasIdRef.current;
        if (!leavingCanvasId) return;

        const snapshotSource = getSnapshotSource();
        const touchContentEditedAt = contentEditDirtyRef.current;
        try {
          await executeSave(
            leavingCanvasId,
            snapshotSource,
            touchContentEditedAt,
          );
        } catch {
          setSaveStatus("error");
        }
        return;
      }

      const savePromise = flushSave().catch(() => setSaveStatus("error"));
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        savePromise,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, deadlineMs);
        }),
      ]);
      if (timer) clearTimeout(timer);
      void savePromise;
    },
    [executeSave, flushSave, getSnapshotSource, setSaveStatus],
  );

  const isStaleLoad = useCallback((generation: number) => {
    return generation !== loadGenerationRef.current;
  }, []);

  const applyCanvasRow = useCallback(
    async (
      row: CanvasRow,
      userId: string,
      options?: { awaitLastActive?: boolean; generation?: number },
    ) => {
      const generation = options?.generation ?? loadGenerationRef.current;
      if (isStaleLoad(generation)) return;
      const isEphemeralRow = ephemeralRef.current;

      isHydratingRef.current = true;
      resetViewportBootstrap();
      closeArtifact();
      if (isStaleLoad(generation)) {
        isHydratingRef.current = false;
        return;
      }
      let state = row.state;
      let updatedAt = row.updatedAt;
      const localBackup = readCanvasLocalBackup(row.id);
      if (
        localBackup &&
        shouldRestoreCanvasLocalBackup(
          localBackup,
          userId,
          row.updatedAt,
          row.state,
        )
      ) {
        state = localBackup.snapshot;
        console.warn(
          "[canvas] restored newer local backup after reload",
          row.id,
        );
      } else if (localBackup) {
        // The DB row is authoritative — drop the stale backup so it can never
        // win a later load via the richness heuristic.
        clearCanvasLocalBackup(row.id);
      }

      hydrateFromSnapshot(state, {
        applyViewport: true,
        canvasReveal: true,
      });
      if (hasMeaningfulSavedViewport(state.viewport)) {
        markViewportRestoredFromSnapshot();
      }
      canvasIdRef.current = row.id;
      setActiveCanvasId(row.id);
      canvasUpdatedAtRef.current = updatedAt;
      if (!isStaleLoad(generation)) {
        initialHydrationCompleteRef.current = true;
      }
      const restoredFromBackup = state !== row.state;
      isDirtyRef.current = restoredFromBackup;
      contentEditDirtyRef.current = restoredFromBackup;
      if (restoredFromBackup) {
        void performSave();
      }

      if (!isEphemeralRow) {
        const supabase = createClient();
        const lastActive = updateLastActiveCanvas(supabase, userId, row.id);
        if (options?.awaitLastActive === false) {
          void lastActive.catch(() => {});
        } else {
          await lastActive;
        }
      }

      if (!isStaleLoad(generation)) {
        isHydratingRef.current = false;
      }
    },
    [closeArtifact, hydrateFromSnapshot, isStaleLoad, performSave],
  );

  const loadCanvasRow = useCallback(
    async (
      canvasId: string,
      userId: string,
      generation = loadGenerationRef.current,
    ) => {
      const supabase = createClient();
      const row = await fetchCanvasById(supabase, canvasId);
      if (!row) throw new Error("Canvas not found");
      if (isStaleLoad(generation)) return;
      await applyCanvasRow(row, userId, { generation });
    },
    [applyCanvasRow, isStaleLoad],
  );

  const loadCanvasForUser = useCallback(
    async (nextUser: User, generation = loadGenerationRef.current) => {
      if (!supabaseConfigured) {
        setPersistenceStatus("ready");
        return;
      }

      if (isStaleLoad(generation)) return;

      setPersistenceStatus("loading");
      isHydratingRef.current = true;
      initialHydrationCompleteRef.current = false;

      try {
        const supabase = createClient();
        const [list, preferences, shared] = await Promise.all([
          fetchCanvasList(supabase, nextUser.id),
          fetchUserPreferences(supabase, nextUser.id),
          fetchSharedCanvasList(supabase, nextUser.id),
        ]);

        if (isStaleLoad(generation)) return;

        setCanvases(list);

        // Save-on-signin: a guest who just authenticated has their in-memory
        // canvas stashed (across the OAuth redirect). Adopt it into a real,
        // owned canvas and land them on it instead of their last canvas.
        const guestStash = readGuestCanvasStash();
        if (guestStash) {
          clearGuestCanvasStash();
          try {
            // Publishing scrubs contributorIds / createdByUserId, so the
            // adopter is stamped as the author of what is now their canvas.
            const adoptedSnapshot = snapshotWithOwnerAttribution(
              guestStash.snapshot,
              nextUser.id,
            );

            const adopted = await createCanvasFromSnapshot(
              supabase,
              nextUser.id,
              guestStash.title,
              adoptedSnapshot,
              guestStash.lineage,
            );
            if (isStaleLoad(generation)) return;

            // Best-effort copy counter, deliberately inside the existing
            // try/catch: adoption must never fail on a statistic.
            if (guestStash.lineage?.sourcePublishedSlug) {
              void supabase.rpc("record_published_canvas_copy", {
                p_slug: guestStash.lineage.sourcePublishedSlug,
              });
            }

            hydrateFromSnapshot(adoptedSnapshot, {
              applyViewport: true,
              canvasReveal: true,
            });
            canvasIdRef.current = adopted.id;
            setActiveCanvasId(adopted.id);
            canvasUpdatedAtRef.current = adopted.updatedAt;
            isDirtyRef.current = false;
            contentEditDirtyRef.current = false;
            if (!isStaleLoad(generation)) {
              initialHydrationCompleteRef.current = true;
            }
            await updateLastActiveCanvas(supabase, nextUser.id, adopted.id);
            const refreshed = await fetchCanvasList(supabase, nextUser.id);
            if (!isStaleLoad(generation)) {
              setCanvases(refreshed);
              setSaveStatus("saved");
            }
            return;
          } catch {
            // Adoption failed — fall through to the normal load so the user
            // still lands on a working canvas.
          }
        }

        const allIds = [
          ...list.map((c) => c.id),
          ...shared.map((c) => c.id),
        ];
        let canvasId = resolveInitialCanvasId(list, preferences);
        if (
          canvasId &&
          !allIds.includes(canvasId) &&
          preferences.lastActiveCanvasId
        ) {
          canvasId = allIds.includes(preferences.lastActiveCanvasId)
            ? preferences.lastActiveCanvasId
            : canvasId;
        } else if (!canvasId && preferences.lastActiveCanvasId) {
          canvasId = allIds.includes(preferences.lastActiveCanvasId)
            ? preferences.lastActiveCanvasId
            : null;
        }

        if (canvasId) {
          await loadCanvasRow(canvasId, nextUser.id, generation);
        } else {
          if (isStaleLoad(generation)) return;
          const created = await createDefaultCanvas(supabase, nextUser.id);
          hydrateFromSnapshot(created.state, {
            applyViewport: true,
            canvasReveal: true,
          });
          canvasIdRef.current = created.id;
          setActiveCanvasId(created.id);
          canvasUpdatedAtRef.current = created.updatedAt;
          isDirtyRef.current = false;
          contentEditDirtyRef.current = false;
          if (!isStaleLoad(generation)) {
            initialHydrationCompleteRef.current = true;
          }
          await updateLastActiveCanvas(supabase, nextUser.id, created.id);
          const refreshed = await fetchCanvasList(supabase, nextUser.id);
          setCanvases(refreshed);
        }

        if (!isStaleLoad(generation)) {
          setSaveStatus("saved");
        }
      } catch {
        if (!isStaleLoad(generation)) {
          setSaveStatus("error");
        }
      } finally {
        if (!isStaleLoad(generation)) {
          isHydratingRef.current = false;
          setPersistenceStatus("ready");
        }
      }
    },
    [
      hydrateFromSnapshot,
      isStaleLoad,
      loadCanvasRow,
      setPersistenceStatus,
      setSaveStatus,
      supabaseConfigured,
    ],
  );

  const switchCanvas = useCallback(
    async (canvasId: string) => {
      if (!supabaseConfigured) return;
      if (canvasIdRef.current === canvasId) return;

      const title =
        canvases.find((c) => c.id === canvasId)?.title ?? "Canvas";
      setSwitchingCanvasId(canvasId);
      setSwitchingCanvasTitle(title);
      isSwitchingRef.current = true;
      setIsSwitching(true);

      try {
        if (ephemeralRef.current) {
          cacheActiveSessionSnapshot();
        } else {
          await flushSaveWithDeadline();
        }

        const targetMeta = canvases.find((c) => c.id === canvasId);
        const cached = sessionSnapshotsRef.current.get(canvasId);

        if (targetMeta?.localOnly || (ephemeralRef.current && cached)) {
          const state = cached ?? buildEmptyCanvasSnapshot();
          await applyCanvasRow(
            {
              id: canvasId,
              state,
              updatedAt: new Date().toISOString(),
            },
            user?.id ?? "",
            { awaitLastActive: false },
          );
        } else {
          if (!user) throw new Error("Canvas not found");
          const supabase = createClient();
          const row = await fetchCanvasById(supabase, canvasId);
          if (!row) throw new Error("Canvas not found");
          await applyCanvasRow(row, user.id, { awaitLastActive: false });
        }

        if (!ephemeralRef.current) {
          setSaveStatus("saved");
        }
      } catch {
        setSaveStatus("error");
      } finally {
        isSwitchingRef.current = false;
        setIsSwitching(false);
        setSwitchingCanvasId(null);
        setSwitchingCanvasTitle(null);
      }
    },
    [
      applyCanvasRow,
      cacheActiveSessionSnapshot,
      canvases,
      flushSaveWithDeadline,
      setSaveStatus,
      supabaseConfigured,
      user,
    ],
  );

  const createNewCanvas = useCallback(async () => {
    if (!supabaseConfigured) return null;
    // Guests (no user) get an in-memory canvas via the ephemeral branch below;
    // only the persisted branch requires a signed-in owner.
    if (!user && !ephemeralRef.current) return null;

    isSwitchingRef.current = true;
    setIsSwitching(true);
    setSwitchingCanvasTitle("New canvas");

    try {
      if (ephemeralRef.current) {
        cacheActiveSessionSnapshot();
      } else {
        await flushSaveWithDeadline();
      }

      resetCanvasState();
      resetViewportBootstrap();
      closeArtifact();
      clearLandingAnimated();

      const title = generateUntitledCanvasTitle(canvases.map((c) => c.title));
      const empty = buildEmptyCanvasSnapshot();

      if (ephemeralRef.current) {
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        sessionSnapshotsRef.current.set(id, empty);
        hydrateFromSnapshot(empty, {
          applyViewport: true,
          canvasReveal: true,
        });
        canvasIdRef.current = id;
        setActiveCanvasId(id);
        isDirtyRef.current = false;
        contentEditDirtyRef.current = false;
        initialHydrationCompleteRef.current = true;
        setCanvases((prev) =>
          sortCanvasesByContentEditedAt([
            {
              id,
              title,
              isDefault: false,
              updatedAt: now,
              contentEditedAt: now,
              localOnly: true,
            },
            ...prev,
          ]),
        );
        return id;
      }

      if (!user) return null;
      const supabase = createClient();
      const created = await createCanvas(supabase, user.id, title);

      hydrateFromSnapshot(empty, {
        applyViewport: true,
        canvasReveal: false,
      });
      canvasIdRef.current = created.id;
      setActiveCanvasId(created.id);
      isDirtyRef.current = false;
      contentEditDirtyRef.current = false;
      initialHydrationCompleteRef.current = true;
      await updateLastActiveCanvas(supabase, user.id, created.id);

      const refreshed = await fetchCanvasList(supabase, user.id);
      setCanvases(refreshed);
      setSaveStatus("saved");
      return created.id;
    } catch {
      setSaveStatus("error");
      return null;
    } finally {
      isSwitchingRef.current = false;
      setIsSwitching(false);
      setSwitchingCanvasTitle(null);
    }
  }, [
    cacheActiveSessionSnapshot,
    canvases,
    closeArtifact,
    flushSaveWithDeadline,
    hydrateFromSnapshot,
    resetCanvasState,
    setSaveStatus,
    supabaseConfigured,
    user,
  ]);

  const renameCanvas = useCallback(
    async (canvasId: string, title: string) => {
      if (!user || !supabaseConfigured) return;

      const trimmed = title.trim();
      if (!trimmed) return;

      if (!localReadOnlyRef.current) {
        const supabase = createClient();
        await updateCanvasTitle(supabase, canvasId, trimmed);
      }

      setCanvases((prev) =>
        prev.map((c) => (c.id === canvasId ? { ...c, title: trimmed } : c)),
      );
    },
    [supabaseConfigured, user],
  );

  const setCanvasThumbnail = useCallback(
    async (canvasId: string, thumbnailUrl: string | null) => {
      if (!user || !supabaseConfigured) return;

      if (!localReadOnlyRef.current) {
        const supabase = createClient();
        await updateCanvasThumbnail(supabase, canvasId, thumbnailUrl);
      }

      setCanvases((prev) =>
        prev.map((c) => (c.id === canvasId ? { ...c, thumbnailUrl } : c)),
      );
    },
    [supabaseConfigured, user],
  );

  const deleteOwnedCanvas = useCallback(
    async (canvasId: string) => {
      if (!user || !supabaseConfigured) return;

      const owned = canvases.find((c) => c.id === canvasId);
      if (!owned) return;

      const isActive = canvasIdRef.current === canvasId;
      const remaining = canvases.filter((c) => c.id !== canvasId);

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (viewportSaveTimerRef.current) {
        clearTimeout(viewportSaveTimerRef.current);
        viewportSaveTimerRef.current = null;
      }

      sessionSnapshotsRef.current.delete(canvasId);

      if (isActive) {
        isSwitchingRef.current = true;
        setIsSwitching(true);
        setSwitchingCanvasTitle(owned.title);

        canvasIdRef.current = null;
        setActiveCanvasId(null);
        isDirtyRef.current = false;
        contentEditDirtyRef.current = false;
        resetCanvasState();
        resetViewportBootstrap();
        closeArtifact();
      }

      try {
        if (localReadOnlyRef.current) {
          setCanvases(remaining);
          if (isActive && remaining.length > 0) {
            const nextId = remaining[0]?.id;
            if (nextId) {
              await switchCanvas(nextId);
            }
          }
          return;
        }

        const supabase = createClient();

        try {
          await deleteCanvasStorageAssets(supabase, user.id, canvasId);
        } catch (err) {
          console.warn("[canvas] storage cleanup failed:", err);
        }

        await deleteCanvas(supabase, canvasId);
        setCanvases(remaining);

        const prefs = await fetchUserPreferences(supabase, user.id);

        if (isActive) {
          if (remaining.length > 0) {
            const nextId = resolveInitialCanvasId(remaining, prefs);
            if (nextId) {
              const row = await fetchCanvasById(supabase, nextId);
              if (!row) throw new Error("Canvas not found");
              await applyCanvasRow(row, user.id, { awaitLastActive: false });
            }
          } else {
            const created = await createDefaultCanvas(supabase, user.id);
            hydrateFromSnapshot(created.state, {
              applyViewport: true,
              canvasReveal: true,
            });
            canvasIdRef.current = created.id;
            setActiveCanvasId(created.id);
            isDirtyRef.current = false;
            contentEditDirtyRef.current = false;
            initialHydrationCompleteRef.current = true;
            await updateLastActiveCanvas(supabase, user.id, created.id);
            const refreshed = await fetchCanvasList(supabase, user.id);
            setCanvases(refreshed);
          }
          setSaveStatus("saved");
        } else if (prefs.lastActiveCanvasId === canvasId) {
          const currentActive = canvasIdRef.current;
          if (currentActive) {
            await updateLastActiveCanvas(supabase, user.id, currentActive);
          }
        }
      } catch {
        if (!localReadOnlyRef.current) {
          const supabase = createClient();
          const list = await fetchCanvasList(supabase, user.id);
          setCanvases(list);
          setSaveStatus("error");
        }
        throw new Error("Failed to delete canvas");
      } finally {
        if (isActive) {
          isSwitchingRef.current = false;
          setIsSwitching(false);
          setSwitchingCanvasTitle(null);
        }
      }
    },
    [
      applyCanvasRow,
      canvases,
      closeArtifact,
      hydrateFromSnapshot,
      resetCanvasState,
      setSaveStatus,
      supabaseConfigured,
      switchCanvas,
      user,
    ],
  );

  useEffect(() => {
    if (!supabaseConfigured) {
      setPersistenceStatus("ready");
      return;
    }

    if (authLoading) {
      setPersistenceStatus("loading");
      return;
    }

    // A published canvas owns the store for the life of the page. Falling
    // through here would reset a guest's in-progress fork (the !user branch
    // calls resetCanvasState) or, for a signed-in visitor, load their own
    // canvas over what they came to read. Still marks ready: PublishedCanvasApp
    // waits on persistenceReady before hydrating, so returning early without
    // it would deadlock the page.
    if (isPublishedCanvasSessionActive()) {
      setPersistenceStatus("ready");
      setSaveStatus("idle");
      return;
    }

    if (!user) {
      loadGenerationRef.current += 1;
      canvasIdRef.current = null;
      setActiveCanvasId(null);
      setCanvases([]);
      isDirtyRef.current = false;
      contentEditDirtyRef.current = false;
      initialHydrationCompleteRef.current = true;
      resetCanvasState();
      resetViewportBootstrap();
      clearLandingAnimated();
      setPersistenceStatus("ready");
      setSaveStatus("idle");
      return;
    }

    initialHydrationCompleteRef.current = false;
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    void loadCanvasForUser(user, generation);

    return () => {
      loadGenerationRef.current += 1;
    };
  }, [
    authLoading,
    loadCanvasForUser,
    resetCanvasState,
    setPersistenceStatus,
    setSaveStatus,
    supabaseConfigured,
    user?.id,
  ]);

  useEffect(() => {
    const onOAuthFlush = (event: Event) => {
      const finish = (event as CustomEvent<{ finish?: () => void }>).detail
        ?.finish;
      void flushSaveWithDeadline(FLUSH_SAVE_DEADLINE_MS)
        .catch(() => {})
        .finally(() => finish?.());
    };
    window.addEventListener("flowstate:oauth-flush", onOAuthFlush);
    return () => window.removeEventListener("flowstate:oauth-flush", onOAuthFlush);
  }, [flushSaveWithDeadline]);

  useEffect(() => {
    if (
      !supabaseConfigured ||
      !user ||
      persistenceStatus !== "ready" ||
      !canvasIdRef.current
    ) {
      return;
    }

    let prevSlice = pickCanvasPersistSlice(useCanvasStore.getState());

    const scheduleSave = () => {
      if (isEphemeralFixtureSessionActive()) return;
      if (
        isHydratingRef.current ||
        isSwitchingRef.current ||
        isRemoteUpdateRef?.current ||
        !canvasIdRef.current ||
        !initialHydrationCompleteRef.current
      ) {
        return;
      }

      const nextState = useCanvasStore.getState();
      const nextSlice = pickCanvasPersistSlice(nextState);
      // Reference-only classification — this subscriber fires on EVERY store
      // write (drag pointermoves, pan/zoom frames), so it must never
      // serialize. The old classifyCanvasPersistChange cost up to six ~1MB
      // JSON.stringify calls per write on large canvases.
      const { persist, contentEdit } = classifyCanvasPersistChangeFast(
        prevSlice,
        nextSlice,
      );

      if (process.env.NODE_ENV !== "production" && Math.random() < 0.02) {
        // Sampled dev assertion (one release): the fast path may only differ
        // from the deep compare by SAFE false-positives (extra debounced
        // saves). A missed save (fast=false, slow=true) is a real bug.
        const slow = classifyCanvasPersistChange(prevSlice, nextSlice);
        if (
          (slow.persist && !persist) ||
          (slow.contentEdit && !contentEdit)
        ) {
          console.warn("[canvas-persist] fast classifier missed a change", {
            fast: { persist, contentEdit },
            slow,
          });
        }
      }

      prevSlice = nextSlice;

      if (!persist) return;

      isDirtyRef.current = true;
      if (contentEdit) {
        contentEditDirtyRef.current = true;
      }

      // Local backup writes moved OFF the per-change path — a ~1MB
      // synchronous localStorage write per pointermove was the single
      // largest source of gesture jank. Backups now ride the same debounce
      // as cloud saves, serialized during idle time (flushOnExit still
      // writes synchronously on pagehide).
      const scheduleIdleBackup = () => {
        if (!user || !canvasIdRef.current) return;
        if (idleBackupPendingRef.current) return;
        idleBackupPendingRef.current = true;
        const write = () => {
          idleBackupPendingRef.current = false;
          const activeId = canvasIdRef.current;
          if (!activeId) return;
          // The idle callback can fire mid canvas-switch — the store may
          // already hold another canvas's content. Pairing that content with
          // activeId poisons the backup, so skip; the next edit reschedules.
          if (isHydratingRef.current || isSwitchingRef.current) return;
          persistLocalBackup(
            activeId,
            buildCanvasSnapshot(
              useCanvasStore.getState().getCanvasSnapshotSource(),
            ),
          );
        };
        if (typeof requestIdleCallback === "function") {
          requestIdleCallback(write, { timeout: 2000 });
        } else {
          setTimeout(write, 250);
        }
      };

      if (contentEdit) {
        if (viewportSaveTimerRef.current) {
          clearTimeout(viewportSaveTimerRef.current);
          viewportSaveTimerRef.current = null;
        }
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          scheduleIdleBackup();
          void performSave();
        }, SAVE_DEBOUNCE_MS);
        return;
      }

      // Viewport-only: debounce so pan/zoom doesn't spam saves; still flushed on switch.
      if (Date.now() < viewportSaveBlockedUntilRef.current) {
        return;
      }
      if (viewportSaveTimerRef.current) {
        clearTimeout(viewportSaveTimerRef.current);
      }
      viewportSaveTimerRef.current = setTimeout(() => {
        scheduleIdleBackup();
        void performSave();
      }, VIEWPORT_SAVE_DEBOUNCE_MS);
    };

    const unsubscribe = useCanvasStore.subscribe(scheduleSave);

    return () => {
      unsubscribe();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (viewportSaveTimerRef.current) {
        clearTimeout(viewportSaveTimerRef.current);
      }
    };
  }, [
    isRemoteUpdateRef,
    performSave,
    persistLocalBackup,
    persistenceStatus,
    supabaseConfigured,
    user,
  ]);

  useEffect(() => {
    if (!supabaseConfigured || !user) return;

    const flushOnExit = () => {
      if (!isDirtyRef.current || !canvasIdRef.current) return;
      persistLocalBackup(
        canvasIdRef.current,
        buildCanvasSnapshot(getSnapshotSource()),
      );
      void flushSave();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flushOnExit();
      }
    };

    window.addEventListener("pagehide", flushOnExit);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flushOnExit);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [
    flushSave,
    getSnapshotSource,
    persistLocalBackup,
    supabaseConfigured,
    user,
  ]);

  const refreshOwnedCanvasList = useCallback(async () => {
    if (!user || !supabaseConfigured) return;
    const supabase = createClient();
    const list = await fetchCanvasList(supabase, user.id);
    setCanvases(list);
  }, [supabaseConfigured, user]);

  return {
    loadCanvasForUser,
    loadCanvasRow,
    canvasIdRef,
    canvasUpdatedAtRef,
    isDirtyRef,
    isHydratingRef,
    activeCanvasId,
    canvases,
    setCanvases,
    refreshOwnedCanvasList,
    switchCanvas,
    createNewCanvas,
    renameCanvas,
    setCanvasThumbnail,
    deleteOwnedCanvas,
    flushSave,
    isSwitching,
    switchingCanvasId,
    switchingCanvasTitle,
    localReadOnly,
  };
}
