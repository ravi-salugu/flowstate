/**
 * R4a — Unified Component projection.
 *
 * Pure function that derives a `Record<string, Component<K>>` view from the
 * existing v1 store slices (`cards`, `canvasArtifactNodes`, `sessionArtifacts`).
 * Nothing in this file mutates state; it's a read-side view.
 *
 * Mapping:
 *   v1 Card                                                 → Component<"chat">
 *     payload = { kind:"chat", question, answer }
 *
 *   v1 CanvasArtifactNode + matching SessionArtifact         → Component<K> where
 *                                                              K is mapped from
 *                                                              SessionArtifact.kind
 *     v1 ArtifactKind → v2 ComponentKind:
 *       "table"  → "table"      (payload from data.columns/data.rows)
 *       "code"   → "code"       (payload from data.files)
 *       "images" → "gallery"    (payload from data.items)
 *       "3d"     → "3d"         (payload from data.modelUrl/data.format)
 *       "custom" → "ui"         (payload from data.html/css/js)
 *
 * IDs are stable across re-projections (we use v1 card id / artifact node id).
 * `currentVersionId` is synthetic — the projection doesn't have v2 row IDs.
 * Once R5+ writes through the service layer, real IDs flow in and we project
 * over the v2 read path instead. R4 just gives the canvas a unified iteration.
 *
 * The projection IS NOT yet consumed by anything. R4b wires the renderer
 * dispatch; R4c wires Canvas.tsx. R4a is silent.
 */

import { useCanvasStore } from "@/lib/store";
import { kindRegistry } from "@/lib/components/KindRegistry";
// Side-effect import: registers built-in kinds before any validation runs.
import "@/lib/components/kinds";
import type {
  ChatPayload,
  CodePayload,
  Component,
  ComponentKind,
  ComponentPayload,
  GalleryImage,
  GalleryPayload,
  PayloadFor,
  TablePayload,
  ThreeDPayload,
  TextPayload,
  UIPayload,
} from "@/lib/types/component";
import type {
  CanvasArtifactNode,
  Card,
  CardImage,
} from "@/lib/store";
import type {
  ArtifactPayload,
  ArtifactKind,
  ResponseType,
} from "@/lib/artifactTypes";
import type { SessionArtifact } from "@/lib/sessionArtifacts";
import {
  CARD_WIDTH,
  CANVAS_ARTIFACT_WIDTH,
  CANVAS_TABLE_ARTIFACT_WIDTH,
  DEFAULT_ARTIFACT_HEIGHT,
  EMPTY_CARD_HEIGHT,
  FALLBACK_CARD_HEIGHT,
  TABLE_ARTIFACT_HEIGHT,
} from "@/lib/canvasNodeBounds";

// ---------------------------------------------------------------------------
// Helpers — kind & payload mapping
// ---------------------------------------------------------------------------

function mapArtifactKindToComponentKind(k: ArtifactKind): ComponentKind {
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
      return "text";
  }
}

function mapArtifactPayloadToComponentPayload(
  payload: ArtifactPayload,
): ComponentPayload {
  switch (payload.type) {
    case "table": {
      const v2: TablePayload = {
        kind: "table",
        columns: payload.data.columns,
        rows: payload.data.rows,
      };
      return v2;
    }
    case "code": {
      const v2: CodePayload = {
        kind: "code",
        files: payload.data.files,
      };
      return v2;
    }
    case "images": {
      const images: GalleryImage[] = payload.data.items.map((it) => {
        if (it.kind === "youtube") {
          return {
            url: it.url,
            caption: it.title,
            thumb: it.thumb,
          };
        }
        return {
          url: it.url,
          caption: it.alt,
          thumb: it.thumb,
        };
      });
      const v2: GalleryPayload = { kind: "gallery", images };
      return v2;
    }
    case "3d": {
      const v2: ThreeDPayload = {
        kind: "3d",
        modelUrl: payload.data.modelUrl,
        format: payload.data.format ?? "glb",
      };
      return v2;
    }
    case "custom": {
      const v2: UIPayload = {
        kind: "ui",
        html: payload.data.html,
        css: payload.data.css,
        js: payload.data.js,
      };
      return v2;
    }
    case "video": {
      // v1 "video" is converted to "images" before commit in normal flows, but
      // defensively handle it here as a gallery of items.
      const images: GalleryImage[] = payload.data.items.map((it) => ({
        url: it.url,
        caption: it.title,
        thumb: it.thumb,
      }));
      const v2: GalleryPayload = { kind: "gallery", images };
      return v2;
    }
  }
}

