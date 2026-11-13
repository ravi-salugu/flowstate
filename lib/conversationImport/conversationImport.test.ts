import { describe, expect, it } from "vitest";
import { buildConversationImportCanvasSection } from "@/lib/conversationImport/buildConversationImportCanvasSection";
import {
  MAX_CHAPTERS,
  normalizeConversationImportSpec,
} from "@/lib/conversationImport/spec";

const RAW = {
  title: "Picking a vector database",
  summary: "Compared stores; chose pgvector.",
  chapters: [
    {
      title: "Do we need a dedicated vector DB?",
      summary: "Probably not at 10M vectors.",
      followUps: [{ title: "What breaks first?", summary: "Index memory." }],
      artifacts: [
        { kind: "stat", title: "Index memory", value: "~48 GB", label: "HNSW at 10M" },
        {
          kind: "steps",
          title: "Latency chain",
          steps: [{ label: "Corpus outgrows RAM" }, { label: "p95 climbs" }],
        },
        { kind: "link", title: "pgvector", url: "https://github.com/pgvector/pgvector" },
      ],
    },
    {
      title: "How do options compare?",
      summary: "Four options.",
      followUps: [],
      artifacts: [
        {
          kind: "table",
          title: "Comparison",
          columns: ["Option", "Cost"],
          rows: [["pgvector", "$400"], ["Pinecone"]],
        },
        {
          kind: "debate",
          title: "Managed?",
          topic: "Is managed worth it?",
          forSide: { speaker: "you", text: "Less ops." },
          againstSide: { speaker: "me", text: "Second datastore." },
        },
        { kind: "quote", title: "Rule", text: "Revisit below 0.9 recall.", speaker: "me" },
        { kind: "term", title: "recall@10", term: "recall@10", definition: "Share found in top 10." },
      ],
    },
  ],
  openThreads: ["Benchmark filters"],
  decisions: ["Start on pgvector"],
  sources: [
    { title: "pgvector", url: "https://github.com/pgvector/pgvector" },
    { title: "dup", url: "https://github.com/pgvector/pgvector" },
    { title: "bad", url: "javascript:alert(1)" },
  ],
};

describe("normalizeConversationImportSpec", () => {
  it("keeps valid content, pads table rows and drops bad links", () => {
    const spec = normalizeConversationImportSpec(RAW)!;
    expect(spec.chapters).toHaveLength(2);
    const table = spec.chapters[1]!.artifacts[0]!;
    expect(table.kind).toBe("table");
    if (table.kind === "table") expect(table.rows[1]).toEqual(["Pinecone", ""]);
    expect(spec.sources).toEqual([
      { title: "pgvector", url: "https://github.com/pgvector/pgvector" },
    ]);
  });

  it("skips malformed artifacts instead of failing", () => {
    const spec = normalizeConversationImportSpec({
      chapters: [
        {
          title: "Q",
          summary: "A",
          artifacts: [
            { kind: "stat", title: "no value" },
            { kind: "steps", title: "one step", steps: [{ label: "only" }] },
            { kind: "link", title: "x", url: "not a url" },
            { kind: "unknown" },
          ],
        },
      ],
    })!;
    expect(spec.chapters[0]!.artifacts).toEqual([]);
    expect(spec.title).toBe("Q");
  });

  it("returns null when there are no chapters, and caps runaway output", () => {
    expect(normalizeConversationImportSpec({ chapters: [] })).toBeNull();
    expect(normalizeConversationImportSpec("nope")).toBeNull();
    const many = normalizeConversationImportSpec({
      chapters: Array.from({ length: 40 }, (_, i) => ({ title: `Q${i}`, summary: "A" })),
    })!;
    expect(many.chapters).toHaveLength(MAX_CHAPTERS);
  });
});

describe("buildConversationImportCanvasSection", () => {
  const section = buildConversationImportCanvasSection(
    normalizeConversationImportSpec(RAW)!,
  );

  it("makes one chapter per question plus a 'where we left off' chapter", () => {
    expect(Object.keys(section.groups)).toHaveLength(3);
    const heads = section.cardOrder.filter((id) => !id.includes("-f"));
    expect(heads.map((id) => section.cards[id]!.question)).toEqual([
      "Do we need a dedicated vector DB?",
      "How do options compare?",
      "Where we left off",
    ]);
  });

  it("hangs follow-ups off their chapter on their own thread", () => {
    const followUp = section.cards["ci-c-1-f1"]!;
    expect(followUp.parentConversationId).toBe("ci-c-1");
    expect(followUp.threadId).not.toBe(section.cards["ci-c-1"]!.threadId);
    expect(section.threadGists[followUp.threadId]).toBeDefined();
  });

  it("spawns every artifact kind and positions every node", () => {
    const kinds = Object.values(section.sessionArtifacts)
      .map((a) => a.kind)
      .sort();
    expect(kinds).toEqual(
      ["claim", "definition", "linkgroup", "mechanism", "quote", "stat", "table", "todo", "todo", "website"].sort(),
    );
    const positions = section.canvasArtifactOrder.map(
      (id) => section.canvasArtifactNodes[id]!.position,
    );
    // Laid out by the chapter engine: no two artifacts share a spot.
    const keys = new Set(positions.map((p) => `${p.x},${p.y}`));
    expect(keys.size).toBe(positions.length);
  });
});

describe("a reply cut off mid-stream", () => {
  it("still yields the chapters that fully arrived", async () => {
    const { parsePartialJson } = await import("@/lib/llm/partialJson");
    const full = JSON.stringify(RAW);
    // Cut inside the second chapter's table, as a time-budget abort would.
    const cut = full.slice(0, full.indexOf("Pinecone") + 4);
    const spec = normalizeConversationImportSpec(parsePartialJson(cut))!;
    expect(spec.chapters[0]!.title).toBe("Do we need a dedicated vector DB?");
    expect(spec.chapters[0]!.artifacts.length).toBeGreaterThan(0);
    expect(spec.chapters).toHaveLength(2);
    expect(spec.openThreads).toEqual([]);
  });
});
