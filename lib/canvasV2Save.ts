/**
 * R9a — Direct v2 write path.
 *
 * Same decomposition logic as `dualWriteCanvasSnapshot`, but:
 *   - skips the `canvases.state` JSONB update entirely
 *   - throws on error (instead of fail-soft) so the calling save loop knows
 *     the write actually failed
 *
 * Used by `saveCanvasState` when `NEXT_PUBLIC_USE_V2_WRITES=1`.
 *
 * Caveats:
 *   - This still uses wipe-and-reinsert per canvas, which means v2 component
 *     UUIDs change on every save. Attachments are FK'd ON DELETE CASCADE so
 *     they'd vanish on each save. **Do not turn on `USE_V2_WRITES=1` until
 *     v2 IDs are made stable** (R9 follow-up: add `legacy_id` columns and
 *     switch dual-write to upsert by legacy_id).
 *   - Left as scaffolding now so the structure is in place; the flag should
 *     stay OFF until ID stability lands.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { CanvasSnapshot } from "@/lib/canvasSnapshot";
import { dualWriteCanvasSnapshot } from "@/lib/services/dualWrite";

type Supabase = SupabaseClient<Database>;

export async function saveCanvasV2(
  supabase: Supabase,
  canvasId: string,
  snapshot: CanvasSnapshot,
): Promise<void> {
  // Re-uses the dual-write decomposer; running it with `silent: false` would
  // still console.warn on internal failure. We want to throw, so call with
  // silent: true and re-throw any error from the inner write.
  let innerErr: unknown = null;
  try {
    await dualWriteCanvasSnapshot(supabase, canvasId, snapshot, {
      silent: true,
    });
  } catch (err) {
    innerErr = err;
  }
  if (innerErr) {
    throw innerErr instanceof Error
      ? innerErr
      : new Error(String(innerErr));
  }

  // Verify we actually wrote something by counting rows. Catches the case
  // where the inner function swallows an error silently and we'd otherwise
  // think the save succeeded.
  const expected =
    Object.keys(snapshot.cards).length +
    Object.keys(snapshot.canvasArtifactNodes ?? {}).length;
  if (expected > 0) {
    const { count, error } = await supabase
      .from("components")
      .select("id", { count: "exact", head: true })
      .eq("canvas_id", canvasId);
    if (error) throw error;
    if (!count || count < 1) {
      throw new Error(
        `[saveCanvasV2] decomposition produced 0 component rows for ${expected} expected`,
      );
    }
  }
}
