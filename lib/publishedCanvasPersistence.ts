"use client";

import { createClient } from "@/lib/supabase/client";

export interface PublicationState {
  slug: string;
  title: string;
  description: string | null;
  currentVersion: number;
  visibility: "unlisted" | "public" | "revoked";
  viewCount: number;
  copyCount: number;
  updatedAt: string;
}

/**
 * Reads the owner's own publication straight from the table under RLS, like
 * the rest of this app. Only writes go through the API route, because they
 * need the service role to touch the published asset bucket.
 */
export async function fetchPublicationForCanvas(
  canvasId: string,
): Promise<PublicationState | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("published_canvases")
    .select(
      "slug, title, description, current_version, visibility, view_count, copy_count, updated_at",
    )
    .eq("source_canvas_id", canvasId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    slug: data.slug,
    title: data.title,
    description: data.description,
    currentVersion: data.current_version,
    visibility: data.visibility,
    viewCount: data.view_count,
    copyCount: data.copy_count,
    updatedAt: data.updated_at,
  };
}

/**
 * The link an owner copies for a published canvas.
 *
 * Prefers NEXT_PUBLIC_SITE_URL so the link is always canonical, whatever the
 * owner happened to be browsing. Without it, publishing from a Vercel PREVIEW
 * deployment copies that preview's hostname — which is rotated per deployment,
 * so a link sent to an audience would quietly 404 once the preview is replaced.
 * Falls back to the current origin, which is right for localhost and for prod
 * when the env var is unset.
 */
export function publishedCanvasUrl(slug: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  const origin =
    configured || (typeof window !== "undefined" ? window.location.origin : "");
  return `${origin}/c/${slug}`;
}

async function callPublishApi(
  method: "POST" | "DELETE",
  body: Record<string, unknown>,
): Promise<{ slug?: string; error?: string }> {
  const res = await fetch("/api/published", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    slug?: string;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export function publishCanvas(args: {
  canvasId: string;
  title?: string;
  description?: string;
}) {
  return callPublishApi("POST", args);
}

export function unpublishCanvas(canvasId: string) {
  return callPublishApi("DELETE", { canvasId });
}
