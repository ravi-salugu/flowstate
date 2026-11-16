/*
 * Lay a set of groups (chapters) out as a grid with a fixed number of rows.
 *
 * Imported transcript canvases put every chapter side by side in one very long
 * row. This reflows them in reading order — left to right, then top to
 * bottom — into `rows` rows. Each row is as tall as its tallest chapter and
 * chapters in a row sit one gap apart, so nothing overlaps whatever the
 * chapter sizes. Every row starts at the first chapter's left edge, which
 * stays where it was.
 *
 * Pure: it returns per-group deltas; the store applies them with moveGroupBy.
 */

export interface GroupBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GroupMove {
  id: string;
  dx: number;
  dy: number;
}

/** Fallback gutter when the current layout gives nothing to measure. */
export const DEFAULT_GROUP_GRID_GAP = 260;

/** Reading order of the current layout: by row band, then left to right. */
function readingOrder(boxes: GroupBox[]): GroupBox[] {
  return [...boxes].sort((a, b) => {
    // Boxes whose tops are within half the shorter height share a row.
    const band = Math.min(a.h, b.h) / 2;
    if (Math.abs(a.y - b.y) > band) return a.y - b.y;
    return a.x - b.x;
  });
}

/**
 * The gutter the layout already uses between horizontal neighbours (median),
 * so a reflow keeps the canvas's own spacing.
 */
export function measureGroupGap(boxes: GroupBox[]): number {
  const ordered = readingOrder(boxes);
  const gaps: number[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1]!;
    const next = ordered[i]!;
    const gap = next.x - (prev.x + prev.w);
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return DEFAULT_GROUP_GRID_GAP;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)]!;
}

export function planGroupGrid(
  boxes: GroupBox[],
  rows: number,
  gap: number = measureGroupGap(boxes),
): GroupMove[] {
  if (boxes.length < 2 || rows < 1) return [];
  const ordered = readingOrder(boxes);
  const rowCount = Math.min(rows, ordered.length);
  const perRow = Math.ceil(ordered.length / rowCount);

  // Rows start at the first chapter's left edge; within a row each chapter
  // sits one gap after the last — the same spacing Frost's chapter spine
  // keeps (lib/groupBento planSpineShifts), so the two never disagree.
  const rowH = new Array<number>(rowCount).fill(0);
  ordered.forEach((box, i) => {
    const r = Math.floor(i / perRow);
    rowH[r] = Math.max(rowH[r]!, box.h);
  });

  const originX = ordered[0]!.x;
  const rowY: number[] = [];
  let y = ordered[0]!.y;
  for (let r = 0; r < rowCount; r++) {
    rowY.push(y);
    y += rowH[r]! + gap;
  }

  const moves: GroupMove[] = [];
  let x = originX;
  ordered.forEach((box, i) => {
    const r = Math.floor(i / perRow);
    if (i % perRow === 0) x = originX;
    moves.push({ id: box.id, dx: x - box.x, dy: rowY[r]! - box.y });
    x += box.w + gap;
  });
  return moves;
}
