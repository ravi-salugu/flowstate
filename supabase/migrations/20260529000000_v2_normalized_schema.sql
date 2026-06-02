-- v2 normalized component schema.
--
-- Adds five new tables that will become the source of truth for canvas content:
--   threads, components, component_versions, connections, attachments
--
-- Coexists with the v1 canvases.state JSONB blob during the R1–R9 rollout.
-- Today (R1) these tables exist but nothing reads or writes them — the v1
-- canvas continues using canvases.state as before. R3 begins dual-write; R8
-- cuts reads over; R9 drops the JSONB column.
--
-- Designed single-user but collab-ready: created_by_user_id /
-- updated_by_user_id columns are populated as soon as we wire the service
-- layer (R3). Per-entity rows mean two users on the same canvas in v2 can
-- edit different components without colliding.
--
-- Idempotent (`create if not exists` / `drop ... if exists`). Safe to re-run.

-- ---------------------------------------------------------------------------
-- threads: a related family of components rendered with the same accent.
-- ---------------------------------------------------------------------------
create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.canvases(id) on delete cascade,
  title text,
  accent_color text,
  root_component_id uuid,                 -- FK constraint added below (circular)
  created_at timestamptz not null default now()
);
create index if not exists idx_threads_canvas on public.threads(canvas_id);

-- ---------------------------------------------------------------------------
-- components: THE unified canvas-node entity.
--
-- Replaces both v1 `Card` (chat) and v1 `CanvasArtifactNode` (image/table/3d/
-- ui/etc.). One row per visible node on the canvas.
-- ---------------------------------------------------------------------------
create table if not exists public.components (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.canvases(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,

  kind text not null check (kind in (
    'chat','text','image','gallery','table','code','chart','browser','3d','ui'
  )),

  -- World-space position + size
  pos_x double precision not null,
  pos_y double precision not null,
  size_w double precision,
  size_h double precision,

  -- Display metadata
  title text,
  status text not null default 'done' check (status in (
    'empty','thinking','streaming','done','error'
  )),

  -- Who/what created the row. created_by_role separates intent from identity.
  created_by_role text not null check (created_by_role in ('user','auto')),
  created_by_user_id uuid references auth.users(id),
  updated_by_user_id uuid references auth.users(id),

  -- Generation provenance for chat / regenerate flows
  prompt text,
  model_id text,

  -- Pointer to the active version row in component_versions
  current_version_id uuid,                -- FK constraint added below (circular)

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_components_canvas on public.components(canvas_id);
create index if not exists idx_components_thread on public.components(thread_id);
create index if not exists idx_components_kind on public.components(kind);

-- ---------------------------------------------------------------------------
-- component_versions: every regenerate / edit creates a new version row.
-- payload shape varies by kind; validated app-side via KindRegistry (R2+).
-- ---------------------------------------------------------------------------
create table if not exists public.component_versions (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.components(id) on delete cascade,
  version_number integer not null,
  payload jsonb not null,
  generated_from jsonb,                   -- { ancestorIds:[], promptSnapshot, modelId }
  created_at timestamptz not null default now(),
  unique (component_id, version_number)
);
create index if not exists idx_versions_component
  on public.component_versions(component_id, version_number desc);

-- Deferrable circular FKs (resolve circular ref between components and component_versions)
alter table public.components
  drop constraint if exists components_current_version_fk;
alter table public.components
  add constraint components_current_version_fk
  foreign key (current_version_id) references public.component_versions(id)
  deferrable initially deferred;

alter table public.threads
  drop constraint if exists threads_root_component_fk;
alter table public.threads
  add constraint threads_root_component_fk
  foreign key (root_component_id) references public.components(id)
  on delete set null deferrable initially deferred;

-- ---------------------------------------------------------------------------
-- connections: directed edges between components.
--
-- mode controls semantics of context flow (R5+):
--   visual     — line only, no data flow
--   context    — parent's serialized content appended to child's inherited context
--   regenerate — context + re-run child generation (creates new component_version)
-- ---------------------------------------------------------------------------
create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.canvases(id) on delete cascade,
  from_component_id uuid not null references public.components(id) on delete cascade,
  to_component_id uuid not null references public.components(id) on delete cascade,
  from_side text not null check (from_side in ('top','bottom','left','right')),
  to_side text not null check (to_side in ('top','bottom','left','right')),
  mode text not null default 'context' check (mode in ('visual','context','regenerate')),
  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (from_component_id, to_component_id),
  check (from_component_id <> to_component_id)
);
create index if not exists idx_connections_canvas on public.connections(canvas_id);
create index if not exists idx_connections_from on public.connections(from_component_id);
create index if not exists idx_connections_to on public.connections(to_component_id);

-- ---------------------------------------------------------------------------
-- attachments: user-uploaded files referenced by components. Storage in
-- Supabase Storage; this table just tracks the reference.
-- ---------------------------------------------------------------------------
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  component_id uuid references public.components(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
create index if not exists idx_attachments_component on public.attachments(component_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger on components — reuses set_updated_at() from v1 migration.
-- ---------------------------------------------------------------------------
drop trigger if exists components_updated_at on public.components;
create trigger components_updated_at
  before update on public.components
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security: every v2 table gated through canvases.owner_id =
-- auth.uid(). Mirrors the v1 pattern in
-- 20260524120000_create_profiles_canvases.sql.
-- ---------------------------------------------------------------------------
alter table public.threads            enable row level security;
alter table public.components         enable row level security;
alter table public.component_versions enable row level security;
alter table public.connections        enable row level security;
alter table public.attachments        enable row level security;

drop policy if exists "Owners full access to threads" on public.threads;
create policy "Owners full access to threads"
  on public.threads for all
  using (exists (
    select 1 from public.canvases c
    where c.id = canvas_id and c.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.canvases c
    where c.id = canvas_id and c.owner_id = auth.uid()
  ));

drop policy if exists "Owners full access to components" on public.components;
create policy "Owners full access to components"
  on public.components for all
  using (exists (
    select 1 from public.canvases c
    where c.id = canvas_id and c.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.canvases c
    where c.id = canvas_id and c.owner_id = auth.uid()
  ));

drop policy if exists "Owners full access to component_versions" on public.component_versions;
create policy "Owners full access to component_versions"
  on public.component_versions for all
  using (exists (
    select 1 from public.components co
    join public.canvases ca on ca.id = co.canvas_id
    where co.id = component_id and ca.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.components co
    join public.canvases ca on ca.id = co.canvas_id
    where co.id = component_id and ca.owner_id = auth.uid()
  ));

drop policy if exists "Owners full access to connections" on public.connections;
create policy "Owners full access to connections"
  on public.connections for all
  using (exists (
    select 1 from public.canvases c
    where c.id = canvas_id and c.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.canvases c
    where c.id = canvas_id and c.owner_id = auth.uid()
  ));

drop policy if exists "Owners manage own attachments" on public.attachments;
create policy "Owners manage own attachments"
  on public.attachments for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
