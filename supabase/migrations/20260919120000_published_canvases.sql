-- Published canvases: one unlisted link, many readers, a copy each.
--
-- Deliberately SEPARATE from canvas_share_links / canvas_collaborators. Those
-- grant membership of the owner's live canvas and are capped at 4 collaborators;
-- publishing grants neither editing nor membership, and is meant to scale to
-- thousands of anonymous readers. Overloading one on the other would put a
-- podcast audience inside the collaborator cap.

-- ---------- tables ----------

create table if not exists public.published_canvases (
  id uuid primary key default gen_random_uuid(),
  -- Unguessable, not sequential: an unlisted link is only as private as its slug.
  slug text not null unique,
  source_canvas_id uuid not null references public.canvases (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  -- Denormalized at publish time so an anonymous reader can be shown "published
  -- by X" without a join into profiles, which anon cannot read.
  owner_display_name text,
  owner_avatar_url text,
  title text not null,
  description text,
  og_image_url text,
  current_version integer not null default 1,
  -- 'public' and featured_at are the gallery hook: a gallery later becomes
  -- `where visibility = 'public' order by featured_at desc`, with no migration.
  visibility text not null default 'unlisted'
    check (visibility in ('unlisted', 'public', 'revoked')),
  featured_at timestamptz,
  view_count bigint not null default 0,
  copy_count bigint not null default 0,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One publication per canvas in v1. Republishing adds a version, not a row.
  unique (source_canvas_id)
);

create table if not exists public.published_canvas_versions (
  id uuid primary key default gen_random_uuid(),
  published_canvas_id uuid not null
    references public.published_canvases (id) on delete cascade,
  version integer not null,
  -- Frozen snapshot: asset URLs already rewritten to the public bucket and
  -- user ids scrubbed. Never read the owner's live canvases.state for a reader.
  state jsonb not null,
  -- CANVAS_SNAPSHOT_VERSION at publish time. Published rows are immutable
  -- forever, so without this a future format bump breaks every existing link.
  snapshot_version integer not null default 1,
  byte_size integer not null default 0,
  created_at timestamptz not null default now(),
  unique (published_canvas_id, version)
);

-- Per-visitor-per-day view dedupe. Without it a reader refreshing forty times
-- reads as forty views and the owner's number is meaningless.
create table if not exists public.published_canvas_views (
  published_canvas_id uuid not null
    references public.published_canvases (id) on delete cascade,
  visitor_id text not null,
  day date not null default (now() at time zone 'utc')::date,
  primary key (published_canvas_id, visitor_id, day)
);

create index if not exists published_canvases_owner_idx
  on public.published_canvases (owner_id, published_at desc);

create index if not exists published_canvases_gallery_idx
  on public.published_canvases (visibility, featured_at desc)
  where visibility = 'public';

drop trigger if exists published_canvases_set_updated_at on public.published_canvases;
create trigger published_canvases_set_updated_at
  before update on public.published_canvases
  for each row execute function public.set_updated_at();

-- ---------- lineage on the copy ----------

alter table public.canvases
  add column if not exists source_canvas_id uuid
    references public.canvases (id) on delete set null,
  add column if not exists source_published_slug text,
  add column if not exists source_published_version integer;

create index if not exists canvases_source_canvas_idx
  on public.canvases (source_canvas_id);

-- ---------- RLS ----------

alter table public.published_canvases enable row level security;
alter table public.published_canvas_versions enable row level security;
alter table public.published_canvas_views enable row level security;

-- Owners read their own publications (counters, slug, dirty state) straight
-- from the browser client, like the rest of this app. Everything else is
-- service-role only: publishing has to copy assets into a bucket nobody else
-- may write to, so it cannot be a browser insert.
drop policy if exists "Owner reads own publications" on public.published_canvases;
create policy "Owner reads own publications" on public.published_canvases
  for select to authenticated using (auth.uid() = owner_id);

-- No anon SELECT policy anywhere on purpose. PostgREST would let anon issue
-- `GET /rest/v1/published_canvases?select=*` with no filter and enumerate every
-- unlisted link, which is a public gallery whether or not we built one. Anon
-- reads go through the slug-taking functions below instead.
revoke all on table public.published_canvases from anon, authenticated;
revoke all on table public.published_canvas_versions from anon, authenticated;
revoke all on table public.published_canvas_views from anon, authenticated;
grant select on table public.published_canvases to authenticated;

-- ---------- anon read path ----------

create or replace function public.get_published_canvas_meta(p_slug text)
returns table (
  id uuid,
  slug text,
  title text,
  description text,
  owner_display_name text,
  owner_avatar_url text,
  og_image_url text,
  current_version integer,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.slug, p.title, p.description, p.owner_display_name,
         p.owner_avatar_url, p.og_image_url, p.current_version,
         p.published_at, p.updated_at
  from public.published_canvases p
  where p.slug = p_slug
    and p.visibility <> 'revoked';
$$;

-- Returns one version's blob and nothing else. A revoked publication or an
-- unknown version returns no rows, so unpublishing takes effect immediately.
create or replace function public.get_published_canvas_state(
  p_slug text,
  p_version integer
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select v.state
  from public.published_canvas_versions v
  join public.published_canvases p on p.id = v.published_canvas_id
  where p.slug = p_slug
    and p.visibility <> 'revoked'
    and v.version = p_version;
$$;

-- Called once, by the adopting client, at the moment a copy is created.
create or replace function public.record_published_canvas_copy(p_slug text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.published_canvases
  set copy_count = copy_count + 1
  where slug = p_slug and visibility <> 'revoked';
$$;

grant execute on function public.get_published_canvas_meta(text) to anon, authenticated;
grant execute on function public.get_published_canvas_state(text, integer) to anon, authenticated;
grant execute on function public.record_published_canvas_copy(text) to authenticated;

-- ---------- published asset bucket ----------

-- public = true gives anon read with no policy at all. Only the service role
-- writes here, and only assets actually referenced by a published snapshot are
-- copied in — nothing else from the private bucket becomes reachable.
insert into storage.buckets (id, name, public, file_size_limit)
values ('published-assets', 'published-assets', true, 10485760)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

-- Atomic view increment. Called by the beacon only after the per-visitor-per-day
-- dedupe row inserted cleanly, so it runs once per unique reader per day.
-- Service role only: a client-callable increment is a counter anyone can inflate.
create or replace function public.increment_published_view(
  p_published_canvas_id uuid
)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.published_canvases
  set view_count = view_count + 1
  where id = p_published_canvas_id;
$$;

revoke all on function public.increment_published_view(uuid) from anon, authenticated;
