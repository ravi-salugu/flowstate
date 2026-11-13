import {
  getArtifactBounds,
  getBaseArtifactBounds,
  getCardBounds,
} from "@/lib/canvasNodeBounds";
import type { SessionArtifact } from "@/lib/sessionArtifacts";
import type { BranchGroup, CanvasArtifactNode, Card } from "@/lib/store";
import {
  DIVIDER_GAP_Y,
  TILE_GAP,
  packJustifiedRows,
  type RowTile,
} from "@/lib/transcriptImport/chapterLayout";

/*
 * Group bento — the chapter grid, kept true at runtime.
 *
 * A transcript chapter is built once by layoutChapters, but its tiles change
 * size afterwards: the style pack swaps (Frost cards hug their content, so
 * they are not the size vanilla drew them), conversation cards above grow,
 * and the user drags a tile's corner. Any of these used to leave the grid
 * overlapping or gapped. This re-packs a group's artifacts with the same
 * packer the build used, every time a member's size changes:
 *
 * - Each tile packs from its natural size (`bentoNatural`, zoom 1), so
 *   re-packing never compounds a zoom, and an unchanged group packs to
 *   exactly where it already is.
 * - A tile the user resized keeps that size (`lockZoom`); the rest of the
 *   row fits around it.
 * - Under Frost the columns are the vanilla ones, but content is never
 *   scaled: each card is drawn at its column's width, its height is what its
 *   content needs at that width (`frostMeasure`), and every card in a row is
 *   floored to the row's tallest (`frostRowH`) so rows end on one line.
 *
 * Only groups with a divider (code-built chapters: conversation above,
 * artifacts below) are bento groups; a group made from a selection keeps the
 * arrangement its user gave it.
 */

export type BentoFamily = "frost" | null;

export interface BentoPlanInput {
  group: BranchGroup;
  cards: Record<string, Card>;
  nodes: Record<string, CanvasArtifactNode>;
  sessionArtifacts: Record<string, SessionArtifact>;
  family: BentoFamily;
  /** Frost's per-kind least width (FROST_MIN_WIDTH). */
  frostMinWidth?: (kind: string) => number;
}

export interface BentoPlan {
  patches: Record<string, Partial<CanvasArtifactNode>>;
  dividerY: number | undefined;
}

export function isBentoGroup(group: BranchGroup): boolean {
  return group.dividerY !== undefined && (group.cardIds?.length ?? 0) > 0;
}

/** The size a tile packs from: zoom 1, before any row scaled it. */
function naturalOf(
  node: CanvasArtifactNode,
  artifact: SessionArtifact | undefined,
): { w: number; h: number } {
  if (node.userSetSize && node.size) return node.size;
  if (node.bentoNatural) return node.bentoNatural;
  if (node.layoutSetSize && node.size) {
    const z = node.contentZoom && node.contentZoom > 0 ? node.contentZoom : 1;
    return { w: node.size.w / z, h: node.size.h / z };
  }
  return getBaseArtifactBounds(node, artifact);
}

const near = (a: number | undefined, b: number | undefined, eps = 0.5) =>
  a !== undefined && b !== undefined && Math.abs(a - b) <= eps;

/**
 * Where every artifact in a bento group belongs right now. Returns only what
 * differs from the store (empty patches when the grid already holds), or null
 * for a group that is not a bento group.
 */
