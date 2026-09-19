/**
 * Storage bucket names, in a leaf module with no imports of its own.
 *
 * These used to live in lib/attachments, which imports the BROWSER Supabase
 * client and the canvas store. Importing the name from there dragged both into
 * the server bundle of the publish route — see lib/published/publishAssets.
 */

/** Private. Path shape: <user_id>/<canvas_id>/<file>. Signed URLs, 7-day TTL. */
export const ASSET_STORAGE_BUCKET = "asset-files";

/** Public read. Only assets referenced by a published snapshot are copied in. */
export const PUBLISHED_ASSET_BUCKET = "published-assets";