/**
 * For chat cards that have inline images on the card (not in a separate
 * artifact node), the v2 payload is still "chat" — images are flagged elsewhere.
 * If you wanted them as a separate gallery component you'd split here, but
 * that's a UX decision deferred to R5+.
 */
function chatPayloadFromCard(card: Card): ChatPayload {
  return {
    kind: "chat",
    question: card.question,
    answer: card.answer,
  };
}

// ---------------------------------------------------------------------------
// Size fallbacks — match v1's getCardBounds / getArtifactBounds defaults
// ---------------------------------------------------------------------------

function cardSize(card: Card): { w: number; h: number } {
  const w = card.size?.w ?? CARD_WIDTH;
  if (card.size?.h != null) return { w, h: card.size.h };
  const h = card.status === "empty" ? EMPTY_CARD_HEIGHT : FALLBACK_CARD_HEIGHT;
  return { w, h };
}

function artifactNodeSize(
  node: CanvasArtifactNode,
  artifact: SessionArtifact | undefined,
): { w: number; h: number } {
  const isTable = artifact?.kind === "table";
  const defaultW = isTable ? CANVAS_TABLE_ARTIFACT_WIDTH : CANVAS_ARTIFACT_WIDTH;
  const defaultH = isTable ? TABLE_ARTIFACT_HEIGHT : DEFAULT_ARTIFACT_HEIGHT;
  return {
    w: node.size?.w ?? defaultW,
    h: node.size?.h ?? defaultH,
  };
}

// ---------------------------------------------------------------------------
// Projection input + output
// ---------------------------------------------------------------------------

export interface ProjectionInput {
  canvasId: string;
  cards: Record<string, Card>;
  cardOrder: string[];
  canvasArtifactNodes: Record<string, CanvasArtifactNode>;
  canvasArtifactOrder: string[];
  sessionArtifacts: Record<string, SessionArtifact>;
}

export interface ProjectionOutput {
  components: Record<string, Component>;
  /** Same ordering rules the canvas uses today: cards in cardOrder, then artifacts in canvasArtifactOrder. */
  componentOrder: string[];
  /** Lets ComponentRenderer (R4b) look up the original card / node for back-compat shims. */
  legacy: {
    cards: Record<string, Card>;
    nodes: Record<string, { node: CanvasArtifactNode; artifact: SessionArtifact }>;
  };
}

// ---------------------------------------------------------------------------
// THE projection
// ---------------------------------------------------------------------------

/**
 * Build the unified Component view. Pure function — same inputs always
 * produce the same output (suitable for Zustand selector memoisation).
 */
