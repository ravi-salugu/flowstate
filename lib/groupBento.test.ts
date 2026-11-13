import { describe, expect, it } from "vitest";
import {
  planBentoGroup,
  planMastheadStack,
  planSpineShifts,
} from "@/lib/groupBento";
import type { BranchGroup, CanvasArtifactNode, Card } from "@/lib/store";
import type { SessionArtifact } from "@/lib/sessionArtifacts";
import { packJustifiedRows } from "@/lib/transcriptImport/chapterLayout";

const card = (id: string, x: number, y: number, w = 400, h = 300) =>
  ({ id, position: { x, y }, size: { w, h } }) as unknown as Card;
const art = (id: string, kind: string) =>
  ({ id, kind, title: id, latestVersionId: `${id}-v`, versions: [] }) as unknown as SessionArtifact;
const node = (id: string, extra: Partial<CanvasArtifactNode> = {}): CanvasArtifactNode => ({
  id,
  artifactId: id,
  versionId: `${id}-v`,
  sourceCardId: "c1",
  position: { x: 0, y: 0 },
  ...extra,
});

function chapter(ids: string[], kinds: string[], naturals: { w: number; h: number }[]) {
  const cards = { c1: card("c1", 0, 0), c2: card("c2", 448, 0) };
  const sessionArtifacts = Object.fromEntries(ids.map((id, i) => [id, art(id, kinds[i]!)]));
  const packed = packJustifiedRows(
    ids.map((id, i) => ({ id, kind: kinds[i]!, natural: naturals[i]! })),
    { minWidth: 848 },
  );
  const nodes: Record<string, CanvasArtifactNode> = {};
  for (const t of packed.placed) {
    const i = ids.indexOf(t.id);
    nodes[t.id] = node(t.id, {
      position: { x: t.x, y: 372 + t.y },
      size: { w: t.w, h: t.h },
      layoutSetSize: true,
      bentoNatural: naturals[i],
      ...(Math.abs(t.zoom - 1) > 0.001 ? { contentZoom: t.zoom } : {}),
    });
  }
  const group: BranchGroup = {
    id: "x-chapter-1",
    label: "Chapter 1",
    familyRootThreadIds: [],
    cardIds: ["c1", "c2"],
    items: ids.map((id) => ({ kind: "artifact" as const, id })),
    dividerY: 336,
    summaryMarkdown: null,
  };
  return { cards, nodes, sessionArtifacts, group };
}

const IDS = ["a", "b", "c"];
const KINDS = ["quote", "stat", "website"];
const NATURALS = [
  { w: 520, h: 300 },
  { w: 400, h: 320 },
  { w: 560, h: 360 },
];

describe("planBentoGroup", () => {
  it("leaves a freshly built vanilla chapter exactly where it is", () => {
    const c = chapter(IDS, KINDS, NATURALS);
    const plan = planBentoGroup({ ...c, family: null });
    expect(plan?.patches).toEqual({});
    expect(plan?.dividerY).toBeUndefined();
  });

  it("floors every Frost card in a row to the row's tallest content", () => {
    const c = chapter(IDS, KINDS, NATURALS);
    // Frost measured each card at its column width; one needs much more room.
    for (const [i, id] of IDS.entries()) {
      const n = c.nodes[id]!;
      n.frostMeasure = { w: n.size!.w, h: 200 + i * 150, minW: 0 };
    }
    const plan = planBentoGroup({ ...c, family: "frost" })!;
    const rows = new Map<number, number[]>();
    for (const id of IDS) {
      const p = { ...c.nodes[id]!, ...plan.patches[id] };
      rows.set(p.position.y, [...(rows.get(p.position.y) ?? []), p.frostRowH!]);
      expect(p.frostSize?.h).toBe(p.frostRowH);
    }
    for (const heights of rows.values()) {
      expect(new Set(heights).size).toBe(1);
    }
  });

  it("keeps a user-resized tile at the size the user gave it", () => {
    const c = chapter(IDS, KINDS, NATURALS);
    c.nodes.b = { ...c.nodes.b!, size: { w: 700, h: 500 }, userSetSize: true };
    const plan = planBentoGroup({ ...c, family: null })!;
    expect(plan.patches.b?.size).toBeUndefined();
    // Nothing overlaps it afterwards.
    const boxes = IDS.map((id) => {
      const n = { ...c.nodes[id]!, ...plan.patches[id] };
      return { x: n.position.x, y: n.position.y, w: n.size!.w, h: n.size!.h };
    });
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
  });

  it("moves the divider and tiles down when the cards above grow", () => {
    const c = chapter(IDS, KINDS, NATURALS);
    c.cards.c1 = card("c1", 0, 0, 400, 420);
    const plan = planBentoGroup({ ...c, family: null })!;
    expect(plan.dividerY).toBe(456);
    expect(Math.min(...IDS.map((id) => plan.patches[id]!.position!.y))).toBe(492);
  });
});

