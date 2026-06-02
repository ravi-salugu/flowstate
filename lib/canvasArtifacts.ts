import { getLatestVersion, getVersionById } from "@/lib/sessionArtifacts";
import {
  CARD_WIDTH,
  DEFAULT_ARTIFACT_HEIGHT,
  getArtifactBounds,
} from "@/lib/canvasNodeBounds";
import {
  CANVAS_ARTIFACT_WIDTH,
  useCanvasStore,
  type CanvasArtifactNode,
  type Card,
} from "@/lib/store";
import { viewportCenteredOnWorldPoint } from "@/lib/viewport";
import {
  buildOccupants,
  cardAsOccupant,
  computePlacement,
} from "@/lib/canvas/placement";

export function findCanvasNodeByArtifactId(
  nodes: Record<string, CanvasArtifactNode>,
  artifactId: string,
): CanvasArtifactNode | undefined {
  return Object.values(nodes).find((n) => n.artifactId === artifactId);
}

/**
 * R7b — Thin wrapper around the unified `computePlacement`.
 *
 * Keeps the legacy signature so existing callers (`store.ts:spawnCanvasArtifact`,
 * etc.) don't have to change. Internally routes to the unified placement
 * service so artifact placement participates in the same AABB grid as
 * follow-ups and branches.
 */
export function computeDefaultSpawnPosition(
  sourceCardId: string,
  nodes: Record<string, CanvasArtifactNode>,
  cards: Record<string, Card>,
  bounds: { w: number; h: number } = {
    w: CANVAS_ARTIFACT_WIDTH,
    h: DEFAULT_ARTIFACT_HEIGHT,
  },
): { x: number; y: number } {
  const card = cards[sourceCardId];
  const source = card
    ? {
        id: card.id,
        position: card.position,
        size: cardAsOccupant(card).size,
      }
    : null;
  const occupants = buildOccupants(cards, nodes);
  const { position } = computePlacement({
    reason: "auto",
    bounds,
    source,
    occupants,
  });
  return position;
}

/** Pan viewport to a canvas artifact node and select it. */
export function focusCanvasArtifact(artifactId: string): boolean {
  const state = useCanvasStore.getState();
  let node = findCanvasNodeByArtifactId(
    state.canvasArtifactNodes,
    artifactId,
  );

  if (!node) {
    const art = state.sessionArtifacts[artifactId];
    if (!art) return false;
    const ver = getVersionById(art, art.latestVersionId) ?? getLatestVersion(art);
    const nodeId = state.spawnCanvasArtifact(artifactId, ver.id);
    if (!nodeId) return false;
    node = useCanvasStore.getState().canvasArtifactNodes[nodeId];
    if (!node) return false;
  }

  state.selectCanvasArtifact(node.id);

  const container = document.querySelector("[data-canvas-container]");
  const rect = container?.getBoundingClientRect();
  if (!rect) return true;

  const art = state.sessionArtifacts[node.artifactId];
  const { w, h } = getArtifactBounds(node, art);
  const cx = node.position.x + w / 2;
  const cy = node.position.y + h / 2;
  const vp = viewportCenteredOnWorldPoint(
    cx,
    cy,
    rect.width,
    rect.height,
    state.viewport.scale,
  );
  state.setViewport(vp);
  return true;
}
