# Continue on Flowstate — consolidation prompt and Markdown format

## Plan

1. **Consolidate, on the user's own plan.** The user pastes the prompt below into the long Claude or ChatGPT chat. Their own subscription pays for this step, and that is fully within both vendors' terms, because the model runs inside their own app. Out comes one Markdown file in the *Flowstate Continue v1* format.
2. **Upload.** The user drops the `.md` file (or any transcript or free-form Markdown) into Flowstate. There are three ways in:
   - **Home → Import a chat** (signed-in users): opens the import as a **new canvas**.
   - **Canvas → Add → Import a chat** (every user, guests included, within their allowance): adds the import to the **open canvas** in its own section, to the right of everything already there. It gets fresh ids, so it never overlaps or collides with existing work, even when the same file is imported twice. The view then frames the new section, and Undo removes it.
   - **Admin playground** `/admin/ideas/conversation-to-flowstate-transfer/playground` → **Import .md**, unchanged and still admin-only.
3. **Map.** One LLM call (`POST /api/conversation-import` for users, `/api/admin/conversation-import` for the playground; both run `lib/conversationImport/runImport.server.ts`) turns the file into a `ConversationImportSpec`, a small JSON shape (`lib/conversationImport/spec.ts`). The call is streamed and capped at 150 s, safely under Vercel's 180 s limit. If a long file runs out of time, the chapters that arrived are still built, and the user is told the end may be missing. That call is metered on Flowstate credits (guests: their allowance) until a connected ChatGPT plan is possible (see `feasibility-subscription-billing.md`). The spec is validated and clamped in code, so a bad model reply cannot produce a broken canvas.
4. **Build.** `buildConversationImportCanvasSection(spec)` uses the same helpers as the hand-built transcript canvases (`convCard`, `spawnPayload`, `layoutChapters`). The result gets the same chapter layout, justified artifact rows and conversation cards.
5. **Keep researching.** Every card is a real conversation card with a thread gist, so asking a follow-up on any card works the same as on a canvas the user built.

Later steps, not built yet: add a deterministic parser for files that carry the `flowstate-continue v1` marker, so a well-formed export costs no credits; add a remote MCP connector so users can send the file from claude.ai directly.

## How the format maps onto the canvas

| Markdown | Canvas |
|---|---|
| `# Title` | Canvas title |
| `> summary` under the title | Main-thread gist (canvas memory) |
| `## Q: …` + answer paragraph | Chapter: a conversation card heads it (question → title, answer → body) |
| `### Follow-up: …` + answer | Branch card under that chapter, on its own thread |
| `### Table: …` + a Markdown table | Table artifact |
| `### Data: …` with `value:` / `context:` / `source:` | Stat artifact |
| `### Quote: …` with `> text` and `— speaker` | Quote artifact |
| `### Steps: …` with a numbered list | Mechanism (chain) artifact |
| `### Term: …` + definition | Definition artifact |
| `### Debate: …` with `- For:` / `- Against:` | Claim artifact (proposition versus counter) |
| `### Sources` under a question | Website artifacts in that chapter |
| `## Open threads` / `## Decisions` | Final chapter "Where we left off", with two to-do artifacts (open threads unchecked, decisions checked) |
| `## Sources` (end) | Link directory in the masthead |

These rules keep the mapping lossless: one `##` is one chapter, one `###` is one node, and every artifact block says its kind in its heading.

## The prompt (paste into the chat)

```text
Consolidate our entire conversation above into ONE Markdown document I can import into Flowstate. Follow this format exactly. Use only what we actually discussed. Do not invent facts, numbers, quotes or links. If a section has nothing, leave it out.

<!-- flowstate-continue v1 -->
# <Short topic title>

> <2–3 sentence summary of what this conversation was about and where it ended up>

## Q: <a key question I asked, in my words>
<The answer we reached, 2–5 sentences. Keep the specifics.>

### Follow-up: <a follow-up question on this>
<Its answer, 1–3 sentences.>

### Table: <title>
| Column | Column |
|---|---|
| … | … |

### Data: <what the number measures>
- value: <the figure, e.g. 29% or $4.2M>
- context: <one line>
- source: <where it came from, if known>

### Quote: <short title>
> <exact words, max 35 words>
— <who said it: me, you, or a named source>

### Steps: <name of the process or causal chain>
1. <step> — <optional note>
2. <step>

### Term: <term>
<one-sentence definition>

### Debate: <the question in dispute>
- For: <one side, with who holds it>
- Against: <the other side>

### Sources
- [<title>](<url>) — <why it mattered>

(Repeat "## Q:" for each major question, in the order we discussed them. Use 3–10 of them. Put each table, number, quote, process, term, debate and source under the question it belongs to.)

## Open threads
- [ ] <a question we left unanswered or want to dig into next>

## Decisions
- [x] <something we decided or concluded>

## Sources
- [<title>](<url>)

Output ONLY the Markdown document, in one code block, so I can copy it into a file named <topic>.md.
```

A sample file in this format is at `docs/continue-on-flowstate/sample-export.md`.
