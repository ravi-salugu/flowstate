# FlowState — Session handoff

**Purpose:** Self-contained context dump for handing this codebase to a fresh assistant. Reading this doc + the linked source files should be enough to continue work without re-discovering the decisions, architecture, or open issues.

**Branch:** `node-changes` (off `prempradeep/main`). The prior branch `node-def` is stashed locally with all earlier work.

**Owner:** Ravi Salugu (`ravisalugu@gmail.com`). Sandbox Supabase project.

---

## 1. What FlowState is

An AI-native multi-thread research and moodboarding canvas. Users place visual "components" on a 2D canvas — chat cards, generated images, image galleries, tables, code snippets, 3D model viewers, sandboxed UI widgets, embedded browsers, charts, plain text — and link them with connectors that flow context from parent to child. When the user links two components and picks "regenerate," the child re-runs its generation with the parent's serialized payload as part of the prompt.

Built on:
- **Next.js 15** (App Router), **React 18**, **TypeScript 6**
- **Zustand 5** for client state
- **Supabase** (Auth + Postgres + Storage + RLS)
- **Anthropic Claude SDK** (`@anthropic-ai/sdk`)
- **MCP** (Model Context Protocol) integrations for image gen / external tools

Repo at `/Users/ravi/Downloads/flowstate`.

---

## 2. The original brief (paraphrased)

The user's pain on `node-changes` was the same as on the prior `node-def` branch:

1. **Random-feeling placement** when new components (especially auto-spawned artifacts like tables, galleries) appear on the canvas.
2. **Connectors don't render** / can't see them connected.
3. Components currently live in **two parallel models**: `Card` (Q&A chat) and `CanvasArtifactNode` (placement) + `SessionArtifact` (content). Should be **one polymorphic class** with a `kind` discriminator.
4. **Same-class components with overlapping properties**: gallery, image, table, browser, 3D, chat, UI widget, chart, plain text — all need to be one type.
5. **Manual drag-to-connect** between any two components.
6. **Context flow** on link (parent's payload becomes context for child's regen).
7. **Polymorphic catalog** with room to expand.

The user signed off on a phased refactor (R0–R9). Each phase has well-defined scope and pause-points for review.

### Decisions captured at the start

| Question | Answer | Implication |
|---|---|---|
| Refactor scope | **Hybrid — same file paths, rewritten internals** | No `/v2` route. `Canvas.tsx`, `Card.tsx`, etc. stay in place; internals reshape |
| Polymorphism | **One `Component<K>` class with `kind` discriminator** | Chat is just one kind |
| Storage | **Hybrid normalized** (high-value entities as rows, ephemeral state stays JSONB) | 5 new tables; old `canvases.state` JSONB blob stays for transition |
| Connector library | **Custom SVG, fix the bug, add drag-to-connect any-to-any** | Keep existing `lib/plugConnector.ts` geometry |
| Multi-user collab | **Design for it, don't implement yet** | Per-row writes, `created_by_user_id` / `updated_by_user_id` columns, no Yjs/CRDT |

---

## 3. R-phase rollout — status table

