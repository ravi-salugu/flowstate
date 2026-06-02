-- =====================================================================
-- R9c — Drop the v1 canvases.state JSONB blob.
--
-- !!! DO NOT APPLY THIS MIGRATION UNTIL ALL OF THE FOLLOWING ARE TRUE !!!
--
--   1. `NEXT_PUBLIC_USE_V2_READS=1` has soaked in production for at least
--      one full operating cycle with no console.warn fallbacks to the v1
--      blob (check the `[fetchDefaultCanvas]` log lines).
--
--   2. `NEXT_PUBLIC_USE_V2_WRITES=1` is also set and has soaked AND v2 IDs
--      have been made stable (a `legacy_id text` column on v2 components
--      and connections plus dual-write upsert-by-legacy_id). Without
--      stable IDs, every save wipes attachments via ON DELETE CASCADE.
--
--   3. `__verifyV1V2Parity()` exits OK on every canvas (run it from the
--      browser console with the app in dev mode).
--
--   4. You have a recent database backup. Supabase: Dashboard → Database
--      → Backups → Create backup. This is the easiest rollback if R9 goes
--      wrong.
--
-- This migration is one-way. Once the column is gone, the JSONB blob is
-- gone. There is no automatic recovery beyond restoring from backup.
--
-- After applying:
--   - Delete the `dualWriteCanvasSnapshot()` call from `saveCanvasState`
--     (it would error on the missing column).
--   - Remove the `NEXT_PUBLIC_USE_V2_READS` / `_WRITES` env-var checks
--     from canvasPersistence.ts since v2 is now the only path.
--   - Move `state` references in `lib/canvasSnapshot.ts` and related code
--     out of the v1 shape and into v2-native types.
-- =====================================================================

-- Drop the v1 schema-version marker column.
alter table public.canvases drop column if exists version;

-- Drop the v1 JSONB blob.
alter table public.canvases drop column if exists state;

-- Optional: add typed columns for the ancillary state that lived inside
-- the blob (viewport, etc.). loadCanvasFromV2 currently returns defaults
-- for these. If you need them persisted, uncomment:
--
-- alter table public.canvases
--   add column if not exists viewport jsonb not null default
--     '{"x":0,"y":0,"scale":1}'::jsonb;