export function planBentoGroup(input: BentoPlanInput): BentoPlan | null {
  const { group, cards, nodes, sessionArtifacts, family } = input;
  if (!isBentoGroup(group)) return null;

  let left = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const id of group.cardIds ?? []) {
    const card = cards[id];
    if (!card) continue;
    const { w, h } = getCardBounds(card);
    left = Math.min(left, card.position.x);
    right = Math.max(right, card.position.x + w);
    bottom = Math.max(bottom, card.position.y + h);
  }
  if (!Number.isFinite(left)) return null;

  const memberIds = (group.items ?? [])
    .filter((item) => item.kind === "artifact" && nodes[item.id])
    .map((item) => item.id);
  const dividerY = Math.round(bottom + DIVIDER_GAP_Y);
  const top = dividerY + DIVIDER_GAP_Y;
  const patches: Record<string, Partial<CanvasArtifactNode>> = {};
  if (memberIds.length === 0) {
    return { patches, dividerY: group.dividerY === dividerY ? undefined : dividerY };
  }

  const frost = family === "frost";
  const naturals = new Map<string, { w: number; h: number }>();
  const tiles: RowTile[] = memberIds.map((id) => {
    const node = nodes[id]!;
    const artifact = sessionArtifacts[node.artifactId];
    const kind = artifact?.kind ?? "unknown";
    const natural = naturalOf(node, artifact);
    naturals.set(id, natural);
    const minW = frost
      ? Math.max(
          input.frostMinWidth?.(kind) ?? 0,
          node.frostMeasure?.minW ?? 0,
        )
      : 0;
    return {
      id,
      kind,
      natural,
      ...(node.userSetSize ? { lockZoom: true } : {}),
      ...(minW > 0 && !node.userSetSize ? { minW } : {}),
    };
  });

  const block = packJustifiedRows(tiles, { minWidth: right - left });

  // Rows, in order: the packer gives every tile in a row the same y.
  const rows: (typeof block.placed)[] = [];
  for (const tile of block.placed) {
    const row = rows[rows.length - 1];
    if (row && row[0]!.y === tile.y) row.push(tile);
    else rows.push([tile]);
  }

  // Frost never scales content, so a row's widths are free: every row is
  // stretched to end where the chapter ends (the cards above, or the widest
  // row), never leaving a short row with a gap at its end.
  if (frost) {
    const blockW = Math.max(block.width, right - left);
    for (const row of rows) {
      // A tile the user sized keeps its width; the others take the slack.
      const free = row.filter((t) => !nodes[t.id]!.userSetSize);
      if (free.length === 0) continue;
      const gaps = TILE_GAP * (row.length - 1);
      const sum = row.reduce((acc, t) => acc + t.w, 0);
      if (sum + gaps >= blockW - 1) continue;
      const fixed = sum - free.reduce((acc, t) => acc + t.w, 0);
      const k = (blockW - gaps - fixed) / (sum - fixed);
      const lastFree = free[free.length - 1]!;
      let x = 0;
      for (const tile of row) {
        if (tile !== lastFree && free.includes(tile)) {
          tile.w = Math.round(tile.w * k);
        }
        tile.x = x;
        x += tile.w + TILE_GAP;
      }
      // The last free tile absorbs rounding so the row ends exactly on blockW.
      lastFree.w = Math.round(lastFree.w + blockW - (x - TILE_GAP));
      x = 0;
      for (const tile of row) {
        tile.x = x;
        x += tile.w + TILE_GAP;
      }
    }
  }

  let y = top;
  for (const row of rows) {
    // Vanilla draws the packer's row; Frost draws each card at its column's
    // width and the row as tall as its tallest card's content.
    let rowH = row[0]!.h;
    if (frost) {
      rowH = 0;
      for (const tile of row) {
        const node = nodes[tile.id]!;
        const m = node.frostMeasure;
        const content =
          m && Math.abs(m.w - tile.w) <= 2
            ? m.h
            : (node.frostSize?.h ?? tile.h);
        const need = node.userSetSize
          ? Math.max(content, node.size?.h ?? 0)
          : content;
        rowH = Math.max(rowH, Math.round(need));
      }
    }

    for (const tile of row) {
      const node = nodes[tile.id]!;
      const patch: Partial<CanvasArtifactNode> = {};
      const x = left + tile.x;
      if (!near(node.position.x, x) || !near(node.position.y, y)) {
        patch.position = { x, y };
      }
      if (!node.userSetSize) {
        if (!near(node.size?.w, tile.w) || !near(node.size?.h, tile.h)) {
          patch.size = { w: tile.w, h: tile.h };
        }
        const zoom = Math.abs(tile.zoom - 1) > 0.001 ? tile.zoom : undefined;
        if (
          zoom === undefined
            ? node.contentZoom !== undefined
            : !near(node.contentZoom, zoom, 0.0005)
        ) {
          patch.contentZoom = zoom;
        }
        if (!node.layoutSetSize) patch.layoutSetSize = true;
        const natural = naturals.get(tile.id)!;
        if (
          !near(node.bentoNatural?.w, natural.w, 0.01) ||
          !near(node.bentoNatural?.h, natural.h, 0.01)
        ) {
          patch.bentoNatural = natural;
        }
      }
      if (frost) {
        if (!near(node.frostSize?.w, tile.w) || !near(node.frostSize?.h, rowH)) {
          patch.frostSize = { w: tile.w, h: rowH };
        }
        if (!near(node.frostRowH, rowH)) patch.frostRowH = rowH;
      }
      if (Object.keys(patch).length > 0) patches[tile.id] = patch;
    }
    y += rowH + TILE_GAP;
  }

  return {
    patches,
    dividerY: group.dividerY === dividerY ? undefined : dividerY,
  };
}