| Phase | What | Files touched | Status |
|---|---|---|---|
| **R0a** | Connector visibility fix (z-index on Connections SVG) | `components/Connections.tsx` | ✅ shipped |
| **R0b** | Replace random artifact placement with AABB lane walk | `lib/canvasArtifacts.ts`, `lib/store.ts` | ✅ shipped |
| **R1a** | Write v2 normalized schema migration | `supabase/migrations/20260529000000_v2_normalized_schema.sql` | ✅ shipped, **applied to sandbox** |
| **R1b** | Database type updates | `lib/supabase/database.types.ts` | ✅ shipped |
| **R2a** | Unified `Component<K>` discriminated union + helpers | `lib/types/component.ts` | ✅ shipped |
| **R2b** | KindRegistry singleton + validation helpers | `lib/components/KindRegistry.ts` | ✅ shipped |
| **R2c** | Per-kind specs (8 kinds: chat, text, image, gallery, table, code, 3d, ui) | `lib/components/kinds/*Kind.ts` + `index.ts` | ✅ shipped |
| **R3a** | Service-layer types | `lib/services/types.ts` | ✅ shipped |
| **R3b** | ComponentService + ConnectionService + CanvasService | `lib/services/{Component,Connection,Canvas}Service.ts` | ✅ shipped |
| **R3c** | GenerationService + PlacementService stubs | `lib/services/{Generation,Placement}Service.ts` | ✅ shipped |
| **R3d** | dualWrite snapshot decomposer | `lib/services/dualWrite.ts` | ✅ shipped (dedupe added after R6a) |
| **R3e** | Hook dualWrite into saveCanvasState | `lib/canvasPersistence.ts` | ✅ shipped (fail-soft) |
| **R4a** | Unified Component projection | `lib/components/projection.ts` | ✅ shipped |
| **R4b** | ComponentRenderer dispatch | `components/ComponentRenderer.tsx` | ✅ shipped |
| **R4c** | Wire Canvas.tsx render loops through ComponentRenderer | `components/Canvas.tsx` | ✅ shipped |
| **R5a** | ConnectionModeModal | `components/ConnectionModeModal.tsx` | ✅ shipped |
| **R5b** | Drag-to-connect handler bus + detection | `lib/connectDropBus.ts`, `hooks/usePlugDragSession.ts`, `lib/plugGeometry.ts` | ✅ shipped |
| **R5c** | Persist via local mirror + render layer | `lib/v2ConnectionsStore.ts`, `components/V2ConnectDropManager.tsx`, `components/V2Connections.tsx` | ✅ shipped |
| **R6a** | Persist manual connections via v1 store + dual-write picks up | `lib/v2ConnectionsStore.ts`, `components/V2ConnectDropManager.tsx`, `components/Connections.tsx` | ✅ shipped (with dedup fix in `dualWrite.ts`) |
| **R6b** | Cycle detection on manual link | `components/V2ConnectDropManager.tsx` | ✅ shipped |
| **R6c** | Regenerate flow for **chat-kind** targets (others throw toast) | `app/api/components/[id]/regenerate/route.ts`, `components/V2ConnectDropManager.tsx`, `components/V2Connections.tsx` | ✅ shipped (chat only — see open items) |
| **R7a** | Unified `computePlacement` | `lib/canvas/placement.ts` | ✅ shipped |
| **R7b** | Route `computeDefaultSpawnPosition` through unified service | `lib/canvasArtifacts.ts` | ✅ shipped |
| **R7c** | Route `computeFollowUpPosition` through unified service | `lib/canvasLayout.ts`, `lib/store.ts` | ✅ shipped |
| **R7d** | Hide redundant in-card artifact pill when canvas node exists | `components/artifacts/CardArtifactPreview.tsx` | ✅ shipped |
| **R7+** | Drop-target highlight (green ring) during plug drag | `lib/connectDragHoverStore.ts`, `hooks/usePlugDragSession.ts`, `components/Card.tsx`, `components/CanvasArtifactNode.tsx` | ✅ shipped |
| **R8a** | `loadCanvasFromV2` read path | `lib/canvasV2Load.ts` | ✅ scaffolded |
| **R8b** | `__verifyV1V2Parity` console helper | `lib/canvasV2Parity.ts`, `components/Canvas.tsx` (mounts) | ✅ scaffolded |
| **R8c** | Feature flag `NEXT_PUBLIC_USE_V2_READS` gates v2 reads | `lib/canvasPersistence.ts` | ✅ scaffolded — **flag OFF** |
| **R9a** | `saveCanvasV2` direct write path | `lib/canvasV2Save.ts` | ✅ scaffolded |
| **R9b** | Feature flag `NEXT_PUBLIC_USE_V2_WRITES` gates v2 writes | `lib/canvasPersistence.ts` | ✅ scaffolded — **flag OFF** |
| **R9c** | Column-drop migration | `supabase/migrations/20260601000001_drop_v1_state_blob.sql` | ✅ scaffolded — **NOT applied** |

**Where we paused:** parity check (R8b verification) found one orphan artifact node in the v1 blob (sourceCard deleted, node lingering). Documented cleanup procedure given to user. After cleanup, parity is expected to be OK and the user can flip `NEXT_PUBLIC_USE_V2_READS=1`.

Also fixed a re-render loop in `V2ConnectDropManager.tsx` that was spamming "registering / clearing connect handler" logs — switched to a `commitRef` pattern.

---

## 4. Codebase map — new/modified files

