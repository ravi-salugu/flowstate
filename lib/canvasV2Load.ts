/**
 * R8a — Read path that reconstructs a `CanvasSnapshot` from the v2
 * normalized tables. The inverse of `dualWriteCanvasSnapshot`.
 *
 * Reads:
 *   threads, components, component_versions, connections
 *
 * Reconstructs a v1-shaped `CanvasSnapshot` in memory:
 *   - chat-kind components → `Card` entries
 *   - artifact-kind components (+ versions) → `SessionArtifact` + `CanvasArtifactNode`
 *   - connections → `Connection[]` (card→card kept, synthetic card→artifact
 *     skipped since v1 expresses that implicitly via `sourceCardId`)
 *
 * v2 uses UUIDs; v1 uses prefixed strings (`card_…`, `cano_…`). We generate
 * fresh v1-style ids per load and build a v2-UUID → v1-id map for use when
 * resolving connection endpoints. The v1 ids are not stable across loads
 * (R9's stable-id work would require a `legacy_id` column on v2 tables —
 * deferred).
 *
 * Ancillary canvas state (viewport / groups / text labels / connector style /
 * selected model / view mode) doesn't yet have a v2 home. Defaults are
 * provided. When the cut-over is finalised those will need their own columns
 * or tables; for R8 scaffolding, defaults are acceptable.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type {
  CanvasArtifactNode,
  Card,
  CardSide,
  CardSize,
  Connection,
  Thread,
} from "@/lib/store";
import type { CanvasSnapshot } from "@/lib/canvasSnapshot";
import { CANVAS_SNAPSHOT_VERSION } from "@/lib/canvasSnapshot";
import type {
  ArtifactKind,
  ArtifactPayload,
} from "@/lib/artifactTypes";
import type { SessionArtifact } from "@/lib/sessionArtifacts";
import type { ComponentKindDb } from "@/lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;

function shortId(uuid: string): string {
  return uuid.replace(/-/g, "").slice(0, 10);
}

function v1Thread(uuid: string): string {
  return `thread_${shortId(uuid)}`;
}
function v1Card(uuid: string): string {
  return `card_${shortId(uuid)}`;
}
function v1Cano(uuid: string): string {
  return `cano_${shortId(uuid)}`;
}
function v1Art(uuid: string): string {
  return `art_${shortId(uuid)}`;
}
function v1Aver(uuid: string): string {
  return `aver_${shortId(uuid)}`;
}

function mapComponentKindToArtifactKind(k: ComponentKindDb): ArtifactKind | null {
  switch (k) {
    case "table":
      return "table";
    case "code":
      return "code";
    case "gallery":
      return "images";
    case "3d":
      return "3d";
    case "ui":
      return "custom";
    default:
      return null;
  }
}

/**
 * Public entry. Returns null if the canvas isn't found. Throws on Supabase
 * errors so callers can decide whether to fall back to the v1 read path.
 */
