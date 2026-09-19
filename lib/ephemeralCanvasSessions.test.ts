import { afterEach, describe, expect, it } from "vitest";
import { isEphemeralFixtureSessionActive } from "@/lib/ephemeralCanvasSessions";
import {
  beginPublishedCanvasSession,
  endPublishedCanvasSession,
  isPublishedCanvasSessionActive,
} from "@/lib/publishedCanvasSession";
import type { CanvasSnapshotSource } from "@/lib/canvasSnapshot";

const source = { cards: { mine: { question: "my own work" } } } as unknown as
  CanvasSnapshotSource;

afterEach(() => {
  endPublishedCanvasSession();
});

describe("published canvas session", () => {
  it("is inert until a session begins", () => {
    expect(isPublishedCanvasSessionActive()).toBe(false);
    expect(isEphemeralFixtureSessionActive()).toBe(false);
  });

  it("suppresses autosave while a published canvas is open", () => {
    // THE critical property. A signed-in visitor opening /c/<slug> is not a
    // guest, so without this the autosave treats the published snapshot as an
    // edit to THEIR canvas and overwrites it — silently.
    beginPublishedCanvasSession(source);
    expect(isEphemeralFixtureSessionActive()).toBe(true);
  });

  it("hands back the visitor's own canvas to restore on the way out", () => {
    beginPublishedCanvasSession(source);
    const restored = endPublishedCanvasSession();
    expect(restored).toEqual(source);
    expect(isEphemeralFixtureSessionActive()).toBe(false);
  });

  it("deep-copies the stash, so canvas edits cannot corrupt the restore", () => {
    const live = JSON.parse(JSON.stringify(source)) as Record<string, never>;
    beginPublishedCanvasSession(live as unknown as CanvasSnapshotSource);
    // Simulate the visitor editing the store after the session began.
    (live as unknown as { cards: Record<string, unknown> }).cards = {};
    const restored = endPublishedCanvasSession() as unknown as {
      cards: Record<string, unknown>;
    };
    expect(Object.keys(restored.cards)).toEqual(["mine"]);
  });

  it("clears the stash so a second session cannot restore a stale canvas", () => {
    beginPublishedCanvasSession(source);
    endPublishedCanvasSession();
    expect(endPublishedCanvasSession()).toBeNull();
  });
});