```
flowstate/
├── app/
│   ├── api/
│   │   ├── chat/route.ts                                    ← v1 chat SSE (unchanged)
│   │   └── components/[id]/regenerate/route.ts             ← R6c — Anthropic JSON regen
│   ├── auth/...                                             ← unchanged
│   ├── layout.tsx, page.tsx                                 ← unchanged
│   └── globals.css                                          ← unchanged
│
├── components/
│   ├── Canvas.tsx                                           ← R4c + R7+ wired; mounts V2 layers
│   ├── Card.tsx                                             ← R7+ green-ring drop target highlight, R7d pill conditional, plug always-visible during drag, empty-card menu enabled
│   ├── CanvasArtifactNode.tsx                               ← R7+ green-ring highlight, data-canvas-artifact={node.id}, plug always-visible during drag
│   ├── CardQaMenu.tsx                                       ← shows on empty cards now (R7 polish)
│   ├── Connections.tsx                                      ← R0a z-index fix, R6a skip-mirrored filter
│   ├── ComponentRenderer.tsx                                ← R4b dispatch by kind
│   ├── ConnectionModeModal.tsx                              ← R5a, stopPropagation fix
│   ├── V2ConnectDropManager.tsx                             ← R5c+R6 modal+regen wiring (commitRef pattern after spam fix)
│   ├── V2Connections.tsx                                    ← R5c SVG layer for manual edges
│   └── artifacts/CardArtifactPreview.tsx                    ← R7d hide pill when canvas node exists
│
├── hooks/
│   └── usePlugDragSession.ts                                ← R5b drop-to-connect routing + R7+ hover store updates
│
├── lib/
│   ├── canvas/
│   │   └── placement.ts                                     ← R7a unified computePlacement (AABB lane walk)
│   ├── canvasArtifacts.ts                                   ← R7b thin wrapper; uses unified placement
│   ├── canvasLayout.ts                                      ← R7c thin wrapper; uses unified placement; CanvasLayoutState gained optional canvasArtifactNodes
│   ├── canvasPersistence.ts                                 ← R3e dual-write hook + R8c/R9b feature flag gates
│   ├── canvasV2Load.ts                                      ← R8a v2 read path
│   ├── canvasV2Save.ts                                      ← R9a v2 write path
│   ├── canvasV2Parity.ts                                    ← R8b verify helper (window.__verifyV1V2Parity)
│   ├── components/
│   │   ├── KindRegistry.ts                                  ← R2b
│   │   ├── projection.ts                                    ← R4a unified projection
│   │   └── kinds/
│   │       ├── index.ts                                     ← auto-registers all 8
│   │       ├── chatKind.ts                                  ← R2c
│   │       ├── textKind.ts
│   │       ├── imageKind.ts
│   │       ├── galleryKind.ts
│   │       ├── tableKind.ts
│   │       ├── codeKind.ts
│   │       ├── threeDKind.ts
│   │       └── uiKind.ts
│   ├── connectDragHoverStore.ts                             ← R7+ green-ring hover state
│   ├── connectDropBus.ts                                    ← R5b module-level handler bus
│   ├── plugGeometry.ts                                      ← R5b findComponentTargetAtPoint + nearestEdge
│   ├── services/
│   │   ├── types.ts                                         ← R3a service-layer types
│   │   ├── ComponentService.ts                              ← R3b CRUD + version history
│   │   ├── ConnectionService.ts                             ← R3b graph ops + cycle detection
│   │   ├── CanvasService.ts                                 ← R3b canvas lifecycle + loadSnapshot
│   │   ├── GenerationService.ts                             ← R3c stub (real impl in /api/.../regenerate)
│   │   ├── PlacementService.ts                              ← R3c lane-walk stub
│   │   └── dualWrite.ts                                     ← R3d snapshot decomposer + R6a dedup
│   ├── store.ts                                             ← R7c layoutStateFrom now includes canvasArtifactNodes
│   ├── supabase/
│   │   ├── client.ts                                        ← unchanged
│   │   ├── server.ts                                        ← unchanged
│   │   └── database.types.ts                                ← R1b extended with v2 tables + enum unions
│   ├── types/
│   │   └── component.ts                                     ← R2a Component<K> + ComponentPayload union
│   └── v2ConnectionsStore.ts                                ← R5c local Zustand for manual links with mode
│
└── supabase/migrations/
    ├── 20260524120000_create_profiles_canvases.sql          ← v1 (pre-existing)
    ├── 20260529000000_v2_normalized_schema.sql              ← R1 (applied)
    └── 20260601000001_drop_v1_state_blob.sql                ← R9c (NOT applied — gated)
```

