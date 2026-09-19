import Anthropic from "@anthropic-ai/sdk";
import { fromAnthropicUsage, recordUsage } from "@/lib/billing/ledger.server";
import { addGuestUsage } from "@/lib/billing/guest.server";
import { guestGate } from "@/lib/billing/guestRequest.server";
import { creditsFor } from "@/lib/billing/pricing";
import { getCurrentUser } from "@/lib/auth/currentUser.server";
import type { GroupTranscript } from "@/lib/buildGroupTranscript";

const MAX_TRANSCRIPT_CHARS = 100_000;

const SYSTEM_PROMPT = `You merge parallel inquiry threads from a spatial thinking canvas into one coherent markdown document.

Rules:
- Use clear headings (##, ###) to organize content.
- Preserve key facts, decisions, and conclusions from each thread.
- Deduplicate repeated points; note when different branches explored different angles.
- Attribute insights to their thread when branches diverged meaningfully.
- Output valid markdown only — no preamble or meta commentary outside the document.`;

const REFRESH_SYSTEM_PROMPT = `You update an existing markdown summary document with newly added conversation threads from a spatial thinking canvas.

Rules:
- Merge new threads and exchanges into the existing document structure.
- Do not duplicate content already covered in the existing document.
- Add new sections or subsections where branches diverged meaningfully.
- Preserve the tone and organization of the existing document where possible.
- Output the complete updated markdown document only — no preamble or meta commentary.`;

function formatTranscriptForPrompt(transcript: GroupTranscript): string {
  const parts: string[] = [];
  for (const family of transcript.families) {
    parts.push(`## Family: ${family.rootTitle}`);
    for (const thread of family.threads) {
      parts.push(`### Thread: ${thread.title}`);
      if (thread.branchedFrom) {
        parts.push(`(Branched from: ${thread.branchedFrom})`);
      }
      for (const ex of thread.exchanges) {
        parts.push(`**Q:** ${ex.question}`);
        parts.push(`**A:** ${ex.answer}`);
        parts.push("");
      }
    }
  }
  return parts.join("\n");
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY is not set in .env.local" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // The guest wall. This is the most expensive metered surface in the app —
  // Sonnet over up to 100k characters of transcript — and until now it was the
  // only one with no allowance check at all, so a guest past their limit on
  // /api/chat could still summarize freely.
  const user = await getCurrentUser();
  const guest = await guestGate({
    req,
    signedIn: Boolean(user),
    surface: "summarize",
  });
  if (guest.blocked) return guest.blocked;

  const { model, transcript, mode, existingMarkdown } = await req.json();

  const isRefresh = mode === "refresh";

  if (!transcript?.families?.length) {
    return new Response(
      JSON.stringify({ error: "No transcript content provided" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (isRefresh) {
    if (
      !existingMarkdown ||
      typeof existingMarkdown !== "string" ||
      !existingMarkdown.trim()
    ) {
      return new Response(
        JSON.stringify({ error: "existingMarkdown is required for refresh mode" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  let body = formatTranscriptForPrompt(transcript as GroupTranscript);
  let truncated = false;
  if (body.length > MAX_TRANSCRIPT_CHARS) {
    body =
      body.slice(0, MAX_TRANSCRIPT_CHARS) +
      "\n\n[Note: older exchanges were truncated due to length limits.]";
    truncated = true;
  }

  const anthropic = new Anthropic({ apiKey });

  const userContent = isRefresh
    ? truncated
      ? `Update the following summary document with the new conversation threads below. Some new content was truncated.\n\n## Existing document\n\n${existingMarkdown}\n\n## New threads\n\n${body}`
      : `Update the following summary document with the new conversation threads below.\n\n## Existing document\n\n${existingMarkdown}\n\n## New threads\n\n${body}`
    : truncated
      ? `Summarize the following conversation threads. Some older content was truncated.\n\n${body}`
      : `Summarize the following conversation threads into one markdown document.\n\n${body}`;

  try {
    const message = await anthropic.messages.create({
      model: model ?? "claude-sonnet-4-6",
      max_tokens: 4096,
      system: isRefresh ? REFRESH_SYSTEM_PROMPT : SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
    });

    const usedModel = model ?? "claude-sonnet-4-6";
    const usage = fromAnthropicUsage(message.usage);

    recordUsage({
      ownerId: user?.id ?? null,
      visitorId: guest.visitorId,
      surface: "summarize",
      provider: "anthropic",
      model: usedModel,
      ...usage,
      outcome: "success",
    });

    // Guests: add real spend to the lifetime counter the wall reads, so a
    // summarize actually counts against the allowance instead of being free.
    if (!user && guest.visitorId) {
      void addGuestUsage({
        visitorId: guest.visitorId,
        ipHash: guest.ipHash,
        credits: creditsFor({ model: usedModel, ...usage }),
      });
    }

    const textBlock = message.content.find((b) => b.type === "text");
    const markdown =
      textBlock && textBlock.type === "text" ? textBlock.text : "";

    if (!markdown.trim()) {
      return new Response(
        JSON.stringify({ error: "Model returned empty summary" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ markdown }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    let msg = err instanceof Error ? err.message : "Unknown error";
    try {
      const inner = JSON.parse(msg);
      if (inner?.error?.message) msg = inner.error.message;
    } catch {
      // not JSON
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
