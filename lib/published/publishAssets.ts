import { createHash } from "node:crypto";
import {
  ASSET_STORAGE_BUCKET,
  PUBLISHED_ASSET_BUCKET,
} from "@/lib/storageBuckets";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Re-exported so existing importers keep working.
export { PUBLISHED_ASSET_BUCKET };

/**
 * Matches any URL pointing at the PRIVATE asset bucket, signed or public form.
 * Signed URLs expire after 7 days (ASSET_SIGNED_URL_TTL_SECONDS), so a
 * published snapshot that keeps one works on publish day and shows a broken
 * image to every reader the week after — with nothing in the logs.
 */
const PRIVATE_ASSET_URL_RE = new RegExp(
  // The scheme/host prefix and the ?token= query must both be INSIDE the match,
  // or replace() swaps only the middle and leaves a mangled URL with a live
  // token still attached to it.
  `(?:https?://[^"'\\s]+?)?/storage/v1/object/(?:sign|public|authenticated)/${ASSET_STORAGE_BUCKET}/([^"'?\\s]+)(?:\\?[^"'\\s]*)?`,
  "g",
);

/** A string value anywhere in the snapshot that names a private object. */
function privatePathsInString(value: string): string[] {
  const found: string[] = [];
  for (const m of value.matchAll(PRIVATE_ASSET_URL_RE)) {
    const path = m[1];
    if (path) found.push(decodeURIComponent(path));
  }
  return found;
}

/**
 * Walks every string in the snapshot and collects private object paths.
 *
 * Deliberately GENERIC rather than enumerating artifact types. storagePath /
 * URL pairs live in CanvasAsset, CanvasSkill, AudioArtifactData,
 * Canvas3DNode.modelUrl, WebsiteArtifactData.previewImageUrl and
 * CardImage.url/thumb today — and a type-by-type list would silently miss the
 * next artifact kind someone adds, producing exactly the rot described above.
 */
export function collectPrivateAssetPaths(snapshot: unknown): Set<string> {
  const paths = new Set<string>();

  const walk = (node: unknown, key?: string): void => {
    if (typeof node === "string") {
      for (const p of privatePathsInString(node)) paths.add(p);
      // A bare storagePath carries no bucket prefix, so the URL regex misses it.
      if (key === "storagePath" && node.trim()) paths.add(node.trim());
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) walk(v, k);
    }
  };

  walk(snapshot);
  return paths;
}

export interface CopiedAsset {
  publicPath: string;
  publicUrl: string;
}

/** Stable, collision-proof destination name that leaks no user id. */
function destinationPath(
  publishedId: string,
  version: number,
  sourcePath: string,
): string {
  const hash = createHash("sha1").update(sourcePath).digest("hex").slice(0, 8);
  const base = sourcePath.split("/").pop() || "asset";
  const safe = base.replace(/[^a-zA-Z0-9_.-]+/g, "-").slice(0, 80);
  return `${publishedId}/${version}/${hash}-${safe}`;
}

/**
 * Copies each referenced private asset into the public bucket.
 *
 * Only paths actually referenced by this snapshot are copied — publishing a
 * canvas never exposes the rest of the owner's files.
 */
export async function copyAssetsToPublicBucket(args: {
  supabase: SupabaseClient<Database>;
  publishedId: string;
  version: number;
  paths: Set<string>;
}): Promise<Map<string, CopiedAsset>> {
  const { supabase, publishedId, version, paths } = args;
  const copied = new Map<string, CopiedAsset>();

  for (const sourcePath of paths) {
    const { data: blob, error: downloadError } = await supabase.storage
      .from(ASSET_STORAGE_BUCKET)
      .download(sourcePath);

    if (downloadError || !blob) {
      throw new Error(
        `Could not read "${sourcePath}" from ${ASSET_STORAGE_BUCKET}: ${
          downloadError?.message ?? "no body"
        }`,
      );
    }

    const dest = destinationPath(publishedId, version, sourcePath);
    const { error: uploadError } = await supabase.storage
      .from(PUBLISHED_ASSET_BUCKET)
      .upload(dest, blob, {
        contentType: blob.type || "application/octet-stream",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(
        `Could not write "${dest}" to ${PUBLISHED_ASSET_BUCKET}: ${uploadError.message}`,
      );
    }

    const { data } = supabase.storage
      .from(PUBLISHED_ASSET_BUCKET)
      .getPublicUrl(dest);

    copied.set(sourcePath, { publicPath: dest, publicUrl: data.publicUrl });
  }

  return copied;
}

/** Rewrites every private reference in the snapshot to its public copy. */
export function rewriteAssetReferences<T>(
  snapshot: T,
  copied: Map<string, CopiedAsset>,
): T {
  const rewriteString = (value: string, key?: string): string => {
    if (key === "storagePath") {
      const hit = copied.get(value.trim());
      return hit ? hit.publicPath : value;
    }
    return value.replace(PRIVATE_ASSET_URL_RE, (match, rawPath: string) => {
      const hit = copied.get(decodeURIComponent(rawPath));
      return hit ? hit.publicUrl : match;
    });
  };

  const walk = (node: unknown, key?: string): unknown => {
    if (typeof node === "string") return rewriteString(node, key);
    if (Array.isArray(node)) return node.map((item) => walk(item));
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) out[k] = walk(v, k);
      return out;
    }
    return node;
  };

  return walk(snapshot) as T;
}

/**
 * Refuses to publish a snapshot that still references the private bucket or
 * carries a signing token.
 *
 * This is the single most important check in the publish path. An incomplete
 * rewrite is invisible on publish day — the owner's own browser can still load
 * the signed URLs — and only fails a week later, for everyone but the owner.
 * Failing loudly here is the only way that bug ever gets caught.
 */
export function assertNoPrivateAssetReferences(
  snapshot: unknown,
  ownerId?: string,
): void {
  const json = JSON.stringify(snapshot);

  // Private storage paths are shaped `<user_id>/<canvas_id>/<file>`, so the
  // owner's auth UUID rides inside every storagePath until the rewrite swaps
  // it. If one survives, the published blob hands every reader a real user id.
  if (ownerId && json.includes(ownerId)) {
    throw new Error(
      "Publish aborted: the owner's user id survived into the published snapshot.",
    );
  }

  const leaked = json.match(
    new RegExp(`/storage/v1/object/[^"'\\s]*${ASSET_STORAGE_BUCKET}/[^"'\\s]*`),
  );
  if (leaked) {
    throw new Error(
      `Publish aborted: a reference to the private bucket survived the rewrite (${leaked[0].slice(0, 120)}). ` +
        "Publishing it would produce a link whose images break in seven days.",
    );
  }

  if (/[?&]token=/.test(json)) {
    throw new Error(
      "Publish aborted: the snapshot still carries a signed-URL token, which expires in seven days.",
    );
  }
}