---

## 5. Database schema

Two layers in the same Supabase database.

### v1 (legacy, currently authoritative for reads)

- `auth.users` — Supabase-managed
- `public.profiles` — extends auth.users
- `public.canvases` — has the `state` JSONB blob containing the full v1 snapshot
- `public.canvas_collaborators` — sharing table, mostly unused

### v2 (normalized, populated by dual-write)

Defined in `supabase/migrations/20260529000000_v2_normalized_schema.sql`:

```
public.threads               (id, canvas_id, title, accent_color, root_component_id, created_at)
public.components            (id, canvas_id, thread_id, kind, pos_x/y, size_w/h, title,
                              status, created_by_role, created_by_user_id, updated_by_user_id,
                              prompt, model_id, current_version_id, created_at, updated_at)
public.component_versions    (id, component_id, version_number, payload jsonb, generated_from jsonb)
public.connections           (id, canvas_id, from_component_id, to_component_id,
                              from_side, to_side, mode, created_by_user_id)
                              UNIQUE(from_component_id, to_component_id)
                              CHECK(from != to)
public.attachments           (id, component_id, user_id, storage_path, mime_type, size_bytes)
```

CHECK constraints enforce the enums:
- `kind` ∈ `chat | text | image | gallery | table | code | chart | browser | 3d | ui`
- `status` ∈ `empty | thinking | streaming | done | error`
- `created_by_role` ∈ `user | auto`
- `from_side`, `to_side` ∈ `top | bottom | left | right`
- `mode` ∈ `visual | context | regenerate`

RLS gated by `canvases.owner_id = auth.uid()` on every table.

### v1 ↔ v2 mapping (what the dual-write does on each save)

| v1 entity | v2 destination |
|---|---|
| `Thread` | `threads` row, `accent_color` from `accentColour` |
| `Card` | `components` row `kind='chat'` + one `component_versions` row with `{ kind:'chat', question, answer }` |
| `CanvasArtifactNode` + `SessionArtifact` | `components` row with `kind` mapped (`images→gallery`, `custom→ui`, rest 1:1) + one `component_versions` row per `SessionArtifact.versions` entry |
| `Connection` (card→card) | `connections` row `mode='context'` |
| Source-card → its artifact (implicit in v1 via `sourceCardId`) | Synthetic `connections` row `from_side='right'`, `to_side='left'`, `mode='context'` |
| Manual R5/R6 connections (id prefixed `mconn_`) | `connections` row, deduped against synthetic edges (R6a fix) |

v2 component IDs are **fresh UUIDs each save** — the dual-write uses wipe-and-reinsert. This is fine while v2 is read-only mirror; **not safe** for `NEXT_PUBLIC_USE_V2_WRITES=1` because attachments cascade-delete.

### Migration files

```
supabase/migrations/
├── 20260524120000_create_profiles_canvases.sql      ← APPLIED (v1 base)
├── 20260529000000_v2_normalized_schema.sql          ← APPLIED (v2 tables)
└── 20260601000001_drop_v1_state_blob.sql            ← NOT APPLIED (final cut-over)
```

The `drop_v1_state_blob` migration has a 4-point gating checklist in its header. Don't apply until the user has:
1. Successfully verified parity via `__verifyV1V2Parity()`
2. Soaked `NEXT_PUBLIC_USE_V2_READS=1` in production
3. Implemented stable v2 IDs (legacy_id columns — **not done yet**)
4. Successfully soaked `NEXT_PUBLIC_USE_V2_WRITES=1`

---

## 6. The unified Component model (R2)

`lib/types/component.ts`:

