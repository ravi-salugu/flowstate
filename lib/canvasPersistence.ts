import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCanvasSnapshot,
  buildEmptyCanvasSnapshot,
  type CanvasSnapshot,
  parseCanvasSnapshot,
} from "@/lib/canvasSnapshot";
import type { Database } from "@/lib/supabase/database.types";
import type { CanvasSnapshotSource } from "@/lib/canvasSnapshot";
import { CanvasSaveConflictError } from "@/lib/canvasSaveConflict";

export interface CanvasRow {
  id: string;
  state: CanvasSnapshot;
  updatedAt: string;
}

export interface CanvasMeta {
  id: string;
  title: string;
  isDefault: boolean;
  updatedAt: string;
  contentEditedAt: string;
  /** Owner-chosen dashboard thumbnail (a canvas image asset URL); null = use placeholder. */
  thumbnailUrl?: string | null;
  /** Session-only canvas created on localhost read-only mode. */
  localOnly?: boolean;
}

export interface UserPreferences {
  lastActiveCanvasId?: string;
  hasCompletedOnboardingTour?: boolean;
}

type Supabase = SupabaseClient<Database>;

/** Cached after first PostgREST response — avoids repeated 400s pre-migration. */
let supportsExtendedCanvasColumns: boolean | undefined;

function isMissingOptionalCanvasColumn(error: {
  code?: string;
  message?: string;
}): boolean {
  const message = error.message ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    message.includes("content_edited_at") ||
    message.includes("thumbnail_url")
  );
}

function mapCanvasMetaRow(row: {
  id: string;
  title: string;
  is_default: boolean;
  updated_at: string;
  content_edited_at?: string | null;
  thumbnail_url?: string | null;
}): CanvasMeta {
  return {
    id: row.id,
    title: row.title,
    isDefault: row.is_default,
    updatedAt: row.updated_at,
    contentEditedAt: row.content_edited_at ?? row.updated_at,
    thumbnailUrl: row.thumbnail_url ?? null,
  };
}

function parsePreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== "object") return {};
  const prefs = raw as Record<string, unknown>;
  const lastActiveCanvasId = prefs.lastActiveCanvasId;
  const hasCompletedOnboardingTour = prefs.hasCompletedOnboardingTour;
  return {
    lastActiveCanvasId:
      typeof lastActiveCanvasId === "string" ? lastActiveCanvasId : undefined,
    hasCompletedOnboardingTour:
      typeof hasCompletedOnboardingTour === "boolean"
        ? hasCompletedOnboardingTour
        : undefined,
  };
}

export async function fetchUserPreferences(
  supabase: Supabase,
  userId: string,
): Promise<UserPreferences> {
  const { data, error } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return parsePreferences(data?.preferences);
}

export async function updateLastActiveCanvas(
  supabase: Supabase,
  userId: string,
  canvasId: string,
): Promise<void> {
  const existing = await fetchUserPreferences(supabase, userId);
  const { error } = await supabase
    .from("profiles")
    .update({
      preferences: {
        ...existing,
        lastActiveCanvasId: canvasId,
      } as Database["public"]["Tables"]["profiles"]["Update"]["preferences"],
    })
    .eq("id", userId);

  if (error) throw error;
}

export async function updateOnboardingTourCompleted(
  supabase: Supabase,
  userId: string,
): Promise<void> {
  const existing = await fetchUserPreferences(supabase, userId);
  const { error } = await supabase
    .from("profiles")
    .update({
      preferences: {
        ...existing,
        hasCompletedOnboardingTour: true,
      } as Database["public"]["Tables"]["profiles"]["Update"]["preferences"],
    })
    .eq("id", userId);

  if (error) throw error;
}