describe("planSpineShifts / planMastheadStack", () => {
  const groupAt = (n: number, cardId: string): BranchGroup => ({
    id: `x-chapter-${n}`,
    label: "",
    familyRootThreadIds: [],
    cardIds: [cardId],
    summaryMarkdown: null,
  });

  it("keeps chapters one gap apart, including chapters with no artifacts", () => {
    const cards = { a: card("a", 0, 0, 900), b: card("b", 1000, 0, 400), c: card("c", 1200, 0, 400) };
    const groups = { g1: groupAt(1, "a"), g2: groupAt(2, "b"), g3: groupAt(3, "c") };
    const shifts = planSpineShifts({
      groups: { [groups.g1.id]: groups.g1, [groups.g2.id]: groups.g2, [groups.g3.id]: groups.g3 },
      cards,
      nodes: {},
      sessionArtifacts: {},
      mastheadKinds: new Set(["episode"]),
      gap: 260,
    });
    expect(shifts).toEqual({ "x-chapter-2": 160, "x-chapter-3": 620 });
  });

  it("keeps a second spine beside the first, not behind its masthead", () => {
    // Spine "x" (an earlier import) with its masthead at the far left, then
    // spine "y" (a later import, no sources so no masthead) placed well to
    // its right. y must stay put, not slide back after x's masthead.
    const cards = {
      a: card("a", 1660, 0, 900),
      b: card("b", 9647, 0, 400),
    };
    const groups = {
      gx: groupAt(1, "a"),
      gy: Object.assign(groupAt(1, "b"), { id: "y-chapter-1" }),
    };
    const nodes = {
      xMast: node("xMast", { position: { x: 0, y: 0 }, size: { w: 1400, h: 900 }, layoutSetSize: true }),
    };
    const shifts = planSpineShifts({
      groups: { [groups.gx.id]: groups.gx, [groups.gy.id]: groups.gy },
      cards,
      nodes,
      sessionArtifacts: { xMast: art("xMast", "linkgroup") },
      mastheadKinds: new Set(["linkgroup"]),
      gap: 260,
    });
    expect(shifts).toEqual({});
  });

  it("restacks the masthead column under a card that grew", () => {
    const nodes = {
      ep: node("ep", { position: { x: -2000, y: 0 }, size: { w: 1400, h: 900 }, layoutSetSize: true }),
      links: node("links", { position: { x: -2000, y: 500 }, size: { w: 1400, h: 300 }, layoutSetSize: true }),
    };
    const moves = planMastheadStack({
      groups: {},
      cards: {},
      nodes,
      sessionArtifacts: { ep: art("ep", "episode"), links: art("links", "linkgroup") },
      mastheadKinds: new Set(["episode", "linkgroup"]),
      gap: 260,
    });
    expect(moves.links).toEqual({ x: -2000, y: 948 });
  });
});

describe("Frost row stretch", () => {
  it("fills short rows to the chapter width but never widens a user-sized tile", () => {
    const c = chapter(IDS, KINDS, NATURALS);
    for (const id of IDS) {
      const n = c.nodes[id]!;
      n.frostMeasure = { w: n.size!.w, h: 300, minW: 0 };
    }
    c.nodes.a = { ...c.nodes.a!, size: { w: 600, h: 300 }, userSetSize: true };
    const plan = planBentoGroup({ ...c, family: "frost" })!;
    const placed = IDS.map((id) => ({ id, ...c.nodes[id]!, ...plan.patches[id] }));
    expect(placed.find((p) => p.id === "a")!.frostSize?.w ?? 600).toBe(600);
    const rows = new Map<number, typeof placed>();
    for (const p of placed) rows.set(p.position.y, [...(rows.get(p.position.y) ?? []), p]);
    const rights = [...rows.values()]
      .filter((row) => !row.every((p) => p.userSetSize))
      .map((row) => Math.max(...row.map((p) => p.position.x + p.frostSize!.w)));
    expect(new Set(rights).size).toBe(1);
    expect(rights[0]).toBeGreaterThanOrEqual(848);
  });
});
