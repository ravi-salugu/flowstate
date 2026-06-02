/**
 * Dual-write a v1 canvas snapshot into the v2 normalized tables.
 *
 * Wipes the canvas's v2 rows and re-decomposes the snapshot from scratch on
 * every save. Idempotent. Fresh UUIDs each run — stability across saves
 * isn't required because nothing reads from v2 yet (R3–R7 phase).
 *
 * Decomposition rules:
 *   v1 Thread                 → threads row (accent_color from accentColour)
 *   v1 Card                   → components row (kind='chat', status normalized)
 *                              + initial component_versions v1 with {question, answer}
 *   v1 CanvasArtifactNode     → components row (kind mapped from SessionArtifact.kind)
 *                              + component_versions per SessionArtifact version
 *   v1 Connection (card→card) → connections row (mode='context')
 *   v1 source-card → artifact → synthetic connections row (mode='context')
 *
 * Kind mapping (v1 ArtifactKind → v2 ComponentKindDb):
 *   'table'   → 'table'
 *   'code'    → 'code'
 *   'images'  → 'gallery'      ← v1's multi-image kind
 *   '3d'      → '3d'
 *   'custom'  → 'ui'
 *
 * Failures are logged via console.warn and swallowed — the primary v1 save
 * is never blocked.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type {
  ComponentKindDb,
  ComponentStatusDb,
  ConnectorSideDb,
} from "@/lib/supabase/database.types";
import type { CanvasSnapshot } from "@/lib/canvasSnapshot";
import type { ArtifactKind } from "@/lib/artifactTypes";
import type { CardStatus } from "@/lib/store";

type Supabase = SupabaseClient<Database>;

function mapArtifactKindToComponentKind(k: ArtifactKind): ComponentKindDb {
  switch (k) {
    case "table":
      return "table";
    case "code":
      return "code";
    case "images":
      return "gallery";
    case "3d":
      return "3d";
    case "custom":
      return "ui";
    default:
      // Defensive — surface unknown kinds as 'text' rather than crashing
      return "text";
  }
}

function mapCardStatusToComponentStatus(s: CardStatus): ComponentStatusDb {
  switch (s) {
    case "empty":
      return "empty";
    case "thinking":
      return "thinking";
    case "streaming":
      return "streaming";
    case "done":
      return "done";
    default:
      return "done";
  }
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

interface DualWriteOptions {
  /** Suppress the console.warn on failure. Useful for tests. */
  silent?: boolean;
}

/**
 * Decompose `snapshot` into v2 rows for `canvasId`.
 * Idempotent: wipes the canvas's v2 rows first.
 * Always resolves; logs on error.
 */
export async function dualWriteCanvasSnapshot(
  supabase: Supabase,
  canvasId: string,
  snapshot: CanvasSnapshot,
  opts: DualWriteOptions = {},
): Promise<void> {
  // R3 diagnostic — remove once dual-write is verified working in production.
  // eslint-disable-next-line no-console
  console.log(
    `[dualWriteCanvasSnapshot] starting for canvas ${canvasId} —`,
    `${Object.keys(snapshot.threads).length} threads,`,
    `${Object.keys(snapshot.cards).length} cards,`,
    `${Object.keys(snapshot.canvasArtifactNodes ?? {}).length} artifact nodes,`,
    `${snapshot.connections.length} connections`,
  );
  try {
    await writeImpl(supabase, canvasId, snapshot);
    // eslint-disable-next-line no-console
    console.log("[dualWriteCanvasSnapshot] succeeded");
  } catch (err) {
    if (!opts.silent) {
      // Intentional: dual-write failures must never break the primary save.
      // eslint-disable-next-line no-console
      console.warn("[dualWriteCanvasSnapshot] failed:", err);
    }
  }
}