export async function loadCanvasFromV2(
  supabase: Supabase,
  canvasId: string,
): Promise<{ id: string; state: CanvasSnapshot } | null> {
  // Confirm the canvas exists; we still respect canvases.owner_id via RLS.
  const { data: canvasRow, error: canvasErr } = await supabase
    .from("canvases")
    .select("id")
    .eq("id", canvasId)
    .maybeSingle();
  if (canvasErr) throw canvasErr;
  if (!canvasRow) return null;

  // Parallel reads of the four content tables.
  const [threadsRes, componentsRes, versionsRes, connectionsRes] =
    await Promise.all([
      supabase.from("threads").select("*").eq("canvas_id", canvasId),
      supabase.from("components").select("*").eq("canvas_id", canvasId),
      supabase
        .from("component_versions")
        .select("*")
        .order("version_number", { ascending: true }),
      supabase.from("connections").select("*").eq("canvas_id", canvasId),
    ]);
  if (threadsRes.error) throw threadsRes.error;
  if (componentsRes.error) throw componentsRes.error;
  if (versionsRes.error) throw versionsRes.error;
  if (connectionsRes.error) throw connectionsRes.error;

  const v2Threads = threadsRes.data;
  const v2Components = componentsRes.data;
  const v2Versions = versionsRes.data;
  const v2Connections = connectionsRes.data;

  // Build v2-UUID → fresh v1-style id maps.
  const threadIdMap = new Map<string, string>();
  for (const t of v2Threads) threadIdMap.set(t.id, v1Thread(t.id));

  // Two separate maps: one for chat components (→ card_…) and one for artifact
  // components (→ cano_…). Same source UUID, different v1-style prefix.
  const cardIdMap = new Map<string, string>();
  const nodeIdMap = new Map<string, string>();
  for (const c of v2Components) {
    if (c.kind === "chat") cardIdMap.set(c.id, v1Card(c.id));
    else nodeIdMap.set(c.id, v1Cano(c.id));
  }

  // Versions, grouped by component_id and sorted by version_number.
  const versionsByComponent = new Map<
    string,
    Database["public"]["Tables"]["component_versions"]["Row"][]
  >();
  for (const v of v2Versions) {
    const list = versionsByComponent.get(v.component_id) ?? [];
    list.push(v);
    versionsByComponent.set(v.component_id, list);
  }
  for (const list of versionsByComponent.values()) {
    list.sort((a, b) => a.version_number - b.version_number);
  }

  // Connections, indexed by to_component_id (so we can find parents).
  const incomingByTo = new Map<
    string,
    Database["public"]["Tables"]["connections"]["Row"][]
  >();
  for (const conn of v2Connections) {
    const list = incomingByTo.get(conn.to_component_id) ?? [];
    list.push(conn);
    incomingByTo.set(conn.to_component_id, list);
  }

  // -- Build threads --------------------------------------------------------
  const threads: Record<string, Thread> = {};
  const threadOrder: string[] = [];
  for (const t of v2Threads) {
    const id = threadIdMap.get(t.id)!;
    threads[id] = {
      id,
      accentColour: t.accent_color ?? "#888888",
    };
    threadOrder.push(id);
  }

  // -- Build cards ----------------------------------------------------------
  const cards: Record<string, Card> = {};
  const cardOrder: string[] = [];
  for (const c of v2Components) {
    if (c.kind !== "chat") continue;
    const id = cardIdMap.get(c.id)!;
    const threadId = threadIdMap.get(c.thread_id) ?? threadOrder[0] ?? "";
    const versions = versionsByComponent.get(c.id) ?? [];
    const current =
      versions.find((v) => v.id === c.current_version_id) ??
      versions[versions.length - 1];
    let question = c.prompt ?? "";
    let answer = "";
    if (current) {
      const payload = current.payload as
        | { kind: "chat"; question: string; answer: string }
        | Json;
      if (
        payload &&
        typeof payload === "object" &&
        "kind" in payload &&
        payload.kind === "chat"
      ) {
        question = (payload as { question: string }).question ?? question;
        answer = (payload as { answer: string }).answer ?? "";
      }
    }
    // Parent inference: an incoming connection from another chat with
    // from_side='bottom', to_side='top' is a follow-up; from lateral sides
    // is a branch. Either way, parentCardId is the from card.
    const incoming = incomingByTo.get(c.id) ?? [];
    const parentEdge = incoming.find((e) => cardIdMap.has(e.from_component_id));
    const parentCardId = parentEdge
      ? cardIdMap.get(parentEdge.from_component_id) ?? null
      : null;
    const parentConversationId =
      parentEdge?.from_side === "bottom" && parentEdge?.to_side === "top"
        ? parentCardId
        : null;

    const size: CardSize | undefined =
      c.size_w != null && c.size_h != null
        ? { w: c.size_w, h: c.size_h }
        : undefined;

    cards[id] = {
      id,
      threadId,
      question,
      answer,
      status: "done",
      position: { x: c.pos_x, y: c.pos_y },
      parentCardId,
      parentConversationId,
      size,
    };
    cardOrder.push(id);
  }

  // -- Build SessionArtifacts + CanvasArtifactNodes -------------------------
  const sessionArtifacts: Record<string, SessionArtifact> = {};
  const canvasArtifactNodes: Record<string, CanvasArtifactNode> = {};
  const canvasArtifactOrder: string[] = [];

  for (const c of v2Components) {
    if (c.kind === "chat") continue;
    const artifactKind = mapComponentKindToArtifactKind(c.kind);
    if (!artifactKind) continue; // text / image / chart / browser not yet in v1

    const nodeId = nodeIdMap.get(c.id)!;
    const artifactId = v1Art(c.id);
    const versions = versionsByComponent.get(c.id) ?? [];
    if (versions.length === 0) continue;

    // Find source card from incoming connections.
    const incoming = incomingByTo.get(c.id) ?? [];
    const fromCardEdge = incoming.find((e) => cardIdMap.has(e.from_component_id));
    const sourceCardId = fromCardEdge
      ? cardIdMap.get(fromCardEdge.from_component_id) ?? ""
      : "";

    // Build SessionArtifact.versions from component_versions rows.
    const artVersions = versions
      .map((v) => {
        const payload = v.payload as ArtifactPayload | Json;
        return {
          id: v1Aver(v.id),
          number: v.version_number,
          payload: payload as ArtifactPayload,
          createdAt: Date.parse(v.created_at),
          sourceCardId,
        };
      })
      .filter((v) => v.payload && typeof v.payload === "object");
    if (artVersions.length === 0) continue;

    const latest = artVersions[artVersions.length - 1];
    sessionArtifacts[artifactId] = {
      id: artifactId,
      title: c.title ?? "",
      kind: artifactKind,
      versions: artVersions,
      latestVersionId: latest.id,
    };

    const nodeSize: CardSize | undefined =
      c.size_w != null && c.size_h != null
        ? { w: c.size_w, h: c.size_h }
        : undefined;
    canvasArtifactNodes[nodeId] = {
      id: nodeId,
      artifactId,
      versionId: latest.id,
      sourceCardId,
      position: { x: c.pos_x, y: c.pos_y },
      size: nodeSize,
    };
    canvasArtifactOrder.push(nodeId);
  }

  // -- Build connections list -----------------------------------------------
  // Keep card→card (follow-up + branch). Drop card→artifact (it's implicit
  // via CanvasArtifactNode.sourceCardId). Keep manual cross-kind links so
  // R5/R6 user connections survive the load.
  const connections: Connection[] = [];
  for (const e of v2Connections) {
    const fromCard = cardIdMap.get(e.from_component_id);
    const fromNode = nodeIdMap.get(e.from_component_id);
    const toCard = cardIdMap.get(e.to_component_id);
    const toNode = nodeIdMap.get(e.to_component_id);

    const from = fromCard ?? fromNode;
    const to = toCard ?? toNode;
    if (!from || !to) continue;

    // Skip the dual-write's synthetic card→artifact edges (from_side='right',
    // to_side='left' between a chat and its own artifact). These are not
    // edges in v1's mental model — v1 expresses them via sourceCardId.
    const isSynthetic =
      fromCard &&
      toNode &&
      e.from_side === "right" &&
      e.to_side === "left" &&
      // Confirm the artifact's sourceCard matches this from-card
      canvasArtifactNodes[toNode]?.sourceCardId === fromCard;
    if (isSynthetic) continue;

    connections.push({
      id: `conn_${shortId(e.id)}`,
      from,
      to,
      fromSide: (e.from_side ?? "bottom") as CardSide,
      toSide: (e.to_side ?? "top") as CardSide,
    });
  }

  const snapshot: CanvasSnapshot = {
    version: CANVAS_SNAPSHOT_VERSION,
    viewport: { x: 0, y: 0, scale: 1 },
    cards,
    cardOrder,
    connections,
    threads,
    threadOrder,
    groups: {},
    connectorStyle: "curvy",
    selectedModel: "claude-sonnet-4-6",
    viewMode: "canvas",
    sessionArtifacts,
    canvasArtifactNodes,
    canvasArtifactOrder,
    canvasTextLabels: {},
    canvasTextLabelOrder: [],
  };

  return { id: canvasId, state: snapshot };
}