/*
 * Holds: while the user is resizing a member, the grid waits — re-packing
 * under the pointer would move the very corner being dragged. The reflow runs
 * once the grip is let go.
 */
let holds = 0;
const releaseListeners = new Set<() => void>();

export function holdBento(): () => void {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds = Math.max(0, holds - 1);
    if (holds === 0) for (const fn of releaseListeners) fn();
  };
}

export function isBentoHeld(): boolean {
  return holds > 0;
}

export function onBentoRelease(fn: () => void): () => void {
  releaseListeners.add(fn);
  return () => releaseListeners.delete(fn);
}

/*
 * Chapter spine — chapters sit side by side, CHAPTER_GAP_X apart, with the
 * episode masthead column to the left of the first. A re-pack can change a
 * chapter's width (Frost draws a stat no narrower than its numerals need), so
 * after every re-pack each chapter is slid to sit exactly one gap after the
 * one before it. Chapters are named `<prefix>-chapter-<n>` by layoutChapters.
 */

const CHAPTER_ID = /^(.*)-chapter-(\d+)$/;

export interface SpineInput {
  groups: Record<string, BranchGroup>;
  cards: Record<string, Card>;
  nodes: Record<string, CanvasArtifactNode>;
  sessionArtifacts: Record<string, SessionArtifact>;
  /** Artifact kinds drawn in the masthead column. */
  mastheadKinds: ReadonlySet<string>;
  gap: number;
}

function groupExtent(
  group: BranchGroup,
  input: SpineInput,
): { left: number; right: number; top: number; bottom: number } | null {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  const add = (x: number, y: number, w: number, h: number) => {
    left = Math.min(left, x);
    right = Math.max(right, x + w);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y + h);
  };
  for (const id of group.cardIds ?? []) {
    const card = input.cards[id];
    if (!card) continue;
    const { w, h } = getCardBounds(card);
    add(card.position.x, card.position.y, w, h);
  }
  for (const item of group.items ?? []) {
    if (item.kind !== "artifact") continue;
    const node = input.nodes[item.id];
    if (!node) continue;
    const { w, h } = getArtifactBounds(node, input.sessionArtifacts[node.artifactId]);
    add(node.position.x, node.position.y, w, h);
  }
  return Number.isFinite(left) ? { left, right, top, bottom } : null;
}

