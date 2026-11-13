import { describe, expect, it } from "vitest";
import {
  buildCanvasSnapshot,
  buildEmptyCanvasSnapshot,
  normalizeCanvasSnapshot,
  parseCanvasSnapshot,
} from "@/lib/canvasSnapshot";

describe("normalizeCanvasSnapshot", () => {
  it("fills defaults for trigger-created { version: 1 } snapshots", () => {
    const snapshot = normalizeCanvasSnapshot({ version: 1 });
    const empty = buildEmptyCanvasSnapshot();

    expect(snapshot.cardOrder).toEqual([]);
    expect(snapshot.threadOrder).toEqual([]);
    expect(snapshot.sessionArtifacts).toEqual({});
    expect(snapshot.viewport).toEqual(empty.viewport);
  });

  it("parses minimal persisted snapshots", () => {
    const parsed = parseCanvasSnapshot({ version: 1 });
    expect(parsed).not.toBeNull();
    expect(parsed?.cardOrder).toEqual([]);
  });

  it("defaults canvasBackgroundStyle to grid for legacy snapshots", () => {
    const snapshot = normalizeCanvasSnapshot({ version: 1 });
    expect(snapshot.canvasBackgroundStyle).toBe("grid");
  });

  it("starts new empty canvases in frost", () => {
    expect(buildEmptyCanvasSnapshot().canvasArtifactStyle).toBe("frost");
  });

  it("defaults canvasArtifactStyle to vanilla for legacy snapshots", () => {
    const snapshot = normalizeCanvasSnapshot({ version: 1 });
    expect(snapshot.canvasArtifactStyle).toBe("vanilla");
  });

  it("preserves a registered canvasArtifactStyle and drops unknown ones", () => {
    expect(
      normalizeCanvasSnapshot({ version: 1, canvasArtifactStyle: "bento" })
        .canvasArtifactStyle,
    ).toBe("bento");
    expect(
      normalizeCanvasSnapshot({ version: 1, canvasArtifactStyle: "bogus" })
        .canvasArtifactStyle,
    ).toBe("vanilla");
  });

  it("preserves valid canvasBackgroundStyle values", () => {
    const snapshot = normalizeCanvasSnapshot({
      version: 1,
      canvasBackgroundStyle: "ambient-gradient",
    });
    expect(snapshot.canvasBackgroundStyle).toBe("ambient-gradient");
  });

  it("preserves static-image style and image id", () => {
    const snapshot = normalizeCanvasSnapshot({
      version: 1,
      canvasBackgroundStyle: "static-image",
      canvasBackgroundImageId: "grok-7e162978",
    });
    expect(snapshot.canvasBackgroundStyle).toBe("static-image");
    expect(snapshot.canvasBackgroundImageId).toBe("grok-7e162978");
  });

  it("falls back to default image id for invalid canvasBackgroundImageId", () => {
    const snapshot = normalizeCanvasSnapshot({
      version: 1,
      canvasBackgroundStyle: "static-image",
      canvasBackgroundImageId: "missing-image",
    });
    expect(snapshot.canvasBackgroundImageId).toBe("grok-5f2e9dd9");
  });

  it("preserves chat view, reopens hidden focus view as chat, and coerces unknown values", () => {
    expect(
      normalizeCanvasSnapshot({ version: 1, viewMode: "chat" }).viewMode,
    ).toBe("chat");
    expect(
      normalizeCanvasSnapshot({ version: 1, viewMode: "focus" }).viewMode,
    ).toBe("chat");
    expect(
      normalizeCanvasSnapshot({ version: 1, viewMode: "bogus" }).viewMode,
    ).toBe("canvas");
    expect(normalizeCanvasSnapshot({ version: 1 }).viewMode).toBe("canvas");
  });

  it("falls back to grid for removed canvasBackgroundStyle values", () => {
    const snapshot = normalizeCanvasSnapshot({
      version: 1,
      canvasBackgroundStyle: "blueprint",
    });
    expect(snapshot.canvasBackgroundStyle).toBe("grid");
  });

  it("falls back to grid for legacy removed backgrounds like sky", () => {
    const snapshot = normalizeCanvasSnapshot({
      version: 1,
      canvasBackgroundStyle: "sky",
    });
    expect(snapshot.canvasBackgroundStyle).toBe("grid");
  });

  it("falls back to grid for legacy removed backgrounds like rising-sun", () => {
    const snapshot = normalizeCanvasSnapshot({
      version: 1,
      canvasTheme: "dark",
      canvasBackgroundStyle: "rising-sun",
    });
    expect(snapshot.canvasBackgroundStyle).toBe("grid");
  });

  it("defaults canvasTheme to light for new snapshots", () => {
    const snapshot = normalizeCanvasSnapshot({ version: 1 });
    expect(snapshot.canvasTheme).toBe("light");
  });

  it("drops session artifacts missing versions", () => {
    const snapshot = normalizeCanvasSnapshot({
      version: 1,
      sessionArtifacts: {
        broken: {
          id: "art_1",
          title: "Broken",
          kind: "custom",
          latestVersionId: "missing",
        },
      },
    });

    expect(snapshot.sessionArtifacts).toEqual({});
  });
});

describe("buildCanvasSnapshot card normalization", () => {
  // Turn-scoped MCP payload; persisting it would bloat the snapshot and
  // resurrect a stale build on reload.
  it("drops customUiSource", () => {
    const snapshot = buildCanvasSnapshot({
      ...buildEmptyCanvasSnapshot(),
      cards: {
        c1: {
          id: "c1",
          threadId: "t1",
          question: "Build an interactive explorer from the memory results",
          answer: "",
          status: "done",
          parentCardId: null,
          parentConversationId: null,
          position: { x: 0, y: 0 },
          customUiSource: {
            serverName: "memory",
            toolName: "read_graph",
            brief: "explore",
            text: '{"entities":[]}',
          },
        },
      },
      cardOrder: ["c1"],
    } as never);

    expect(snapshot.cards.c1!.customUiSource).toBeUndefined();
  });
});
