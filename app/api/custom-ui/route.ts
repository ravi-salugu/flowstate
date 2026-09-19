import "@/lib/cursorSdk/polyfillDisposeSymbols";
import {
  customEditAckText,
  htmlImportAckText,
  tryImportAttachedHtmlAsCustom,
  trySimpleCustomEdit,
  type CustomArtifactPayload,
} from "@/lib/customArtifactShortcuts";
import {
  isCustomUiWork,
  resolveInitialThinkingLabel,
  stripAppendedQuestionContext,
} from "@/lib/artifactIntent";
import { sanitizeCustomUiSource } from "@/lib/customUiSource";
import { streamCustomUiViaAnthropic } from "@/lib/customUiAnthropicStream";
import { runCustomUiGenerator } from "@/lib/cursorSdk/customUiGenerator";
import { recordUsage } from "@/lib/billing/ledger.server";
import { addGuestUsage } from "@/lib/billing/guest.server";
import { guestGate } from "@/lib/billing/guestRequest.server";
import { creditsFor } from "@/lib/billing/pricing";
import { getCurrentUser } from "@/lib/auth/currentUser.server";
import { getCursorSdkRuntimeIssue } from "@/lib/cursorSdk/runtimeCheck";
import { initialSdkBuildStages } from "@/lib/cursorSdk/sdkStageLabels";
import {
  CUSTOM_UI_TURN_TIMEOUT_MS,
  QA_TURN_TIMEOUT_ENABLED,
} from "@/lib/qaTurnLimits";

/** Vercel Hobby/Pro cap (Next.js requires a literal). */
export const maxDuration = 300;

interface IncomingFile {
  name: string;
  type: string;
  data: string;
  turnLabel?: string;
}

interface HistoryMessage {
  question: string;
  answer: string;
}

function mapIncomingFiles(files?: IncomingFile[]) {
  return (files ?? []).map((file) => ({
    name: file.name,
    mimeType: file.type,
    base64: file.data,
    turnLabel: file.turnLabel,
  }));
}