/** How far each chapter must slide (x) so the spine keeps its gaps. */
export function planSpineShifts(input: SpineInput): Record<string, number> {
  const spines = new Map<string, { n: number; group: BranchGroup }[]>();
  for (const group of Object.values(input.groups)) {
    const match = CHAPTER_ID.exec(group.id);
    // Every chapter holds a place on the spine, artifacts or not.
    if (!match || (group.cardIds?.length ?? 0) === 0) continue;
    const list = spines.get(match[1]!) ?? [];
    list.push({ n: Number(match[2]), group });
    spines.set(match[1]!, list);
  }

  const grouped = new Set<string>();
  for (const group of Object.values(input.groups)) {
    for (const item of group.items ?? []) grouped.add(item.id);
  }

  const shifts: Record<string, number> = {};
  for (const [prefix, list] of spines) {
    list.sort((a, b) => a.n - b.n);
    let prevRight: number | null = null;
    const first = groupExtent(list[0]!.group, input);
    if (first) {
      // A canvas can hold several spines (two imports side by side). This
      // spine's masthead sits between chapter 1 and whatever group lies to its
      // left — never behind another spine's chapters, or chapter 1 would slide
      // back to sit one gap after THAT canvas's masthead, on top of its work.
      let barrier = -Infinity;
      for (const group of Object.values(input.groups)) {
        if (CHAPTER_ID.exec(group.id)?.[1] === prefix) continue;
        const extent = groupExtent(group, input);
        if (extent && extent.right <= first.left) {
          barrier = Math.max(barrier, extent.right);
        }
      }
      // The masthead: ungrouped masthead-kind nodes to the left of chapter 1
      // and level with it.
      for (const node of Object.values(input.nodes)) {
        if (grouped.has(node.id)) continue;
        const artifact = input.sessionArtifacts[node.artifactId];
        if (!artifact) continue;
        if (!input.mastheadKinds.has(artifact.kind) && !node.mastheadScale) continue;
        const { w, h } = getArtifactBounds(node, artifact);
        if (node.position.x >= first.left) continue;
        if (node.position.x < barrier) continue;
        if (node.position.y > first.bottom || node.position.y + h < first.top - 2000) continue;
        prevRight = Math.max(prevRight ?? -Infinity, node.position.x + w);
      }
    }
    for (const { group } of list) {
      const extent = groupExtent(group, input);
      if (!extent) continue;
      let dx = 0;
      if (prevRight !== null) dx = prevRight + input.gap - extent.left;
      if (Math.abs(dx) > 0.5) shifts[group.id] = Math.round(dx);
      prevRight = extent.right + (Math.abs(dx) > 0.5 ? Math.round(dx) : 0);
    }
  }
  return shifts;
}

/**
 * The masthead column (episode, its links, any episode-level chart) stacks
 * top-down one TILE_GAP apart, so a card that changes height — Frost hugs
 * the episode — pushes the next one down instead of running into it.
 */
export function planMastheadStack(
  input: SpineInput,
): Record<string, { x: number; y: number }> {
  const grouped = new Set<string>();
  for (const group of Object.values(input.groups)) {
    for (const item of group.items ?? []) grouped.add(item.id);
  }
  const column = Object.values(input.nodes)
    .filter((node) => {
      if (grouped.has(node.id)) return false;
      const artifact = input.sessionArtifacts[node.artifactId];
      return Boolean(
        artifact &&
          (input.mastheadKinds.has(artifact.kind) || node.mastheadScale),
      );
    })
    .sort((a, b) => a.position.y - b.position.y);
  const moves: Record<string, { x: number; y: number }> = {};
  // One column per x (an import's masthead shares its left edge).
  const byX = new Map<number, CanvasArtifactNode[]>();
  for (const node of column) {
    const key = Math.round(node.position.x);
    byX.set(key, [...(byX.get(key) ?? []), node]);
  }
  for (const nodes of byX.values()) {
    let y: number | null = null;
    for (const node of nodes) {
      const { h } = getArtifactBounds(node, input.sessionArtifacts[node.artifactId]);
      if (y !== null && Math.abs(node.position.y - y) > 0.5) {
        moves[node.id] = { x: node.position.x, y };
      }
      y = (y !== null ? y : node.position.y) + h + TILE_GAP;
    }
  }
  return moves;
}
