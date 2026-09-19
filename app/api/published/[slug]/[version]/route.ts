import { getPublishedCanvasState } from "@/lib/published/readPublished";

export const runtime = "nodejs";

/**
 * The published snapshot blob, on its own immutable URL.
 *
 * This route is the answer to "one canvas, a thousand listeners". The version
 * is in the path and a published version is never rewritten, so the response is
 * genuinely immutable and the CDN serves nearly every reader from the edge —
 * the origin sees about one request per version per region.
 *
 * Deliberately NOT inlined into the page's RSC payload: that would ship the
 * multi-megabyte blob twice (HTML + flight data) and make it uncacheable per
 * version.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; version: string }> },
) {
  const { slug, version } = await params;
  const versionNumber = Number.parseInt(version, 10);

  if (!Number.isFinite(versionNumber) || versionNumber < 1) {
    return Response.json({ error: "Bad version." }, { status: 400 });
  }

  const state = await getPublishedCanvasState(slug, versionNumber);
  if (!state) {
    // Also the unpublish path: the RPC stops returning revoked publications,
    // so a revoked link starts 404ing without any cache purge.
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  return new Response(JSON.stringify(state), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
    },
  });
}
