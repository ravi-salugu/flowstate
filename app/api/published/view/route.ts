import {
  createServiceRoleClient,
  isServiceRoleConfigured,
} from "@/lib/supabase/serviceRole";

export const runtime = "nodejs";

const VISITOR_COOKIE_RE = /(?:^|;\s*)fs_vid=([^;]+)/;

/**
 * View beacon, modelled on /api/track: always 204, never throws, never blocks
 * the page.
 *
 * Counting server-side in the page would only count CDN misses, which is the
 * one number nobody wants. Deduped per visitor per UTC day by the table's
 * primary key, so a reader refreshing forty times still reads as one view.
 */
export async function POST(req: Request) {
  const noContent = new Response(null, { status: 204 });

  try {
    if (!isServiceRoleConfigured()) return noContent;

    const { publishedCanvasId } = (await req.json()) as {
      publishedCanvasId?: string;
    };
    if (!publishedCanvasId) return noContent;

    const visitorId =
      req.headers.get("cookie")?.match(VISITOR_COOKIE_RE)?.[1] ?? null;
    if (!visitorId) return noContent;

    const supabase = createServiceRoleClient();

    const { error } = await supabase
      .from("published_canvas_views")
      .insert({ published_canvas_id: publishedCanvasId, visitor_id: visitorId });

    // A duplicate key just means "already counted today" — not an error, and
    // the signal that the dedupe is doing its job.
    if (error) return noContent;

    await supabase.rpc("increment_published_view", {
      p_published_canvas_id: publishedCanvasId,
    });

    return noContent;
  } catch {
    return noContent;
  }
}
