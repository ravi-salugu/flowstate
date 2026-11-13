/*
 * ConversationImportSpec — the intermediate shape between an uploaded chat
 * export (or transcript) and a canvas.
 *
 * The LLM returns this; code validates it; buildConversationImportCanvasSection
 * turns it into nodes. Keeping the model's job to "fill this shape" and the
 * geometry entirely in code is what lets a model reply that is long, short or
 * slightly malformed still produce a canvas laid out like the hand-built ones.
 *
 * The shape mirrors the Flowstate Continue v1 Markdown format one-to-one
 * (docs/continue-on-flowstate/consolidation-prompt-and-format.md).
 */

export type ImportArtifactSpec =
  | { kind: "table"; title: string; columns: string[]; rows: string[][] }
  | { kind: "stat"; title: string; value: string; label: string; source?: string }
  | { kind: "quote"; title: string; text: string; speaker: string; context?: string }
  | { kind: "steps"; title: string; steps: { label: string; note?: string }[] }
  | { kind: "term"; title: string; term: string; definition: string }
  | {
      kind: "debate";
      title: string;
      topic: string;
      forSide: { speaker: string; text: string };
      againstSide: { speaker: string; text: string };
    }
  | { kind: "link"; title: string; url: string };

export interface ImportFollowUpSpec {
  title: string;
  summary: string;
}

export interface ImportChapterSpec {
  title: string;
  summary: string;
  followUps: ImportFollowUpSpec[];
  artifacts: ImportArtifactSpec[];
}

export interface ConversationImportSpec {
  title: string;
  summary: string;
  chapters: ImportChapterSpec[];
  openThreads: string[];
  decisions: string[];
  sources: { title: string; url: string }[];
}

/* Limits — a canvas is for reading, and a runaway reply must not become a 400-node board. */
export const MAX_CHAPTERS = 12;
export const MAX_FOLLOW_UPS = 4;
export const MAX_ARTIFACTS_PER_CHAPTER = 8;
export const MAX_TABLE_ROWS = 30;
export const MAX_TABLE_COLUMNS = 8;
export const MAX_STEPS = 7;
export const MAX_LIST_ITEMS = 12;
export const MAX_SOURCES = 20;

function str(value: unknown, max = 2000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeArtifact(raw: unknown): ImportArtifactSpec | null {
  const a = obj(raw);
  const kind = str(a.kind, 20);
  const title = str(a.title, 120);
  switch (kind) {
    case "table": {
      const columns = arr(a.columns)
        .map((c) => str(c, 80))
        .filter(Boolean)
        .slice(0, MAX_TABLE_COLUMNS);
      if (columns.length === 0) return null;
      const rows = arr(a.rows)
        .map((row) => {
          const cells = arr(row).map((cell) => str(cell, 400));
          // Pad or trim to the header so every row lines up.
          return columns.map((_, i) => cells[i] ?? "");
        })
        .filter((cells) => cells.some(Boolean))
        .slice(0, MAX_TABLE_ROWS);
      if (rows.length === 0) return null;
      return { kind, title: title || "Table", columns, rows };
    }
    case "stat": {
      const value = str(a.value, 40);
      const label = str(a.label, 300);
      if (!value || !label) return null;
      const source = str(a.source, 200);
      return { kind, title: title || label.slice(0, 60), value, label, ...(source ? { source } : {}) };
    }
    case "quote": {
      const text = str(a.text, 400);
      if (!text) return null;
      const context = str(a.context, 200);
      return {
        kind,
        title: title || "Quote",
        text,
        speaker: str(a.speaker, 80) || "Unknown",
        ...(context ? { context } : {}),
      };
    }
    case "steps": {
      const steps = arr(a.steps)
        .map((s) => {
          const step = obj(s);
          const label = str(step.label, 120);
          const note = str(step.note, 200);
          return label ? { label, ...(note ? { note } : {}) } : null;
        })
        .filter((s): s is { label: string; note?: string } => s !== null)
        .slice(0, MAX_STEPS);
      if (steps.length < 2) return null;
      return { kind, title: title || "Steps", steps };
    }
    case "term": {
      const term = str(a.term, 80) || title;
      const definition = str(a.definition, 400);
      if (!term || !definition) return null;
      return { kind, title: title || term, term, definition };
    }
    case "debate": {
      const forSide = obj(a.forSide);
      const againstSide = obj(a.againstSide);
      const forText = str(forSide.text, 400);
      const againstText = str(againstSide.text, 400);
      if (!forText || !againstText) return null;
      const topic = str(a.topic, 200) || title;
      return {
        kind,
        title: title || topic,
        topic,
        forSide: { speaker: str(forSide.speaker, 80) || "For", text: forText },
        againstSide: {
          speaker: str(againstSide.speaker, 80) || "Against",
          text: againstText,
        },
      };
    }
    case "link": {
      const url = str(a.url, 500);
      if (!isHttpUrl(url)) return null;
      return { kind, title: title || new URL(url).hostname, url };
    }
    default:
      return null;
  }
}

function normalizeList(value: unknown): string[] {
  return arr(value)
    .map((item) => str(item, 300))
    .filter(Boolean)
    .slice(0, MAX_LIST_ITEMS);
}

/**
 * Validate and clamp an untrusted spec (model output). Unknown fields are
 * dropped, malformed artifacts are skipped rather than failing the import, and
 * every list is capped. Returns null only when nothing usable is left.
 */
export function normalizeConversationImportSpec(
  raw: unknown,
): ConversationImportSpec | null {
  const s = obj(raw);
  const chapters = arr(s.chapters)
    .map((c): ImportChapterSpec | null => {
      const ch = obj(c);
      const title = str(ch.title, 160);
      const summary = str(ch.summary, 1500);
      if (!title && !summary) return null;
      return {
        title: title || summary.slice(0, 80),
        summary,
        followUps: arr(ch.followUps)
          .map((f) => {
            const fu = obj(f);
            const t = str(fu.title, 160);
            const sm = str(fu.summary, 1000);
            return t ? { title: t, summary: sm } : null;
          })
          .filter((f): f is ImportFollowUpSpec => f !== null)
          .slice(0, MAX_FOLLOW_UPS),
        artifacts: arr(ch.artifacts)
          .map(normalizeArtifact)
          .filter((a): a is ImportArtifactSpec => a !== null)
          .slice(0, MAX_ARTIFACTS_PER_CHAPTER),
      };
    })
    .filter((c): c is ImportChapterSpec => c !== null)
    .slice(0, MAX_CHAPTERS);

  if (chapters.length === 0) return null;

  const seen = new Set<string>();
  const sources = arr(s.sources)
    .map((src) => {
      const o = obj(src);
      const url = str(o.url, 500);
      if (!isHttpUrl(url) || seen.has(url)) return null;
      seen.add(url);
      return { title: str(o.title, 120) || new URL(url).hostname, url };
    })
    .filter((x): x is { title: string; url: string } => x !== null)
    .slice(0, MAX_SOURCES);

  return {
    title: str(s.title, 120) || chapters[0]!.title,
    summary: str(s.summary, 1000),
    chapters,
    openThreads: normalizeList(s.openThreads),
    decisions: normalizeList(s.decisions),
    sources,
  };
}
