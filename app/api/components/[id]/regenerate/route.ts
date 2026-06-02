import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

/**
 * R6c — POST /api/components/:id/regenerate
 *
 * Non-streaming Claude call with pre-built ancestor context. The client
 * (V2ConnectDropManager) is responsible for:
 *   - serializing source-component payloads into context chunks via
 *     KindRegistry.serializeForContext
 *   - looking up the target's existing prompt (the chat card's question)
 *   - calling this route with both
 *
 * On success: returns { answer: string, modelId: string }.
 * The client writes `answer` back into the target's v1 Card via updateCard.
 *
 * Why not streaming? R6c trades streaming feedback for simplicity. R7 can
 * promote to SSE if the user wants live tokens during regen.
 */

const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;

interface ContextChunk {
  mimeType: string;
  text?: string;
  url?: string;
  dataUri?: string;
  caption?: string;
}

interface RegenerateBody {
  prompt: string;
  contextChunks: ContextChunk[];
  modelId?: string;
}

function chunksToAnthropicBlocks(
  chunks: ContextChunk[],
): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const c of chunks) {
    if (c.text) {
      blocks.push({ type: "text", text: c.text });
    } else if (c.url && c.mimeType.startsWith("image/")) {
      blocks.push({
        type: "image",
        source: { type: "url", url: c.url },
      });
    } else if (c.dataUri && c.mimeType.startsWith("image/")) {
      const match = c.dataUri.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: match[1] as Anthropic.Base64ImageSource["media_type"],
            data: match[2],
          },
        });
      }
    }
  }
  return blocks;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  await params; // id reserved for future provenance logging (e.g. server-side v2 version write)

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 500 },
    );
  }

  let body: RegenerateBody;
  try {
    body = (await request.json()) as RegenerateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.prompt || typeof body.prompt !== "string") {
    return NextResponse.json(
      { error: "Missing `prompt` in body" },
      { status: 400 },
    );
  }

  const modelId = body.modelId ?? DEFAULT_MODEL;
  const contextBlocks = chunksToAnthropicBlocks(body.contextChunks ?? []);

  const userContent: Anthropic.ContentBlockParam[] = [
    ...contextBlocks,
    { type: "text", text: body.prompt },
  ];

  const system =
    "You are a helpful research assistant on a multi-thread visual canvas. " +
    "Earlier components on the canvas may be provided as context above the " +
    "user's prompt. Answer concisely and in markdown.";

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: modelId,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: userContent }],
    });

    const answer = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n\n");

    return NextResponse.json({ answer, modelId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