async function writeImpl(
  supabase: Supabase,
  canvasId: string,
  snapshot: CanvasSnapshot,
): Promise<void> {
  // 1. Wipe canvas's v2 rows. ON DELETE CASCADE in the schema handles
  //    component_versions, attachments. connections and threads are wiped
  //    explicitly because cascading from components delete drops connections
  //    but threads have no cascade origin.
  await supabase.from("components").delete().eq("canvas_id", canvasId);
  await supabase.from("connections").delete().eq("canvas_id", canvasId);
  await supabase.from("threads").delete().eq("canvas_id", canvasId);

  // 2. Threads — fresh UUIDs, remember v1 → v2 mapping
  const threadIdMap = new Map<string, string>();
  const threadRows: Database["public"]["Tables"]["threads"]["Insert"][] = [];
  for (const [v1Id, thread] of Object.entries(snapshot.threads)) {
    const v2Id = uuid();
    threadIdMap.set(v1Id, v2Id);
    threadRows.push({
      id: v2Id,
      canvas_id: canvasId,
      title: null,
      accent_color: thread.accentColour ?? null,
    });
  }
  if (threadRows.length > 0) {
    const { error } = await supabase.from("threads").insert(threadRows);
    if (error) throw error;
  }

  // 3. Components — one per Card (kind='chat') + one per CanvasArtifactNode
  //    Insert components without current_version_id first, then versions,
  //    then backfill current_version_id pointers (deferred FK allows this).
  const componentIdMap = new Map<string, string>(); // v1 card-or-node id → v2 component id
  const componentInserts: Database["public"]["Tables"]["components"]["Insert"][] =
    [];
  const versionInserts: Database["public"]["Tables"]["component_versions"]["Insert"][] =
    [];
  const componentToFirstVersionId = new Map<string, string>();

  // 3a. Cards → chat components
  for (const card of Object.values(snapshot.cards)) {
    const v2Id = uuid();
    const versionId = uuid();
    componentIdMap.set(card.id, v2Id);
    componentToFirstVersionId.set(v2Id, versionId);

    const threadV2 = threadIdMap.get(card.threadId);
    if (!threadV2) continue;

    componentInserts.push({
      id: v2Id,
      canvas_id: canvasId,
      thread_id: threadV2,
      kind: "chat",
      pos_x: card.position.x,
      pos_y: card.position.y,
      size_w: card.size?.w ?? null,
      size_h: card.size?.h ?? null,
      title: null,
      status: mapCardStatusToComponentStatus(card.status),
      created_by_role: "user",
      prompt: card.question || null,
      model_id: null,
      current_version_id: null,
    });

    versionInserts.push({
      id: versionId,
      component_id: v2Id,
      version_number: 1,
      payload: {
        kind: "chat",
        question: card.question,
        answer: card.answer,
      } as Json,
      generated_from: null,
    });
  }

  // 3b. Artifact nodes → kind-mapped components, with versions from SessionArtifact
  const artifactNodes = snapshot.canvasArtifactNodes ?? {};
  for (const node of Object.values(artifactNodes)) {
    const art = snapshot.sessionArtifacts[node.artifactId];
    if (!art || art.versions.length === 0) continue;

    const sourceCard = snapshot.cards[node.sourceCardId];
    const threadV2 = sourceCard
      ? threadIdMap.get(sourceCard.threadId)
      : undefined;
    if (!threadV2) continue;

    const v2Id = uuid();
    componentIdMap.set(node.id, v2Id);

    componentInserts.push({
      id: v2Id,
      canvas_id: canvasId,
      thread_id: threadV2,
      kind: mapArtifactKindToComponentKind(art.kind),
      pos_x: node.position.x,
      pos_y: node.position.y,
      size_w: node.size?.w ?? null,
      size_h: node.size?.h ?? null,
      title: art.title ?? null,
      status: "done",
      created_by_role: "auto",
      prompt: null,
      model_id: null,
      current_version_id: null,
    });

    // One component_version per SessionArtifact version, in order
    let latestVersionId: string | null = null;
    for (let i = 0; i < art.versions.length; i++) {
      const v = art.versions[i];
      const versionId = uuid();
      if (v.id === art.latestVersionId) latestVersionId = versionId;
      versionInserts.push({
        id: versionId,
        component_id: v2Id,
        version_number: i + 1,
        payload: v.payload as unknown as Json,
        generated_from: {
          ancestorIds: sourceCard ? [componentIdMap.get(sourceCard.id)] : [],
        } as Json,
      });
    }
    // Fallback: if latestVersionId didn't match any version (shouldn't happen),
    // use the last one inserted.
    if (!latestVersionId && versionInserts.length > 0) {
      latestVersionId = versionInserts[versionInserts.length - 1].id ?? null;
    }
    if (latestVersionId) {
      componentToFirstVersionId.set(v2Id, latestVersionId);
    }
  }

  // 4. Insert components (without current_version_id), then versions, then patch
  if (componentInserts.length > 0) {
    const { error } = await supabase
      .from("components")
      .insert(componentInserts);
    if (error) throw error;
  }
  if (versionInserts.length > 0) {
    const { error } = await supabase
      .from("component_versions")
      .insert(versionInserts);
    if (error) throw error;
  }
  // Backfill current_version_id
  for (const [componentId, versionId] of componentToFirstVersionId.entries()) {
    await supabase
      .from("components")
      .update({ current_version_id: versionId })
      .eq("id", componentId);
  }

  // 5. Connections — v1 card→card explicit + synthetic source-card→artifact.
  //
  // De-dup by `from:to` because the manual connections from R5/R6 can collide
  // with the synthetic source→artifact edges (e.g. user manually connects a
  // card to an artifact that was originally spawned from that same card —
  // both produce the same `(from, to)` pair, which violates the
  // `UNIQUE(from_component_id, to_component_id)` constraint on
  // `public.connections`). The v1 explicit connections take precedence
  // because they carry the user-intended fromSide/toSide; the synthetic
  // edges only fill in coverage when no explicit one exists.
  const connectionInserts: Database["public"]["Tables"]["connections"]["Insert"][] =
    [];
  const seenEdges = new Set<string>();
  const pushEdge = (
    insert: Database["public"]["Tables"]["connections"]["Insert"],
  ): void => {
    const key = `${insert.from_component_id}${insert.to_component_id}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    connectionInserts.push(insert);
  };

  for (const conn of snapshot.connections) {
    const fromV2 = componentIdMap.get(conn.from);
    const toV2 = componentIdMap.get(conn.to);
    if (!fromV2 || !toV2) continue;
    pushEdge({
      canvas_id: canvasId,
      from_component_id: fromV2,
      to_component_id: toV2,
      from_side: (conn.fromSide ?? "bottom") as ConnectorSideDb,
      to_side: (conn.toSide ?? "top") as ConnectorSideDb,
      mode: "context",
    });
  }
  for (const node of Object.values(artifactNodes)) {
    const fromV2 = componentIdMap.get(node.sourceCardId);
    const toV2 = componentIdMap.get(node.id);
    if (!fromV2 || !toV2) continue;
    pushEdge({
      canvas_id: canvasId,
      from_component_id: fromV2,
      to_component_id: toV2,
      from_side: "right",
      to_side: "left",
      mode: "context",
    });
  }
  if (connectionInserts.length > 0) {
    const { error } = await supabase
      .from("connections")
      .insert(connectionInserts);
    if (error) throw error;
  }
}
