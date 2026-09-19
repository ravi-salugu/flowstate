import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublishedCanvasApp } from "@/components/published/PublishedCanvasApp";
import { getPublishedCanvasMeta } from "@/lib/published/readPublished";

// Meta only — the snapshot blob is fetched client-side from its own immutable
// route, so this page stays small and cacheable.
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = await getPublishedCanvasMeta(slug);
  if (!meta) return { title: "Canvas not found" };

  const by = meta.ownerDisplayName ? ` · by ${meta.ownerDisplayName}` : "";
  const description =
    meta.description ??
    "Explore this canvas and ask your own questions on Flowstate.";

  return {
    title: `${meta.title}${by}`,
    description,
    openGraph: {
      title: meta.title,
      description,
      type: "article",
      images: meta.ogImageUrl ? [meta.ogImageUrl] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description,
    },
  };
}

export default async function PublishedCanvasPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = await getPublishedCanvasMeta(slug);
  if (!meta) notFound();

  return (
    <PublishedCanvasApp
      slug={meta.slug}
      publishedCanvasId={meta.id}
      version={meta.currentVersion}
      title={meta.title}
      ownerName={meta.ownerDisplayName}
    />
  );
}
