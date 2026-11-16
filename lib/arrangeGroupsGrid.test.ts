import { describe, expect, it } from "vitest";
import { measureGroupGap, planGroupGrid, type GroupBox } from "./arrangeGroupsGrid";

/** n chapters in one row, like an imported transcript canvas. */
function row(n: number, w = 1000, gap = 260, heights?: number[]): GroupBox[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `g${i + 1}`,
    x: i * (w + gap),
    y: 0,
    w,
    h: heights?.[i] ?? 2000,
  }));
}

function apply(boxes: GroupBox[], rows: number): GroupBox[] {
  const moves = new Map(planGroupGrid(boxes, rows).map((m) => [m.id, m]));
  return boxes.map((b) => {
    const m = moves.get(b.id)!;
    return { ...b, x: b.x + m.dx, y: b.y + m.dy };
  });
}

function overlaps(a: GroupBox, b: GroupBox): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe("planGroupGrid", () => {
  it("reflows a single row of 9 chapters into 3 rows of 3, in reading order", () => {
    const out = apply(row(9), 3);
    const ys = [...new Set(out.map((b) => b.y))];
    expect(ys).toHaveLength(3);
    // Row 1 holds chapters 1–3 left to right, row 2 holds 4–6.
    expect(out.slice(0, 3).every((b) => b.y === 0)).toBe(true);
    expect(out[0]!.x).toBeLessThan(out[1]!.x);
    expect(out[3]!.x).toBe(out[0]!.x);
    expect(out[3]!.y).toBeGreaterThan(0);
  });

  it("keeps the first chapter where it was", () => {
    const boxes = row(6).map((b) => ({ ...b, x: b.x + 500, y: b.y - 300 }));
    const out = apply(boxes, 3);
    expect(out[0]).toMatchObject({ x: 500, y: -300 });
  });

  it("never overlaps chapters of uneven heights", () => {
    const out = apply(row(10, 1000, 260, [800, 2400, 1200, 3000, 900, 1500, 2100, 700, 2600, 1100]), 3);
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        expect(overlaps(out[i]!, out[j]!)).toBe(false);
      }
    }
    expect(new Set(out.map((b) => b.y)).size).toBe(3);
  });

  it("keeps the canvas's own gutter", () => {
    expect(measureGroupGap(row(5, 1000, 180))).toBe(180);
    const out = apply(row(6, 1000, 180), 3);
    expect(out[1]!.x - (out[0]!.x + out[0]!.w)).toBe(180);
  });

  it("uses fewer rows than asked when there are fewer chapters", () => {
    const out = apply(row(2), 3);
    expect(new Set(out.map((b) => b.y)).size).toBe(2);
  });

  it("does nothing for a single chapter", () => {
    expect(planGroupGrid(row(1), 3)).toEqual([]);
  });
});
