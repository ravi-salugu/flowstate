import { describe, expect, it } from "vitest";
import { computeCanvasContentBounds } from "@/lib/canvasContentBounds";
import { convCard } from "@/lib/transcriptImport/playgroundLayout";
import {
  buildImportForCanvas,
  findImportOrigin,
  IMPORT_SECTION_GAP_X,
  mergeImportIntoState,
  type CanvasImportState,
} from "@/lib/conversationImport/placeInCanvas";
import { normalizeConversationImportSpec } from "@/lib/conversationImport/spec";

const SPEC = normalizeConversationImportSpec({
  title: "Vector DBs",
  summary: "Chose pgvector.",
  chapters: [
    {
      title: "Need a vector DB?",
      summary: "Not yet.",
      followUps: [{ title: "What breaks first?", summary: "Memory." }],
      artifacts: [{ kind: "stat", title: "Index", value: "48 GB", label: "HNSW" }],
    },
    { title: "Compare options", summary: "Four options.", followUps: [], artifacts: [] },
  ],
  openThreads: ["Benchmark"],
  decisions: [],
  sources: [{ title: "pgvector", url: "https://github.com/pgvector/pgvector" }],
})!;

function emptyState(): CanvasImportState {
  return {
    cards: {},
    cardOrder: [],
    connections: [],
    threads: {},
    threadOrder: [],
    threadGists: {},
    groups: {},
    sessionArtifacts: {},
    canvasArtifactNodes: {},
    canvasArtifactOrder: [],
    canvasAssets: {},
    canvasAssetNodes: {},
    canvasAssetOrder: [],
    canvasGifNodes: {},
    canvasGifOrder: [],
    canvas3DNodes: {},
    canvas3DOrder: [],
    canvasSkills: {},
    canvasSkillNodes: {},
    canvasSkillOrder: [],
    canvasTextLabels: {},
    canvasTextLabelOrder: [],
  };
}

function withExistingCard(): CanvasImportState {
  const state = emptyState();
  const card = convCard("existing-1", "t-existing", "My question", "My answer");
  card.position = { x: 300, y: 200 };
  state.cards = { [card.id]: card };
  state.cardOrder = [card.id];
  state.threads = { "t-existing": { id: "t-existing", accentColour: "#000" } };
  state.threadOrder = ["t-existing"];
  return state;
}

describe("findImportOrigin", () => {
  it("starts at the origin on an empty canvas", () => {
    expect(findImportOrigin(emptyState())).toEqual({ x: 0, y: 0 });
  });

  it("starts to the right of existing content, with a gutter", () => {
    const state = withExistingCard();
    const bounds = computeCanvasContentBounds(state, 0);
    const origin = findImportOrigin(state);
    expect(origin.x).toBe(Math.round(bounds.x + bounds.w + IMPORT_SECTION_GAP_X));
  });
});

describe("importing into a canvas with work on it", () => {
  const state = withExistingCard();
  const section = buildImportForCanvas(SPEC, state);
  const existingRight = computeCanvasContentBounds(state, 0);

  it("places every imported node right of the existing content", () => {
    const right = existingRight.x + existingRight.w;
    for (const id of section.cardOrder) {
      expect(section.cards[id]!.position.x).toBeGreaterThan(right);
    }
    for (const id of section.canvasArtifactOrder) {
      expect(section.canvasArtifactNodes[id]!.position.x).toBeGreaterThan(right);
    }
  });

  it("merges additively, leaving existing nodes untouched", () => {
    const patch = mergeImportIntoState(state, section);
    expect(patch.cards["existing-1"]).toBe(state.cards["existing-1"]);
    expect(patch.cardOrder[0]).toBe("existing-1");
    expect(patch.cardOrder).toHaveLength(1 + section.cardOrder.length);
    expect(patch.threads["t-existing"]).toBeDefined();
  });

  it("never reuses ids, even importing the same file twice", () => {
    const once = mergeImportIntoState(state, section);
    const second = buildImportForCanvas(SPEC, { ...state, ...once });
    const firstIds = new Set([
      ...section.cardOrder,
      ...section.canvasArtifactOrder,
      ...Object.keys(section.groups),
      ...section.threadOrder,
    ]);
    for (const id of [
      ...second.cardOrder,
      ...second.canvasArtifactOrder,
      ...Object.keys(second.groups),
      ...second.threadOrder,
    ]) {
      expect(firstIds.has(id)).toBe(false);
    }
    // And the second import lands right of the first.
    const firstRight = Math.max(
      ...section.cardOrder.map((id) => section.cards[id]!.position.x),
    );
    for (const id of second.cardOrder) {
      expect(second.cards[id]!.position.x).toBeGreaterThan(firstRight);
    }
  });
});
