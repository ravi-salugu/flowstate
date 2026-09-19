import Anthropic from "@anthropic-ai/sdk";
import { fromAnthropicUsage, recordUsage } from "@/lib/billing/ledger.server";
import { addGuestUsage } from "@/lib/billing/guest.server";
import { guestGate } from "@/lib/billing/guestRequest.server";
import { creditsFor } from "@/lib/billing/pricing";
import { getCurrentUser } from "@/lib/auth/currentUser.server";

// Rolling per-thread gist: given the previous gist and only the latest
// exchange, produce an updated 1-2 sentence summary. Never re-reads the whole
// branch, so cost stays flat as threads grow.
const GIST_MODEL = "claude-haiku-4-5";
const MAX_QUESTION_CHARS = 600;
const MAX_ANSWER_CHARS = 1500;
const MAX_PREVIOUS_GIST_CHARS = 600;

const SYSTEM_PROMPT = `You maintain a running one-to-two sentence summary ("gist") of one conversation branch on a spatial canvas.

Rules:
- Maximum 40 words. Plain text only — no markdown, no preamble.
- Third person, present tense (e.g. "Comparing Stripe vs Paddle for billing; leaning Paddle.").
- Capture the topic plus any decisions, conclusions, or stated preferences.
- Fold the new exchange into the previous gist; keep what is still relevant, drop what is superseded.
- Output only the gist text.`;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 500 },
    );
  }

  // Unlike every other metered surface, a spent allowance here returns a
  // normal 200 with no gist — NEVER a 402. The gist fires automatically after
  // an answer lands; the visitor did not ask for it, so raising the sign-in
  // wall would be baffling, and it would fire at a moment they are not even
  // looking at. Skipping costs them a slightly staler branch summary and
  // nothing else.
  const user = await getCurrentUser();
  const guest = await guestGate({ req, signedIn: Boolean(user), surface: "gist" });
  if (guest.blocked) return Response.json({ gist: null });

  const { previousGist, threadTitle, question, answer } = (await req.json()) as {
    previousGist?: string;
    threadTitle?: string;
    question?: string;
    answer?: string;
  };

  if (typeof question !== "string" || !question.trim()) {
    return Response.json({ error: "question is required" }, { status: 400 });
  }

  const clip = (text: string, max: number) =>
    text.length > max ? `${text.slice(0, max)}…` : text;

  const parts: string[] = [];
  if (typeof threadTitle === "string" && threadTitle.trim()) {
    parts.push(`Branch title: ${clip(threadTitle.trim(), 120)}`);
  }
  if (typeof previousGist === "string" && previousGist.trim()) {
    parts.push(
      `Previous gist: ${clip(previousGist.trim(), MAX_PREVIOUS_GIST_CHARS)}`,
    );
  }
  parts.push(`Latest question: ${clip(question.trim(), MAX_QUESTION_CHARS)}`);
  if (typeof answer === "string" && answer.trim()) {
    parts.push(`Latest answer: ${clip(answer.trim(), MAX_ANSWER_CHARS)}`);
  }

  const anthropic = new Anthropic({ apiKey });

  try {
    const message = await anthropic.messages.create({
      model: GIST_MODEL,
      max_tokens: 120,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: parts.join("\n\n") }],
    });

    const usage = fromAnthropicUsage(message.usage);

    recordUsage({
      ownerId: user?.id ?? null,
      visitorId: guest.visitorId,
      surface: "gist",
      provider: "anthropic",
      model: GIST_MODEL,
      ...usage,
      outcome: "success",
    });

    if (!user && guest.visitorId) {
      void addGuestUsage({
        visitorId: guest.visitorId,
        ipHash: guest.ipHash,
        credits: creditsFor({ model: GIST_MODEL, ...usage }),
      });
    }

    const textBlock = message.content.find((b) => b.type === "text");
    const gist =
      textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";

    if (!gist) {
      return Response.json({ error: "Model returned empty gist" }, { status: 500 });
    }

    return Response.json({ gist });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