export function projectComponents(input: ProjectionInput): ProjectionOutput {
  const components: Record<string, Component> = {};
  const componentOrder: string[] = [];
  const legacyCards: Record<string, Card> = {};
  const legacyNodes: Record<
    string,
    { node: CanvasArtifactNode; artifact: SessionArtifact }
  > = {};

  const now = Date.now();

  // 1. Cards → Component<"chat">
  for (const cardId of input.cardOrder) {
    const card = input.cards[cardId];
    if (!card) continue;

    const size = cardSize(card);
    const payload = chatPayloadFromCard(card);
    const c: Component<"chat"> = {
      id: cardId,
      canvasId: input.canvasId,
      threadId: card.threadId,
      kind: "chat",
      position: { x: card.position.x, y: card.position.y },
      size,
      title: undefined,
      status: card.status === "thinking" ? "thinking"
            : card.status === "streaming" ? "streaming"
            : card.status === "empty" ? "empty"
            : "done",
      createdByRole: "user",
      prompt: card.question || undefined,
      currentVersionId: `${cardId}__v1`,
      payload,
      createdAt: now,
      updatedAt: now,
    };
    components[cardId] = c as Component;
    componentOrder.push(cardId);
    legacyCards[cardId] = card;
  }

  // 2. CanvasArtifactNodes + their SessionArtifact → Component<artifact-kind>
  for (const nodeId of input.canvasArtifactOrder) {
    const node = input.canvasArtifactNodes[nodeId];
    if (!node) continue;
    const artifact = input.sessionArtifacts[node.artifactId];
    if (!artifact) continue;

    // Pick the version pointed at by the node (or fallback to latest)
    const version =
      artifact.versions.find((v) => v.id === node.versionId) ??
      artifact.versions[artifact.versions.length - 1];
    if (!version) continue;

    const kind = mapArtifactKindToComponentKind(artifact.kind);
    const size = artifactNodeSize(node, artifact);
    const payload = mapArtifactPayloadToComponentPayload(version.payload);

    // Validate through the registry. If validation fails (malformed v1 data),
    // skip the component rather than crash the canvas.
    if (!kindRegistry.has(kind)) continue;
    let validatedPayload: PayloadFor<typeof kind>;
    try {
      validatedPayload = kindRegistry.get(kind).validate(payload) as PayloadFor<
        typeof kind
      >;
    } catch {
      continue;
    }

    const c: Component = {
      id: nodeId,
      canvasId: input.canvasId,
      threadId: input.cards[node.sourceCardId]?.threadId ?? "",
      kind,
      position: { x: node.position.x, y: node.position.y },
      size,
      title: artifact.title,
      status: "done",
      createdByRole: "auto",
      currentVersionId: `${nodeId}__${version.id}`,
      payload: validatedPayload as ComponentPayload,
      createdAt: version.createdAt,
      updatedAt: version.createdAt,
    };
    components[nodeId] = c;
    componentOrder.push(nodeId);
    legacyNodes[nodeId] = { node, artifact };
  }

  return {
    components,
    componentOrder,
    legacy: { cards: legacyCards, nodes: legacyNodes },
  };
}

// ---------------------------------------------------------------------------
// React/Zustand selector — read-only convenience
// ---------------------------------------------------------------------------

/**
 * Zustand-friendly selector hook returning the unified Component view.
 *
 * Note: re-runs whenever any of (cards, cardOrder, canvasArtifactNodes,
 * canvasArtifactOrder, sessionArtifacts) change. Zustand handles equality
 * checks shallowly; downstream consumers should memoise as needed.
 *
 * In R4a no UI uses this. R4c wires it into Canvas.tsx.
 */
export function useUnifiedComponents(canvasId = "current"): ProjectionOutput {
  const cards = useCanvasStore((s) => s.cards);
  const cardOrder = useCanvasStore((s) => s.cardOrder);
  const canvasArtifactNodes = useCanvasStore((s) => s.canvasArtifactNodes);
  const canvasArtifactOrder = useCanvasStore((s) => s.canvasArtifactOrder);
  const sessionArtifacts = useCanvasStore((s) => s.sessionArtifacts);

  return projectComponents({
    canvasId,
    cards,
    cardOrder,
    canvasArtifactNodes,
    canvasArtifactOrder,
    sessionArtifacts,
  });
}

// Surface a couple of util re-exports so R4b doesn't need to re-derive them.
export { mapArtifactKindToComponentKind, mapArtifactPayloadToComponentPayload };
