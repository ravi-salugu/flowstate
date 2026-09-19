import { revalidateTag } from "next/cache";
import { getCurrentUser } from "@/lib/auth/currentUser.server";
import {
  isPublishableSnapshot,
  snapshotVersionOf,
} from "@/lib/published/readSnapshotBlob";
import { generatePublishedSlug } from "@/lib/published/slug";
import { scrubSnapshotForPublish } from "@/lib/published/scrubSnapshot";
import {
  assertNoPrivateAssetReferences,
  collectPrivateAssetPaths,
  copyAssetsToPublicBucket,
  rewriteAssetReferences,
} from "@/lib/published/publishAssets";
import { publishedCacheTag } from "@/lib/published/cacheTag";
import {
  createServiceRoleClient,
  isServiceRoleConfigured,
} from "@/lib/supabase/serviceRole";
import type { Json } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Publishing is the app's first canvas-adjacent API route — everything else
 * goes browser -> supabase-js under RLS. The exception is deliberate: publishing
 * has to write into a bucket no browser role may write to, and has to freeze the
 * snapshot at the server's own reading of it. Neither is possible client-side.
 */

/** A dense canvas is fine; a 10 MB one is a bad link for a phone on 4G. */
const MAX_PUBLISH_BYTES = 8 * 1024 * 1024;

const bad = (status: number, error: string) =>
  Response.json({ error }, { status });

export async function POST(req: Request) {
  // Everything is wrapped, not just the asset work. The prologue below reads
  // the canvas, the profile and any existing publication, and an unhandled
  // throw in any of it escapes as an HTML 500 with no message — which reaches
  // the owner as a bare "Request failed (500)" and is undiagnosable. A publish
  // failure must always say what went wrong.
  try {
    return await publish(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[published] publish failed", err);
    return bad(500, `Publish failed: ${message}`);
  }
}

async function publish(req: Request) {
  const user = await getCurrentUser();
  if (!user) return bad(401, "Sign in to publish a canvas.");
  if (!isServiceRoleConfigured()) {
    return bad(500, "Publishing is not configured on this deployment.");
  }

  const { canvasId, title, description } = (await req.json()) as {
    canvasId?: string;
    title?: string;
    description?: string;
  };
  if (!canvasId) return bad(400, "canvasId is required.");

  const supabase = createServiceRoleClient();

  // Ownership, checked server-side. The service role bypasses RLS, so this is
  // the only thing standing between a caller and publishing someone else's
  // canvas — it must never be relaxed to "is a collaborator".
  const { data: canvas, error: canvasError } = await supabase
    .from("canvases")
    .select("id, owner_id, title, state")
    .eq("id", canvasId)
    .maybeSingle();

  if (canvasError) return bad(500, "Could not read the canvas.");
  if (!canvas) return bad(404, "Canvas not found.");
  if (canvas.owner_id !== user.id) {
    return bad(403, "Only the owner can publish this canvas.");
  }

  const snapshot = canvas.state;
  if (!isPublishableSnapshot(snapshot)) {
    return bad(422, "This canvas has no readable content yet.");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const { data: existing } = await supabase
    .from("published_canvases")
    .select("id, slug, current_version")
    .eq("source_canvas_id", canvasId)
    .maybeSingle();

  const slug = existing?.slug ?? generatePublishedSlug();
  const version = (existing?.current_version ?? 0) + 1;
  const resolvedTitle = (title ?? canvas.title ?? "Untitled canvas").trim();

  // The row must exist before assets are copied: their storage path is keyed
  // on the published id, and a republish must not reshuffle earlier versions.
  let publishedId = existing?.id;
  if (!publishedId) {
    const { data: created, error: createError } = await supabase
      .from("published_canvases")
      .insert({
        slug,
        source_canvas_id: canvasId,
        owner_id: user.id,
        owner_display_name: profile?.display_name ?? null,
        owner_avatar_url: profile?.avatar_url ?? null,
        title: resolvedTitle,
        description: description?.trim() || null,
        current_version: 0,
      })
      .select("id")
      .single();

    if (createError || !created) return bad(500, "Could not create the publication.");
    publishedId = created.id;
  }

  try {
    const scrubbed = scrubSnapshotForPublish(snapshot);
    const paths = collectPrivateAssetPaths(scrubbed);
    const copied = await copyAssetsToPublicBucket({
      supabase,
      publishedId,
      version,
      paths,
    });
    const published = rewriteAssetReferences(scrubbed, copied);

    // Refuses rather than shipping a link whose images die in seven days, or
    // one carrying the owner's user id. See publishAssets for why this is the
    // most important check in the path.
    assertNoPrivateAssetReferences(published, user.id);

    const byteSize = Buffer.byteLength(JSON.stringify(published), "utf8");
    if (byteSize > MAX_PUBLISH_BYTES) {
      return bad(
        413,
        `This canvas is ${(byteSize / 1024 / 1024).toFixed(1)} MB, over the ${
          MAX_PUBLISH_BYTES / 1024 / 1024
        } MB publish limit. Remove some large images or split the canvas.`,
      );
    }

    const { error: versionError } = await supabase
      .from("published_canvas_versions")
      .insert({
        published_canvas_id: publishedId,
        version,
        state: published as unknown as Json,
        snapshot_version: snapshotVersionOf(snapshot),
        byte_size: byteSize,
      });

    if (versionError) return bad(500, "Could not store the published snapshot.");

    const { error: bumpError } = await supabase
      .from("published_canvases")
      .update({
        current_version: version,
        title: resolvedTitle,
        description: description?.trim() || null,
        visibility: "unlisted",
        owner_display_name: profile?.display_name ?? null,
        owner_avatar_url: profile?.avatar_url ?? null,
      })
      .eq("id", publishedId);

    if (bumpError) return bad(500, "Could not finish publishing.");

    revalidateTag(publishedCacheTag(slug));

    return Response.json({
      slug,
      version,
      byteSize,
      assetsCopied: copied.size,
      url: `/c/${slug}`,
    });
  } catch (err) {
    // Asset/scrub failures get their own message, which is already specific
    // (which object, which bucket) — surface it rather than the generic wrap.
    const message = err instanceof Error ? err.message : "Publish failed.";
    return bad(500, message);
  }
}

/**
 * Unpublish. Marks revoked rather than deleting: copies reference the slug for
 * lineage, and readers mid-session keep a working blob URL for their version.
 */
export async function DELETE(req: Request) {
  try {
    return await unpublish(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[published] unpublish failed", err);
    return bad(500, `Unpublish failed: ${message}`);
  }
}

async function unpublish(req: Request) {
  const user = await getCurrentUser();
  if (!user) return bad(401, "Sign in first.");
  if (!isServiceRoleConfigured()) return bad(500, "Not configured.");

  const { canvasId } = (await req.json()) as { canvasId?: string };
  if (!canvasId) return bad(400, "canvasId is required.");

  const supabase = createServiceRoleClient();

  const { data: row } = await supabase
    .from("published_canvases")
    .select("id, slug, owner_id")
    .eq("source_canvas_id", canvasId)
    .maybeSingle();

  if (!row) return bad(404, "This canvas is not published.");
  if (row.owner_id !== user.id) return bad(403, "Only the owner can unpublish.");

  const { error } = await supabase
    .from("published_canvases")
    .update({ visibility: "revoked" })
    .eq("id", row.id);

  if (error) return bad(500, "Could not unpublish.");

  revalidateTag(publishedCacheTag(row.slug));
  return Response.json({ ok: true });
}