export async function fetchCanvasList(
  supabase: Supabase,
  userId: string,
): Promise<CanvasMeta[]> {
  if (supportsExtendedCanvasColumns !== false) {
    const { data, error } = await supabase
      .from("canvases")
      .select("id, title, is_default, updated_at, content_edited_at, thumbnail_url")
      .eq("owner_id", userId)
      .order("content_edited_at", { ascending: false, nullsFirst: false });

    if (!error) {
      supportsExtendedCanvasColumns = true;
      return (data ?? []).map(mapCanvasMetaRow);
    }

    if (!isMissingOptionalCanvasColumn(error)) {
      throw error;
    }

    supportsExtendedCanvasColumns = false;
  }

  const { data, error } = await supabase
    .from("canvases")
    .select("id, title, is_default, updated_at")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map(mapCanvasMetaRow);
}

export async function fetchCanvasById(
  supabase: Supabase,
  canvasId: string,
): Promise<CanvasRow | null> {
  const { data, error } = await supabase
    .from("canvases")
    .select("id, state, updated_at")
    .eq("id", canvasId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const snapshot = parseCanvasSnapshot(data.state);
  if (!snapshot) return null;

  return { id: data.id, state: snapshot, updatedAt: data.updated_at };
}

export async function fetchDefaultCanvas(
  supabase: Supabase,
  userId: string,
): Promise<CanvasRow | null> {
  const { data, error } = await supabase
    .from("canvases")
    .select("id, state, updated_at")
    .eq("owner_id", userId)
    .eq("is_default", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const snapshot = parseCanvasSnapshot(data.state);
  if (!snapshot) return null;

  return { id: data.id, state: snapshot, updatedAt: data.updated_at };
}

export function resolveInitialCanvasId(
  canvases: CanvasMeta[],
  preferences: UserPreferences,
): string | null {
  if (canvases.length === 0) return null;

  const lastActive = preferences.lastActiveCanvasId;
  if (lastActive && canvases.some((c) => c.id === lastActive)) {
    return lastActive;
  }

  const defaultCanvas = canvases.find((c) => c.isDefault);
  if (defaultCanvas) return defaultCanvas.id;

  return canvases[0]?.id ?? null;
}

export function generateUntitledCanvasTitle(existingTitles: string[]): string {
  const base = "Untitled canvas";
  if (!existingTitles.includes(base)) return base;

  let n = 2;
  while (existingTitles.includes(`${base} ${n}`)) {
    n += 1;
  }
  return `${base} ${n}`;
}

export async function createDefaultCanvas(
  supabase: Supabase,
  userId: string,
  source?: CanvasSnapshotSource,
): Promise<CanvasRow> {
  const snapshot = source
    ? buildCanvasSnapshot(source)
    : buildEmptyCanvasSnapshot();

  const { data, error } = await supabase
    .from("canvases")
    .insert({
      owner_id: userId,
      title: "My canvas",
      state: snapshot as unknown as Database["public"]["Tables"]["canvases"]["Insert"]["state"],
      is_default: true,
    })
    .select("id, state, updated_at")
    .single();

  if (error) throw error;

  const parsed = parseCanvasSnapshot(data.state) ?? snapshot;
  return { id: data.id, state: parsed, updatedAt: data.updated_at };
}

export async function createCanvas(
  supabase: Supabase,
  userId: string,
  title: string,
  source?: CanvasSnapshotSource,
): Promise<CanvasRow> {
  const snapshot = source
    ? buildCanvasSnapshot(source)
    : buildEmptyCanvasSnapshot();

  const { data, error } = await supabase
    .from("canvases")
    .insert({
      owner_id: userId,
      title,
      state: snapshot as unknown as Database["public"]["Tables"]["canvases"]["Insert"]["state"],
      is_default: false,
    })
    .select("id, state, updated_at")
    .single();

  if (error) throw error;

  const parsed = parseCanvasSnapshot(data.state) ?? snapshot;
  return { id: data.id, state: parsed, updatedAt: data.updated_at };
}

/** Where a canvas came from, when it started life as someone else's. */
export interface CanvasLineage {
  sourceCanvasId?: string;
  sourcePublishedSlug?: string;
  sourcePublishedVersion?: number;
}

/** Insert an already-built snapshot as-is (e.g. a sample-canvas build). */
export async function createCanvasFromSnapshot(
  supabase: Supabase,
  userId: string,
  title: string,
  snapshot: CanvasSnapshot,
  lineage?: CanvasLineage,
): Promise<CanvasRow> {
  const { data, error } = await supabase
    .from("canvases")
    .insert({
      owner_id: userId,
      title,
      state: snapshot as unknown as Database["public"]["Tables"]["canvases"]["Insert"]["state"],
      is_default: false,
      source_canvas_id: lineage?.sourceCanvasId ?? null,
      source_published_slug: lineage?.sourcePublishedSlug ?? null,
      source_published_version: lineage?.sourcePublishedVersion ?? null,
    })
    .select("id, state, updated_at")
    .single();

  if (error) throw error;

  const parsed = parseCanvasSnapshot(data.state) ?? snapshot;
  return { id: data.id, state: parsed, updatedAt: data.updated_at };
}

export function sortCanvasesByContentEditedAt(
  canvases: CanvasMeta[],
): CanvasMeta[] {
  return [...canvases].sort(
    (a, b) =>
      new Date(b.contentEditedAt).getTime() -
      new Date(a.contentEditedAt).getTime(),
  );
}

/** @deprecated Use sortCanvasesByContentEditedAt */
export const sortCanvasesByUpdatedAt = sortCanvasesByContentEditedAt;

export async function updateCanvasTitle(
  supabase: Supabase,
  canvasId: string,
  title: string,
): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Title cannot be empty");

  const { error } = await supabase
    .from("canvases")
    .update({ title: trimmed })
    .eq("id", canvasId);

  if (error) throw error;
}

/** Set (or clear, with `null`) the owner-chosen dashboard thumbnail URL. */
export async function updateCanvasThumbnail(
  supabase: Supabase,
  canvasId: string,
  thumbnailUrl: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("canvases")
    .update({ thumbnail_url: thumbnailUrl })
    .eq("id", canvasId);

  if (error) throw error;
}

export interface SaveCanvasStateOptions {
  /** Bump content_edited_at for sidebar recency sorting. */
  touchContentEditedAt?: boolean;
  /** Optimistic lock — update only if the row timestamp still matches. */
  expectedUpdatedAt?: string;
}

export interface SaveCanvasStateResult {
  updatedAt: string;
}

export async function saveCanvasState(
  supabase: Supabase,
  canvasId: string,
  source: CanvasSnapshotSource,
  options: SaveCanvasStateOptions = {},
): Promise<SaveCanvasStateResult> {
  const snapshot = buildCanvasSnapshot(source);
  const touchContentEditedAt = options.touchContentEditedAt ?? false;

  const baseUpdate = {
    state:
      snapshot as unknown as Database["public"]["Tables"]["canvases"]["Update"]["state"],
    version: 1,
  };

  const withContentEditedAt =
    touchContentEditedAt && supportsExtendedCanvasColumns !== false
      ? {
          ...baseUpdate,
          content_edited_at: new Date().toISOString(),
        }
      : baseUpdate;

  const runUpdate = async (payload: typeof baseUpdate) => {
    let query = supabase
      .from("canvases")
      .update(payload)
      .eq("id", canvasId);
    if (options.expectedUpdatedAt) {
      query = query.eq("updated_at", options.expectedUpdatedAt);
    }
    return query.select("updated_at").maybeSingle();
  };

  let { data, error } = await runUpdate(withContentEditedAt);

  if (
    error &&
    touchContentEditedAt &&
    isMissingOptionalCanvasColumn(error)
  ) {
    supportsExtendedCanvasColumns = false;
    ({ data, error } = await runUpdate(baseUpdate));
  } else if (!error && touchContentEditedAt) {
    supportsExtendedCanvasColumns = true;
  }

  if (error) throw error;

  if (options.expectedUpdatedAt && !data?.updated_at) {
    throw new CanvasSaveConflictError();
  }

  return {
    updatedAt: data?.updated_at ?? new Date().toISOString(),
  };
}
