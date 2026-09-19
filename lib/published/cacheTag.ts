/** One cache tag per published canvas, so a republish invalidates only itself. */
export function publishedCacheTag(slug: string): string {
  return `published:${slug}`;
}