```ts
export type ComponentKind =
  | "chat" | "text" | "image" | "gallery" | "table"
  | "code" | "chart" | "browser" | "3d" | "ui";

export interface Component<K extends ComponentKind = ComponentKind> {
  id: string;
  canvasId: string;
  threadId: string;
  kind: K;
  position: { x: number; y: number };
  size: { w: number; h: number };
  title?: string;
  status: ComponentStatus;
  createdByRole: ComponentCreatedByRole;
  createdByUserId?: string;
  updatedByUserId?: string;
  prompt?: string;
  modelId?: string;
  currentVersionId: string;
  payload: PayloadFor<K>;
  createdAt: number;
  updatedAt: number;
}

export type ComponentPayload =
  | { kind: "chat"; question: string; answer: string }
  | { kind: "text"; markdown: string }
  | { kind: "image"; url: string; promptUsed: string; ... }
  | { kind: "gallery"; images: GalleryImage[] }
  | { kind: "table"; columns: ColumnDef[]; rows: Row[] }
  | { kind: "code"; files: CodeFile[] }
  | { kind: "chart"; chartType: ...; data: ChartData }
  | { kind: "browser"; url: string; embedType: ...; title?: string }
  | { kind: "3d"; modelUrl: string; format: "glb"|"gltf"; previewImageUrl?: string }
  | { kind: "ui"; html: string; css?: string; js?: string };
```

`KindRegistry` (`lib/components/KindRegistry.ts`) holds per-kind specs:
- `defaultSize: { w, h }`
- `validate(unknown) → PayloadFor<K>` (throws on shape mismatch)
- `serializeForContext(payload) → PayloadContextChunk[]`
- `contextMimeTypes: string[]`
- Optional `Renderer`, optional `generate`

8 of 10 kinds are registered today (`chat, text, image, gallery, table, code, 3d, ui`). The remaining 2 (`chart, browser`) are in the type union for completeness but have no spec yet — v1 doesn't produce them.

---

## 7. Drag-to-connect flow (R5 + R6)

```
User drags from card.right plug
   │
   ▼ usePlugDragSession.onPointerMove
   │   - findComponentTargetAtPoint(clientX, clientY)
   │   - update useConnectDragHoverStore.hoverComponentId
   │   - Card/CanvasArtifactNode read store and render green ring
   │
   ▼ usePlugDragSession.onPointerUp (drop)
   │   if hit && handler && !isSelfLink:
   │      → call connectDropBus handler (registered by V2ConnectDropManager)
   │   else:
   │      → fall through to v1 createBranch / artifact-attach
   │
   ▼ V2ConnectDropManager (commitRef pattern — registered once on mount)
   │   - wouldCreateCycle check (R6b)
   │   - if remembered mode: skip modal, commit directly
   │   - else: setPending(...) → opens ConnectionModeModal
   │
   ▼ Modal confirm
   │   - useV2ConnectionsStore.add({ from, to, fromSide, toSide, mode }, id)
   │   - useCanvasStore.setState push to v1 connections (so dual-write picks it up)
   │   - if mode === "regenerate" && target.kind === "chat":
   │      POST /api/components/[id]/regenerate
   │      → builds context via KindRegistry.serializeForContext(source.payload)
   │      → calls Anthropic messages.create
   │      → updateCard target with new answer
```

Connections rendering:
- v1 `Connections.tsx` renders branch/follow-up edges (skips ones in v2 store via `useV2ConnectionsStore`)
- v2 `V2Connections.tsx` renders manual edges with mode-specific styling (REGEN badge / dashed for visual / solid default), uses live DOM bounds for accurate anchors

---

## 8. Feature flags (.env.local)

| Flag | Default | What it does | Safe to flip? |
|---|---|---|---|
| `NEXT_PUBLIC_USE_V2_READS` | OFF | `fetchDefaultCanvas` uses `loadCanvasFromV2` instead of JSONB blob. Falls back to v1 if v2 returns null | ✅ Safe after parity check passes |
| `NEXT_PUBLIC_USE_V2_WRITES` | OFF | `saveCanvasState` uses `saveCanvasV2` and skips JSONB | ❌ **DO NOT FLIP** — needs stable IDs (legacy_id columns) first |

Verify parity before flipping `USE_V2_READS`:
```js
await window.__verifyV1V2Parity()
// Returns: { ok: true|false, v1Counts, v2Counts, diff: [] }
```

---

## 9. Known open issues / explicitly deferred work

### Fix A — Follow-up placement policy (HIGH USER IMPACT)

**Symptom:** Tall parent cards (long answer + artifact) push their follow-ups 600+ px below. Connectors stretch across empty space. User describes layout as "disconnected."

**Root cause:** Policy is `follow-up.y = parent.y + parent.measuredHeight + 40`. R7c routed this through unified `computePlacement` and R7d removed the redundant ~80px pill, but the underlying policy is unchanged.

