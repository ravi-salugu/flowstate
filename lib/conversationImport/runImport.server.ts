import Anthropic from "@anthropic-ai/sdk";
import { guardCredits } from "@/lib/billing/guard.server";
import { addGuestUsage } from "@/lib/billing/guest.server";
import { fromAnthropicUsage, recordUsage } from "@/lib/billing/ledger.server";
import { creditsFor, estimateCredits } from "@/lib/billing/pricing";
import {
  IMPORT_SYSTEM_PROMPT,
  IMPORT_TOOL_NAME,
  IMPORT_TOOL_SCHEMA,
  MAX_IMPORT_CHARS,
} from "@/lib/conversationImport/llmPrompt";
import { normalizeConversationImportSpec } from "@/lib/conversationImport/spec";
import { parsePartialJson } from "@/lib/llm/partialJson";
import { DEFAULT_MODEL_ID } from "@/lib/models";

/*
 * The "Continue on Flowstate" import, shared by the public route
 * (/api/conversation-import) and the admin playground route.
 *
 * One LLM call turns an uploaded chat export / transcript into a
 * ConversationImportSpec; the client builds the canvas from it with the same
 * chapter engine as the hand-made transcript canvases.
 */

const MAX_TOKENS = 12_000;
/**
 * Wall-clock budget for the model call. Under the route's maxDuration (180s)
 * with room to respond: a long file used to run the full 12k-token budget
 * (~3.5 min), overrun the function limit, and fail outright. Now the call is
 * streamed and cut off here, and whatever arrived is still built.
 */
const MODEL_TIME_BUDGET_MS = 150_000;
const CHARS_PER_OUTPUT_TOKEN = 4;

/**
 * Who pays for the import call.
 *
 * Always Flowstate's metered key today. Billing a user's own ChatGPT plan
 * needs OpenAI's "Sign in with ChatGPT" partner approval, and billing a
 * Claude plan is not permitted at all — see
 * docs/continue-on-flowstate/feasibility-subscription-billing.md. When a
 * ChatGPT connection exists this returns `{ kind: "user_plan" }`, and the
 * import skips guardCredits and recordUsage for that call.
 */
function resolveImportBilling(): { kind: "metered" } {
  return { kind: "metered" };
}

export interface ImportCaller {
  /** Billing owner for a signed-in caller; null for a guest. */
  ownerId: string | null;
  email: string | null;
  /** Guest identity, already past the guest wall. */
  visitorId?: string | null;
  ipHash?: string | null;
}

export async function runConversationImport(
  req: Request,
  caller: ImportCaller,
): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not set in .env.local" },
      { status: 500 },
    );
  }

  let body: { text?: unknown; fileName?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const fileName =
    typeof body.fileName === "string" ? body.fileName.slice(0, 200) : "";
  if (!text) {
    return Response.json({ error: "The file is empty." }, { status: 400 });
  }
  if (text.length > MAX_IMPORT_CHARS) {
    return Response.json(
      {
        error: `That file is ${Math.round(text.length / 1000)}k characters; the limit is ${MAX_IMPORT_CHARS / 1000}k. Consolidate it with the Flowstate prompt first.`,
      },
      { status: 413 },
    );
  }

  const billing = resolveImportBilling();
  const model = DEFAULT_MODEL_ID;
  const { ownerId, email } = caller;

  if (billing.kind === "metered") {
    const guard = await guardCredits({
      ownerId,
      email,
      surface: "conversation-import",
      estimate: estimateCredits({
        model,
        promptChars: text.length + IMPORT_SYSTEM_PROMPT.length,
        maxTokens: MAX_TOKENS,
      }),
    });
    if (!guard.ok) return guard.response;
  }

  const anthropic = new Anthropic({ apiKey });
  const started = Date.now();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), MODEL_TIME_BUDGET_MS);
  let toolJson = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason: string | null = null;
  let timedOut = false;
  try {
    // Streamed so a long reply can be stopped at the time budget and its
    // partial tool input still parsed (lib/llm/partialJson).
    const stream = anthropic.messages.stream(
      {
        model,
        max_tokens: MAX_TOKENS,
        system: IMPORT_SYSTEM_PROMPT,
        tools: [
          {
            name: IMPORT_TOOL_NAME,
            description:
              "Create the research canvas structure from the conversation.",
            input_schema: IMPORT_TOOL_SCHEMA,
          },
        ],
        tool_choice: { type: "tool", name: IMPORT_TOOL_NAME },
        messages: [
          {
            role: "user",
            content: `File: ${fileName || "upload.md"}\n\n<document>\n${text}\n</document>`,
          },
        ],
      },
      { signal: abort.signal },
    );
    try {
      for await (const event of stream) {
        if (event.type === "message_start") {
          inputTokens = event.message.usage.input_tokens;
        } else if (
          event.type === "content_block_delta" &&
          event.delta.type === "input_json_delta"
        ) {
          toolJson += event.delta.partial_json;
        } else if (event.type === "message_delta") {
          stopReason = event.delta.stop_reason;
          outputTokens = event.usage.output_tokens;
        }
      }
    } catch (error) {
      if (!abort.signal.aborted || !toolJson) throw error;
      timedOut = true;
    }
    clearTimeout(timer);
    if (timedOut || !outputTokens) {
      // No final usage event: bill what was actually streamed.
      outputTokens = Math.ceil(toolJson.length / CHARS_PER_OUTPUT_TOKEN);
    }
    const message = {
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      stop_reason: timedOut ? "timeout" : stopReason,
    };

    if (billing.kind === "metered") {
      const usage = fromAnthropicUsage(message.usage);
      recordUsage({
        ownerId,
        visitorId: caller.visitorId ?? null,
        surface: "conversation-import",
        provider: "anthropic",
        model,
        ...usage,
        outcome: "success",
        durationMs: Date.now() - started,
      });
      // Guests: real spend counts against the allowance the wall reads.
      if (!ownerId && caller.visitorId) {
        void addGuestUsage({
          visitorId: caller.visitorId,
          ipHash: caller.ipHash ?? null,
          credits: creditsFor({ model, ...usage }),
        });
      }
    }

    const truncated =
      message.stop_reason === "max_tokens" || message.stop_reason === "timeout";
    const spec = normalizeConversationImportSpec(parsePartialJson(toolJson));
    if (!spec) {
      return Response.json(
        {
          error: truncated
            ? "That file is too long to import in one go. Consolidate the chat with the Flowstate prompt first, then upload the result."
            : "Couldn't find any questions or answers in that file.",
        },
        { status: 422 },
      );
    }
    return Response.json({ spec, billing: billing.kind, truncated });
  } catch (error) {
    clearTimeout(timer);
    if (billing.kind === "metered") {
      recordUsage({
        ownerId,
        visitorId: caller.visitorId ?? null,
        surface: "conversation-import",
        provider: "anthropic",
        model,
        inputTokens: 0,
        outputTokens: 0,
        outcome: "error",
        durationMs: Date.now() - started,
      });
    }
    console.error("[conversation-import] failed", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Import failed." },
      { status: 502 },
    );
  }
}
