"use client";

import { setActiveCanvasContext } from "@/lib/activeCanvasContext";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { useCanvasPersistence } from "@/hooks/useCanvasPersistence";
import { useCollaboration } from "@/hooks/useCollaboration";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useCanvasStore } from "@/lib/store";
import { buildCanvasSnapshot } from "@/lib/canvasSnapshot";
import { stashGuestCanvas } from "@/lib/guestCanvas";
import { buildDuplicateTitle } from "@/lib/collaborationPersistence";

import type { CanvasMeta } from "@/lib/canvasPersistence";
import type { CollaborationContextValue } from "@/hooks/useCollaboration";
import type { PersistenceStatus, SaveStatus } from "@/lib/authTypes";

interface AuthContextValue extends CollaborationContextValue {
  user: User | null;
  authLoading: boolean;
  supabaseConfigured: boolean;
  persistenceStatus: PersistenceStatus;
  saveStatus: SaveStatus;
  activeCanvasId: string | null;
  canvases: CanvasMeta[];
  isSwitchingCanvas: boolean;
  switchingCanvasId: string | null;
  switchingCanvasTitle: string | null;
  switchCanvas: (canvasId: string) => Promise<void>;
  createNewCanvas: () => Promise<string | null>;
  renameCanvas: (canvasId: string, title: string) => Promise<void>;
  setCanvasThumbnail: (
    canvasId: string,
    thumbnailUrl: string | null,
  ) => Promise<void>;
  deleteOwnedCanvas: (canvasId: string) => Promise<void>;
  duplicateCanvas: (canvasId: string) => Promise<string | null>;
  localReadOnly: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  shareModalOpen: boolean;
  setShareModalOpen: (open: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabaseConfigured = isSupabaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(supabaseConfigured);
  const [persistenceStatus, setPersistenceStatus] =
    useState<PersistenceStatus>("idle");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const setCanvasReadOnly = useCanvasStore((s) => s.setCanvasReadOnly);
  const setCollaborationActorUserId = useCanvasStore(
    (s) => s.setCollaborationActorUserId,
  );
  const isRemoteUpdateRef = useRef(false);

  const {
    activeCanvasId,
    canvases,
    switchCanvas,
    createNewCanvas: createNewCanvasRaw,
    renameCanvas,
    setCanvasThumbnail,
    deleteOwnedCanvas: deleteOwnedCanvasRaw,
    isSwitching: isSwitchingCanvas,
    switchingCanvasId,
    switchingCanvasTitle,
    loadCanvasRow,
    refreshOwnedCanvasList,
    flushSave,
    isDirtyRef,
    isHydratingRef,
    canvasUpdatedAtRef,
    localReadOnly,
  } = useCanvasPersistence({
    user,
    authLoading,
    supabaseConfigured,
    persistenceStatus,
    setPersistenceStatus,
    setSaveStatus,
    isRemoteUpdateRef,
  });

  const onCanvasJoined = useCallback(
    async (canvasId: string) => {
      if (!user) return;
      await loadCanvasRow(canvasId, user.id);
    },
    [loadCanvasRow, user],
  );

  const onRefreshCanvasList = useCallback(async () => {
    await refreshOwnedCanvasList();
  }, [refreshOwnedCanvasList]);

  const deleteOwnedCanvas = useCallback(
    async (canvasId: string) => {
      const wasActive = activeCanvasId === canvasId;
      await deleteOwnedCanvasRaw(canvasId);
      if (wasActive) setShareModalOpen(false);
    },
    [activeCanvasId, deleteOwnedCanvasRaw],
  );

  const collaboration = useCollaboration({
    user,
    supabaseConfigured,
    activeCanvasId,
    localReadOnly,
    onCanvasJoined,
    onRefreshCanvasList,
    isRemoteUpdateRef,
    isDirtyRef,
    isHydratingRef,
    canvasUpdatedAtRef,
  });

  const duplicateCanvas = useCallback(
    async (canvasId: string) => {
      if (activeCanvasId === canvasId) {
        await flushSave();
      }
      return collaboration.duplicateCanvasById(canvasId);
    },
    [activeCanvasId, collaboration.duplicateCanvasById, flushSave],
  );

  const createNewCanvas = useCallback(async () => {
    const id = await createNewCanvasRaw();
    // The creator is always the DB owner (createCanvas inserts with
    // owner_id: user.id) — seed accessInfo immediately instead of waiting
    // for refreshActiveCanvasCollaboration's fetch, so the new canvas
    // never renders read-only for its own creator. Local sessions skip the
    // seed: their canvases have no DB row, and canEdit is granted directly
    // by localReadOnly in useCollaboration.
    // Guests have no DB owner row, so skip the access seed for them.
    if (id && user && !localReadOnly) collaboration.seedOwnerAccessInfo();
    return id;
  }, [collaboration.seedOwnerAccessInfo, createNewCanvasRaw, localReadOnly, user]);

  useEffect(() => {
    const readOnly =
      Boolean(user && activeCanvasId) && !collaboration.canEdit;
    setCanvasReadOnly(readOnly);
  }, [activeCanvasId, collaboration.canEdit, setCanvasReadOnly, user]);

  useEffect(() => {
    setCollaborationActorUserId(user?.id ?? null);
  }, [setCollaborationActorUserId, user?.id]);

  // Mirrored so non-component code (the paste path in createUrlArtifact) can
  // tell where to store an image it pulls into the canvas.
  useEffect(() => {
    setActiveCanvasContext(
      user && activeCanvasId
        ? { userId: user.id, canvasId: activeCanvasId }
        : null,
    );
  }, [activeCanvasId, user]);

  useEffect(() => {
    if (!supabaseConfigured) {
      setAuthLoading(false);
      return;
    }

    const supabase = createClient();
    let cancelled = false;

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;

      setUser(session?.user ?? null);
      setAuthLoading(false);
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user ?? null;
      setUser((prev) => (prev?.id === nextUser?.id ? prev : nextUser));

      if (event === "SIGNED_OUT") {
        setSaveStatus("idle");
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [setSaveStatus, supabaseConfigured]);

  const signInWithGoogle = useCallback(async () => {
    if (!supabaseConfigured) return;

    // Guest save-on-signin: the OAuth redirect discards the in-memory canvas,
    // so stash the active guest canvas now; it's adopted on return (see
    // useCanvasPersistence.loadCanvasForUser).
    if (!user) {
      try {
        const publishedOrigin = useCanvasStore.getState().publishedOrigin;

        // On a published canvas, only stash once they have actually forked it.
        // Without this guard, a listener who merely READ the canvas and then
        // signed in would find a full copy of someone else's canvas dumped
        // into their account, which they never asked for.
        const shouldStash = !publishedOrigin || publishedOrigin.forked;

        if (shouldStash) {
          const source = useCanvasStore.getState().getCanvasSnapshotSource();
          const snapshot = buildCanvasSnapshot(source);
          const title = publishedOrigin
            ? buildDuplicateTitle(publishedOrigin.title)
            : (canvases.find((c) => c.id === activeCanvasId)?.title ??
              "My canvas");

          stashGuestCanvas(
            snapshot,
            title,
            publishedOrigin
              ? {
                  sourcePublishedSlug: publishedOrigin.slug,
                  sourcePublishedVersion: publishedOrigin.version,
                }
              : undefined,
          );
        }
      } catch {
        // Best-effort — never block sign-in on a stash failure.
      }
    }

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) throw error;
  }, [activeCanvasId, canvases, supabaseConfigured, user]);

  const signOut = useCallback(async () => {
    if (!supabaseConfigured) return;

    await flushSave();

    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, [flushSave, supabaseConfigured]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...collaboration,
      user,
      authLoading,
      supabaseConfigured,
      persistenceStatus,
      saveStatus,
      activeCanvasId,
      canvases,
      isSwitchingCanvas,
      switchingCanvasId,
      switchingCanvasTitle,
      switchCanvas,
      createNewCanvas,
      renameCanvas,
      setCanvasThumbnail,
      deleteOwnedCanvas,
      duplicateCanvas,
      localReadOnly,
      signInWithGoogle,
      signOut,
      shareModalOpen,
      setShareModalOpen,
    }),
    [
      activeCanvasId,
      authLoading,
      canvases,
      collaboration,
      createNewCanvas,
      isSwitchingCanvas,
      switchingCanvasId,
      switchingCanvasTitle,
      persistenceStatus,
      renameCanvas,
      setCanvasThumbnail,
      deleteOwnedCanvas,
      duplicateCanvas,
      localReadOnly,
      saveStatus,
      shareModalOpen,
      signInWithGoogle,
      signOut,
      supabaseConfigured,
      switchCanvas,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function usePersistenceReady(): boolean {
  const { persistenceStatus } = useAuth();
  return persistenceStatus === "ready";
}

export function useCanEditCanvas(): boolean {
  const { canEdit, user, activeCanvasId } = useAuth();
  const publishedOrigin = useCanvasStore((s) => s.publishedOrigin);
  // A published canvas is always editable, signed in or not: what the visitor
  // edits is their own in-memory fork, and they have no write path to the
  // original. A signed-in visitor would otherwise fail the canEdit check
  // below — they are not a collaborator on someone else's canvas — and lose
  // the ask button that is supposed to start the fork.
  if (publishedOrigin) return true;
  if (!user || !activeCanvasId) return true;
  return canEdit;
}
