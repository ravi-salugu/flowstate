/*
 * The one LLM call in an import: read an uploaded chat export or transcript,
 * fill a ConversationImportSpec. Forced tool use, so the reply is always a
 * JSON object; normalizeConversationImportSpec then validates it.
 */

export const MAX_IMPORT_CHARS = 150_000;

export const IMPORT_TOOL_NAME = "build_canvas";

export const IMPORT_SYSTEM_PROMPT = `You turn a long AI-chat export or a transcript into the structure of a research canvas.

The input is usually a Markdown file in the "Flowstate Continue v1" format (headings "## Q:", "### Follow-up:", "### Table:", "### Data:", "### Quote:", "### Steps:", "### Term:", "### Debate:", "### Sources", "## Open threads", "## Decisions", "## Sources"). Map it one-to-one:
- each "## Q:" section → one chapter (title = the question, summary = its answer)
- "### Follow-up:" → followUps on that chapter
- "### Table:" → artifact kind "table" (columns + rows of cell strings)
- "### Data:" → kind "stat" (value = the figure, label = what it measures, source if given)
- "### Quote:" → kind "quote" (verbatim text, speaker)
- "### Steps:" → kind "steps" (2–7 steps, each label + optional note)
- "### Term:" → kind "term"
- "### Debate:" → kind "debate" (forSide / againstSide with speaker + text)
- links under a question's "### Sources" → kind "link"
- "## Open threads" → openThreads, "## Decisions" → decisions, final "## Sources" → sources

If the input is NOT in that format (a raw transcript, free-form notes, a pasted chat), infer the same structure: 3–10 chapters in discussion order, each a key question with the answer reached, plus the tables, figures, quotes, processes, terms, disagreements and links that actually appear.

Rules:
- Use only content present in the input. Never invent numbers, quotes, sources or URLs.
- Quotes must be verbatim and at most 35 words.
- Keep summaries specific (2–5 sentences for chapters, 1–3 for follow-ups).
- Put every artifact under the chapter it belongs to.
- Stay compact so a long chat still fits: at most 10 chapters, 6 artifacts per chapter, 12 rows per table. Prefer the most decision-relevant material over completeness.
- Fill fields in schema order (title, summary, chapters in discussion order, then openThreads, decisions, sources).
- Call the ${IMPORT_TOOL_NAME} tool exactly once.`;

const sideSchema = {
  type: "object",
  properties: { speaker: { type: "string" }, text: { type: "string" } },
  required: ["speaker", "text"],
};

export const IMPORT_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    title: { type: "string", description: "Short canvas title" },
    summary: { type: "string", description: "2–3 sentence overview" },
    chapters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          followUps: {
            type: "array",
            items: {
              type: "object",
              properties: { title: { type: "string" }, summary: { type: "string" } },
              required: ["title", "summary"],
            },
          },
          artifacts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                kind: {
                  type: "string",
                  enum: ["table", "stat", "quote", "steps", "term", "debate", "link"],
                },
                title: { type: "string" },
                columns: { type: "array", items: { type: "string" } },
                rows: { type: "array", items: { type: "array", items: { type: "string" } } },
                value: { type: "string" },
                label: { type: "string" },
                source: { type: "string" },
                text: { type: "string" },
                speaker: { type: "string" },
                context: { type: "string" },
                steps: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { label: { type: "string" }, note: { type: "string" } },
                    required: ["label"],
                  },
                },
                term: { type: "string" },
                definition: { type: "string" },
                topic: { type: "string" },
                forSide: sideSchema,
                againstSide: sideSchema,
                url: { type: "string" },
              },
              required: ["kind", "title"],
            },
          },
        },
        required: ["title", "summary", "followUps", "artifacts"],
      },
    },
    openThreads: { type: "array", items: { type: "string" } },
    decisions: { type: "array", items: { type: "string" } },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, url: { type: "string" } },
        required: ["title", "url"],
      },
    },
  },
  required: ["title", "summary", "chapters", "openThreads", "decisions", "sources"],
};