**Proposed fix:** Change follow-up policy to **"right of parent at parent.y"** instead of "below parent". Follow-ups stack into a column with AABB collision resolution. Breaks the documented vertical-chain rule in `docs/canvas-card-position-rules.md` but solves the visual disconnection.

**Files:** `lib/canvas/placement.ts` (preferredAnchor for `reason: "follow-up"`), `docs/canvas-card-position-rules.md` (update rules).

**Estimated effort:** ~45 minutes.

### Fix B — Regen for non-chat target kinds (FUNCTIONAL GAP)

**Symptom:** Drag chat → table with mode=regenerate. Modal closes. Connector appears with REGEN badge. But the **table content doesn't change**. Silent failure.

**Root cause:** `V2ConnectDropManager.fireRegen` only handles `target.kind === 'chat'`. For other kinds it shows a toast "Regenerate not supported for kind X yet" — easy to miss.

**Proposed fix:** Extend regen for table / gallery / code / 3d / ui by:
1. For each kind, define how the prompt + context produces a new payload (Claude with structured output for table/code/ui; URL extraction for 3d/browser)
2. Update the regen API route to dispatch by target kind
3. On response, update the v1 `SessionArtifact.versions` (append a new version) instead of writing to a Card

**Files:** `app/api/components/[id]/regenerate/route.ts`, `components/V2ConnectDropManager.tsx`, `lib/components/kinds/*` (add `generate?` functions to KindSpec).

**Estimated effort:** ~45-60 minutes.

### Step 3 (for full R8/R9 cut-over) — Stable v2 IDs

**Required before:** flipping `NEXT_PUBLIC_USE_V2_WRITES=1`.

**Why:** Current dual-write does wipe-and-reinsert with fresh UUIDs. `attachments.component_id` references `components.id` with `ON DELETE CASCADE`, so every save would orphan all attachments.

**Proposed fix:**
1. Schema migration: add `legacy_id text` columns to `threads`, `components`, `connections`, `component_versions`. Add UNIQUE indexes per canvas.
2. Modify `dualWrite.ts` to upsert by `legacy_id` instead of delete+insert.
3. Same for `saveCanvasV2`.

**Estimated effort:** ~1-2 hours.

### Open known bugs / friction

- **Drag-to-connect can hit wrong target** if cursor is over a busy area with overlapping components. Mitigated by the green-ring drop target highlight (R7+) but still possible. SVG layers (z-[10], z-[11]) shouldn't block pointer events but worth re-checking with `elementsFromPoint` (plural).
- **Orphan artifact nodes** in v1 JSONB blob (sourceCard deleted but node remained). Dual-write correctly skips them; v2 is more correct than v1 in this case. Cleanup procedure given to user via console.
- **Mode metadata lost on reload.** v2 store is session-only. Card-to-card manual connections that survived via dual-write render as plain solid lines after reload (no REGEN badge / dashed style). Fixed properly when reads cut over to v2 in step 2.

---

## 10. Quick reference — debugging recipes

### Verify parity between v1 and v2
```js
// In browser console after sign-in
await window.__verifyV1V2Parity()
```

### Inspect v1 store state
```js
window.__canvasStore.getState()
// or specific slices:
const s = window.__canvasStore.getState();
console.log("cards:", Object.keys(s.cards).length);
console.log("artifact nodes:", Object.keys(s.canvasArtifactNodes).length);
console.log("connections:", s.connections.length);
```

### Inspect v2 tables in Supabase SQL Editor
```sql
-- Counts by kind
select kind, count(*) from public.components
where canvas_id = '<canvas-uuid>' group by kind;

-- See all components
select id, kind, current_version_id, created_by_role
from public.components where canvas_id = '<canvas-uuid>';

-- See all connections
select from_component_id, to_component_id, mode, from_side, to_side
from public.connections where canvas_id = '<canvas-uuid>';
```

### Reset all v2 tables (for a specific canvas)
```sql
delete from public.components where canvas_id = '<canvas-uuid>';
delete from public.connections where canvas_id = '<canvas-uuid>';
delete from public.threads where canvas_id = '<canvas-uuid>';
-- Cascades wipe component_versions and attachments
```

### Reset the entire database (sandbox only)
```sql
delete from public.canvases;
```

### Restart dev cleanly
```bash
cd /Users/ravi/Downloads/flowstate
pkill -9 -f "next-server" 2>/dev/null
pkill -9 -f "next dev" 2>/dev/null
sleep 2
set -a; . ./.env.local; set +a
npm run dev
```

