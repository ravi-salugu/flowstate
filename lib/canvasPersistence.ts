import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCanvasSnapshot,
  type CanvasSnapshot,
  parseCanvasSnapshot,
} from "@/lib/canvasSnapshot";
import type { Database } from "@/lib/supabase/database.types";
import type { CanvasSnapshotSource } from "@/lib/canvasSnapshot";
import { dualWriteCanvasSnapshot } from "@/lib/services/dualWrite";
import { loadCanvasFromV2 } from "@/lib/canvasV2Load";
import { saveCanvasV2 } from "@/lib/canvasV2Save";

export interface DefaultCanvasRow {
  id: string;
  state: CanvasSnapshot;
}

type Supabase = SupabaseClient<Database>;

export async function fetchDefaultCanvas(
  supabase: Supabase,
  userId: string,
): Promise<DefaultCanvasRow | null> {
  const { data, error } = await supabase
    .from("canvases")
    .select("id, state")
    .eq("owner_id", userId)
    .eq("is_default", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // R8c — feature-gated v2 read path. When NEXT_PUBLIC_USE_V2_READS=1, the
  // canvas is reconstructed from the v2 normalized tables instead of
  // canvases.state. The v1 JSONB blob remains the fallback when the v2
  // load returns null (e.g., a canvas that has never been dual-written).
  //
  // Default: OFF. Turn this on only after `__verifyV1V2Parity()` reports OK
  // on real canvases.
  if (process.env.NEXT_PUBLIC_USE_V2_READS === "1") {
    try {
      const v2 = await loadCanvasFromV2(supabase, data.id);
      if (v2) {
        // eslint-disable-next-line no-console
        console.log("[fetchDefaultCanvas] using v2 read path");
        return v2;
      }
      // eslint-disable-next-line no-console
      console.warn(
        "[fetchDefaultCanvas] v2 read returned null; falling back to v1 JSONB",
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        "[fetchDefaultCanvas] v2 read failed; falling back to v1 JSONB:",
        err,
      );
    }
  }

  const snapshot = parseCanvasSnapshot(data.state);
  if (!snapshot) return null;

  return { id: data.id, state: snapshot };
}

export async function createDefaultCanvas(
  supabase: Supabase,
  userId: string,
  source: CanvasSnapshotSource,
): Promise<DefaultCanvasRow> {
  const snapshot = buildCanvasSnapshot(source);

  const { data, error } = await supabase
    .from("canvases")
    .insert({
      owner_id: userId,
      title: "My canvas",
      state: snapshot as unknown as Database["public"]["Tables"]["canvases"]["Insert"]["state"],
      is_default: true,
    })
    .select("id, state")
    .single();

  if (error) throw error;

  const parsed = parseCanvasSnapshot(data.state) ?? snapshot;
  return { id: data.id, state: parsed };
}

export async function saveCanvasState(
  supabase: Supabase,
  canvasId: string,
  source: CanvasSnapshotSource,
): Promise<void> {
  const snapshot = buildCanvasSnapshot(source);

  // R9b — feature-gated v2-only write path. When NEXT_PUBLIC_USE_V2_WRITES=1,
  // the JSONB save is skipped and we go directly to v2 tables. **DO NOT
  // turn this on yet** — current dual-write uses wipe-and-reinsert with
  // fresh UUIDs, so v2 IDs aren't stable across saves. Attachments would
  // vanish on every save (ON DELETE CASCADE). Land legacy_id stability
  // before flipping this flag.
  if (process.env.NEXT_PUBLIC_USE_V2_WRITES === "1") {
    await saveCanvasV2(supabase, canvasId, snapshot);
    return;
  }

  const { error } = await supabase
    .from("canvases")
    .update({
      state: snapshot as unknown as Database["public"]["Tables"]["canvases"]["Update"]["state"],
      version: 1,
    })
    .eq("id", canvasId);

  if (error) throw error;

  // R3 dual-write: mirror the snapshot into the v2 normalized tables.
  // Fail-soft — the v1 JSONB save above is authoritative; v2 errors are
  // logged via console.warn but never thrown. Fire-and-forget so the
  // debounced save loop in useCanvasPersistence doesn't wait on it.
  void dualWriteCanvasSnapshot(supabase, canvasId, snapshot);
}
