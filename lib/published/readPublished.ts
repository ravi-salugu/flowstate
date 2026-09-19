import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { publishedCacheTag } from "@/lib/published/cacheTag";
import type { Database } from "@/lib/supabase/database.types";

export interface PublishedCanvasMeta {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  ownerDisplayName: string | null;
  ownerAvatarUrl: string | null;
  ogImageUrl: string | null;
  currentVersion: number;
  publishedAt: string;
  updatedAt: string;
}

/**
 * Cookie-free anon client.
 *
 * The cookie-backed server client opts the route into dynamic rendering, which
 * would make the published page uncacheable — the opposite of what a link sent
 * to a thousand listeners needs. A published canvas is public by definition, so
 * there is no session to carry here.
 */
function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabaseClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchMeta(slug: string): Promise<PublishedCanvasMeta | null> {
  const supabase = anonClient();
  if (!supabase) return null;

  // Goes through the SECURITY DEFINER function, not the table: anon has no
  // table privileges at all, so an unlisted link cannot be enumerated.
  const { data, error } = await supabase.rpc("get_published_canvas_meta", {
    p_slug: slug,
  });
  if (error) return null;

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    ownerDisplayName: row.owner_display_name,
    ownerAvatarUrl: row.owner_avatar_url,
    ogImageUrl: row.og_image_url,
    currentVersion: row.current_version,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Cached per slug and invalidated by tag on publish/unpublish, so a thousand
 * readers cost roughly one database round trip rather than a thousand.
 */
export function getPublishedCanvasMeta(
  slug: string,
): Promise<PublishedCanvasMeta | null> {
  return unstable_cache(() => fetchMeta(slug), ["published-meta", slug], {
    tags: [publishedCacheTag(slug)],
    revalidate: 3600,
  })();
}

/** The frozen snapshot for one version. Served by the immutable blob route. */
export async function getPublishedCanvasState(
  slug: string,
  version: number,
): Promise<unknown | null> {
  const supabase = anonClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_published_canvas_state", {
    p_slug: slug,
    p_version: version,
  });
  if (error || !data) return null;
  return data;
}