### Typecheck
```bash
npx tsc --noEmit
```

### Apply a SQL migration
1. Open Supabase dashboard → SQL Editor → New query
2. Paste contents of the `.sql` file
3. Run
4. After applying a v2 schema change: `notify pgrst, 'reload schema';` to force PostgREST to refresh

---

## 11. .env.local shape

```env
ANTHROPIC_API_KEY=sk-ant-api03-...
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Feature flags (defaults OFF)
# NEXT_PUBLIC_USE_V2_READS=1
# NEXT_PUBLIC_USE_V2_WRITES=1
```

The flags are commented out by default. Uncomment to flip.

If you ever see `[fetchDefaultCanvas] ANTHROPIC_API_KEY is not configured` or similar despite the key being present, rewrite `.env.local` atomically (see below) — invisible char issues can sneak in via `cat >>`:

```bash
ANTH=$(grep "^ANTHROPIC_API_KEY=" .env.local | cut -d= -f2-)
SBURL=$(grep "^NEXT_PUBLIC_SUPABASE_URL=" .env.local | cut -d= -f2-)
SBANON=$(grep "^NEXT_PUBLIC_SUPABASE_ANON_KEY=" .env.local | cut -d= -f2-)
SBSRV=$(grep "^SUPABASE_SERVICE_ROLE_KEY=" .env.local | cut -d= -f2-)
{
  printf 'ANTHROPIC_API_KEY=%s\n' "$ANTH"
  printf 'NEXT_PUBLIC_SUPABASE_URL=%s\n' "$SBURL"
  printf 'NEXT_PUBLIC_SUPABASE_ANON_KEY=%s\n' "$SBANON"
  printf 'SUPABASE_SERVICE_ROLE_KEY=%s\n' "$SBSRV"
} > .env.local.new && mv .env.local.new .env.local
```

---

## 12. Auth

Supabase Auth. App uses Google OAuth by default but also supports magic-link sign-in (`signInWithOtp`) — added during this session in `components/AuthProvider.tsx` and `components/AuthButton.tsx`. Magic link works on any Supabase project without OAuth setup.

`handle_new_user` trigger from the v1 migration creates a `profiles` row on `auth.users` insert. `useCanvasPersistence` creates a default canvas on first sign-in.

---

## 13. Where to start a fresh session

A fresh assistant should:

1. **Read this doc fully.**
2. **Read `docs/architecture.md`** (older but still useful for the conceptual model).
3. **Check git status** to see uncommitted work.
4. **Run typecheck** to confirm the codebase compiles: `npx tsc --noEmit` → should be 0 errors.
5. **Ask the user which open issue they want to tackle:**
   - Fix A (follow-up placement policy)
   - Fix B (regen for non-chat kinds)
   - Step 3 (stable v2 IDs → unlock `USE_V2_WRITES`)
   - Some new feature
6. **Default to NOT spinning up dev server / agents** unless the user asks.

If the user references "the plan" they mean the R-phase rollout summarized in §3.

If they say "R7 wasn't enough" they mean Fix A — the placement policy change.

---

## 14. Original architectural plan

The plan file at `~/.claude/plans/the-components-can-be-mossy-sun.md` has the long-form architectural reasoning. Section 11 ("Phased rollout") matches this doc's §3 status table. Sections 1–10 cover the design decisions in more detail.

If that plan file is gone, the key narrative is:
1. The user has two parallel data models (Card + Artifact) that should be one polymorphic Component.
2. They want manual drag-to-connect with context flow.
3. They picked hybrid normalized storage (some tables, some JSONB), custom SVG connectors with drag-to-connect, and multi-user-ready architecture without implementing it now.
4. The rollout sequences as: bug fixes (R0) → schema (R1) → types (R2) → services (R3) → projection + dispatch (R4) → modal + manual drag (R5) → persistence + regen (R6) → unified placement (R7) → read cut-over (R8) → write cut-over + drop blob (R9).

---

## 15. Sandbox vs production note

The user is working in a **sandbox Supabase project** (`tohqgdoamgdxmdwiezlh.supabase.co`). They created it specifically for this refactor so it could be wiped without affecting any production data. There is no production deployment.

When migrations or destructive SQL are mentioned in this doc, they apply to the sandbox only.
