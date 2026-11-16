import { describe, expect, it } from "vitest";
import { useCanvasStore } from "@/lib/store";
import { computeGroupBounds } from "@/lib/groupBounds";
import { buildAllariNareshCanvasSection } from "@/lib/transcriptImport/buildAllariNareshCanvasSection";
import { planSpineShifts } from "@/lib/groupBento";
import { MASTHEAD_ARTIFACT_KINDS } from "@/lib/transcriptArtifacts";
import { CHAPTER_GAP_X } from "@/lib/transcriptImport/chapterLayout";

/*
 * End to end on a real chapter canvas (a Raw Talks with VK episode, built the
 * same way as the Dil Raju canvas): every chapter starts in one row, and
 * "Arrange in 3 rows" must leave them in three left-aligned rows that do not
 * overlap.
 */

function loadEpisode() {
  const s = buildAllariNareshCanvasSection();
  useCanvasStore.setState({
    cards: s.cards,
    cardOrder: s.cardOrder,
    connections: s.connections,
    threads: s.threads,
    threadOrder: s.threadOrder,
    groups: s.groups,
    sessionArtifacts: s.sessionArtifacts,
    canvasArtifactNodes: s.canvasArtifactNodes,
    canvasArtifactOrder: s.canvasArtifactOrder,
    canvasReadOnly: false,
  });
}

function boxes() {
  const st = useCanvasStore.getState();
  return Object.values(st.groups).map((g) => ({
    id: g.id,
    ...computeGroupBounds(st, g)!,
  }));
}

describe("arrangeGroupsInGrid on a chapter canvas", () => {
  it("turns one row of chapters into three aligned rows", () => {
    loadEpisode();
    const before = boxes();
    expect(new Set(before.map((b) => Math.round(b.y / 200))).size).toBeLessThanOrEqual(2);

    useCanvasStore.getState().arrangeGroupsInGrid(
      Object.keys(useCanvasStore.getState().groups),
      3,
    );
    const after = boxes();

    // Three row bands.
    const tops = [...new Set(after.map((b) => Math.round(b.y)))].sort((a, b) => a - b);
    const lefts = new Map<number, number>();
    for (const b of after) {
      const row = Math.round(b.y);
      lefts.set(row, Math.min(lefts.get(row) ?? Infinity, b.x));
    }
    expect(lefts.size).toBe(3);
    // Every row starts at the same x.
    expect(new Set([...lefts.values()].map(Math.round)).size).toBe(1);

    for (let i = 0; i < after.length; i++) {
      for (let j = i + 1; j < after.length; j++) {
        const a = after[i]!;
        const b = after[j]!;
        const overlap =
          a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
    expect(tops.length).toBeGreaterThanOrEqual(3);

    // Frost's chapter spine re-spaces chapters after every change. It must
    // agree with the arrangement, or it drags each row to the end of the
    // row above (the staircase seen on the Dil Raju canvas).
    const st = useCanvasStore.getState();
    const shifts = planSpineShifts({
      groups: st.groups,
      cards: st.cards,
      nodes: st.canvasArtifactNodes,
      sessionArtifacts: st.sessionArtifacts,
      mastheadKinds: MASTHEAD_ARTIFACT_KINDS,
      gap: CHAPTER_GAP_X,
    });
    expect(shifts).toEqual({});
  });
});