function canUseAnthropicFallback(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function shouldSkipCursorSdk(): boolean {
  if (process.env.CUSTOM_UI_SDK_FORCE_CHAT === "true") return true;
  const issue = getCursorSdkRuntimeIssue();
  if (!issue) return false;
  // Missing Cursor key but Anthropic available — skip straight to Claude.
  if (issue.code === "missing_api_key" && canUseAnthropicFallback()) return true;
  // Unsupported Node or missing platform package — Claude fallback is safer.
  if (
    (issue.code === "node_version" || issue.code === "missing_platform_package") &&
    canUseAnthropicFallback()
  ) {
    return true;
  }
  return false;
}

export async function POST(req: Request) {
  // The guest wall. claudeClient routes custom-UI work here instead of
  // /api/chat, so without this a guest could dodge the allowance entirely by
  // phrasing questions as build requests — on the most expensive path there is.
  const user = await getCurrentUser();
  const guest = await guestGate({
    req,
    signedIn: Boolean(user),
    surface: "custom-ui",
  });
  if (guest.blocked) return guest.blocked;

  const body = (await req.json()) as {
    question: string;
    history?: HistoryMessage[];
    files?: IncomingFile[];
    editingArtifact?: { artifactId: string; payload: unknown };
    model?: string;
    /** MCP tool output handed over by build_custom_ui in a preceding chat turn. */
    sourceData?: unknown;
  };

  const { question, history: rawHistory = [], files, editingArtifact, model } = body;
  const sourceData = sanitizeCustomUiSource(body.sourceData);
  const attachmentFiles = mapIncomingFiles(files);
  const intentQuestion = stripAppendedQuestionContext(question);
  const editingPayload =
    editingArtifact?.payload &&
    typeof editingArtifact.payload === "object" &&
    "type" in (editingArtifact.payload as object)
      ? (editingArtifact.payload as { type?: string })
      : null;

  // A handoff carries its own intent: the question is machine-authored and
  // need not contain the keywords isCustomUiWork looks for.
  if (!sourceData && !isCustomUiWork(intentQuestion, editingPayload)) {
    return Response.json({ error: "Not a custom UI request." }, { status: 400 });
  }

  const skipSdk = shouldSkipCursorSdk();
  if (!skipSdk && !process.env.CURSOR_API_KEY?.trim()) {
    if (!canUseAnthropicFallback()) {
      return Response.json(
        { error: "CURSOR_API_KEY is not configured" },
        { status: 500 },
      );
    }
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let closed = false;
      // Metering state. custom-ui has two cost profiles under one surface:
      // a Cursor composer run (flat, no usage reported by the SDK) and an
      // Anthropic fallback (real tokens). `provider` keeps them separable.
      let billedProvider: "cursor" | "anthropic" | null = null;
      let billedModel: string | null = null;
      let billedUsage = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      };
      let cursorRuns = 0;
      const emit = (data: object) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      const closeStream = () => {
        if (closed) return;
        closed = true;
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      };

      const hardTimeout =
        QA_TURN_TIMEOUT_ENABLED && CUSTOM_UI_TURN_TIMEOUT_MS > 0
          ? setTimeout(() => {
              emit({ error: "Request timed out." });
              closeStream();
            }, CUSTOM_UI_TURN_TIMEOUT_MS)
          : null;

      const runAnthropicFallback = async (note?: string) => {
        if (note) {
          emit({ thinking: note });
        }
        emit({ pendingArtifact: { type: "custom" } });
        emit({ responseType: "custom" });
        const fallback = await streamCustomUiViaAnthropic({
          question,
          history: rawHistory,
          files: attachmentFiles,
          editingArtifact,
          sourceData,
          model,
          emit,
          signal: req.signal,
        });
        billedProvider = "anthropic";
        billedModel = fallback.modelUsed ?? null;
        if (fallback.usage) billedUsage = fallback.usage;

        if (fallback.artifact) {
          emit({ text: fallback.assistantText });
        } else if (fallback.error) {
          emit({ error: fallback.error });
        } else {
          emit({
            error:
              "Custom UI was not saved — no valid artifact was emitted. Try again.",
          });
        }
      };

      try {
        const fastCustom = (() => {
          if (editingPayload?.type === "custom" && editingArtifact?.payload) {
            const patched = trySimpleCustomEdit(
              editingArtifact.payload as CustomArtifactPayload,
              question,
            );
            if (patched) {
              return {
                artifact: patched,
                text: customEditAckText(question),
                thinking: "Applying theme…",
              };
            }
          }
          const imported = tryImportAttachedHtmlAsCustom(question);
          if (imported) {
            return {
              artifact: imported,
              text: htmlImportAckText(imported.title),
              thinking: "Importing HTML…",
            };
          }
          return null;
        })();

        if (fastCustom) {
          emit({ thinking: fastCustom.thinking });
          emit({ pendingArtifact: { type: "custom" } });
          emit({
            artifact: {
              type: fastCustom.artifact.type,
              title: fastCustom.artifact.title,
              description: fastCustom.artifact.description,
              data: fastCustom.artifact.data,
            },
          });
          emit({ text: fastCustom.text });
          closeStream();
          return;
        }

        if (skipSdk) {
          const issue = getCursorSdkRuntimeIssue();
          const note =
            issue?.code === "node_version"
              ? "Building custom UI with Claude (Node.js upgrade recommended for Cursor SDK)…"
              : "Building custom UI with Claude…";
          await runAnthropicFallback(note);
          closeStream();
          return;
        }

        const isEdit = editingPayload?.type === "custom";
        emit({
          thinking: resolveInitialThinkingLabel(question, editingPayload),
          sdkBuildStages: initialSdkBuildStages(isEdit),
        });
        emit({ pendingArtifact: { type: "custom" } });
        emit({ responseType: "custom" });

        cursorRuns += 1;
        billedProvider = "cursor";
        const result = await runCustomUiGenerator({
          question,
          history: rawHistory,
          files: attachmentFiles,
          editingArtifact,
          sourceData,
          onProgress: (payload) => emit(payload),
          onArtifact: (artifact) => {
            emit({
              artifact: {
                type: artifact.type,
                title: artifact.title,
                description: artifact.description,
                data: artifact.data,
              },
            });
          },
          signal: req.signal,
        });

        if (result.artifact) {
          emit({
            artifact: {
              type: result.artifact.type,
              title: result.artifact.title,
              description: result.artifact.description,
              data: result.artifact.data,
            },
          });
          const ack =
            result.assistantText.trim() ||
            (editingPayload?.type === "custom"
              ? "Updated the custom UI."
              : "Built your custom UI component.");
          emit({ text: ack });
        } else if (
          result.fallbackRecommended &&
          canUseAnthropicFallback()
        ) {
          await runAnthropicFallback("Cursor agent unavailable — building with Claude…");
        } else if (result.error) {
          emit({
            error: `${result.error}${
              editingPayload?.type === "custom"
                ? " Your existing artifact on the canvas is unchanged."
                : ""
            }`,
          });
        } else {
          emit({
            error:
              "Custom UI was not saved — no valid artifact was emitted. Try again.",
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        if (canUseAnthropicFallback()) {
          try {
            await runAnthropicFallback(
              "Cursor agent failed — building with Claude…",
            );
          } catch (fallbackErr) {
            const fbMsg =
              fallbackErr instanceof Error
                ? fallbackErr.message
                : "Unknown error";
            emit({ error: `${msg} Fallback also failed: ${fbMsg}` });
          }
        } else {
          emit({ error: msg });
        }
      } finally {
        if (hardTimeout) clearTimeout(hardTimeout);

        // Phase 1 meter. The Cursor SDK reports no usage at all, so its cost is
        // a flat calibrated constant (NON_TOKEN_USD.cursorRun) rather than a
        // measurement — see Phase 4.5. The Anthropic fallback bills real tokens.
        if (billedProvider) {
          const cursorRunCount = billedProvider === "cursor" ? cursorRuns : 0;

          recordUsage({
            ownerId: user?.id ?? null,
            visitorId: guest.visitorId,
            surface: "custom-ui",
            provider: billedProvider,
            model: billedModel,
            ...billedUsage,
            cursorRuns: cursorRunCount,
            outcome: "success",
          });

          if (!user && guest.visitorId) {
            void addGuestUsage({
              visitorId: guest.visitorId,
              ipHash: guest.ipHash,
              credits: creditsFor({
                model: billedModel,
                ...billedUsage,
                cursorRuns: cursorRunCount,
              }),
            });
          }
        }

        closeStream();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
