"use client";

import {
  applyEmittedArtifact,
  AskCallbacks,
  AskHandle,
} from "@/lib/dummyLLM";
import type { EmittedArtifact, ResponseType } from "@/lib/artifactTypes";
import { collectAskAttachments } from "@/lib/askAttachments";
import { buildAncestorHistory } from "@/lib/buildAncestorHistory";
import { collectSiblingGists } from "@/lib/memory/canvasMemory";
import { raiseGuestWallIfLimited } from "@/lib/billing/guestWall";
import { resolveEditingPayloadForApi } from "@/lib/artifactGeneration";
import { sanitizeCustomUiSource } from "@/lib/customUiSource";
import {
  CALENDAR_THINKING_LABEL,
  CHART_THINKING_LABEL,
  CUSTOM_UI_THINKING_LABEL,
  CUSTOM_UI_UPDATING_LABEL,
  isCustomUiWork,
  resolveInitialThinkingLabel,
  TIMELINE_THINKING_LABEL,
} from "@/lib/artifactIntent";
import {
  ClaudeModel,
  CardImage,
  useCanvasStore,
} from "./store";
import type { SdkBuildStage } from "@/lib/cursorSdk/buildProgressTypes";
import {
  getActiveTurnTimeoutMs,
  QA_TURN_TIMEOUT_ENABLED,
} from "@/lib/qaTurnLimits";

/** On unless explicitly disabled — custom UI needs the Cursor SDK route. */
export const CUSTOM_UI_SDK_ENABLED =
  process.env.NEXT_PUBLIC_CUSTOM_UI_SDK !== "false";

async function registerConversation(
  conversationId: string,
  parentConversationId: string | null,
): Promise<void> {
  await fetch("/api/conversations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ conversationId, parentConversationId }),
  });
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  return err instanceof Error && err.name === "AbortError";
}

export function askClaude(
  cardId: string,
  parentConversationId: string | null,
  question: string,
  model: ClaudeModel,
  cb: AskCallbacks,
): AskHandle {
  let cancelled = false;
  const controller = new AbortController();
  let responseType: ResponseType = "text";
  let receivedContent = false;
  let handoffSeen = false;
  let hardTimeoutId: ReturnType<typeof setTimeout> | undefined;

  const clearHardTimeout = () => {
    if (hardTimeoutId !== undefined) {
      clearTimeout(hardTimeoutId);
      hardTimeoutId = undefined;
    }
  };

  const run = async () => {
    if (cancelled) return;
    const editingArtifact = resolveEditingPayloadForApi(cardId);
    const handoffSource = useCanvasStore.getState().cards[cardId]?.customUiSource;
    // A handoff is custom-UI work by construction — force it so this turn gets
    // the /api/custom-ui route and its 5-minute budget regardless of wording.
    const customWork =
      Boolean(handoffSource) ||
      isCustomUiWork(question, editingArtifact?.payload as { type?: string } | null);
    const turnTimeoutMs = getActiveTurnTimeoutMs(customWork);
    if (QA_TURN_TIMEOUT_ENABLED && turnTimeoutMs > 0) {
      hardTimeoutId = setTimeout(() => {
        cancelled = true;
        controller.abort(
          new DOMException("Q&A request timed out", "AbortError"),
        );
      }, turnTimeoutMs);
    }
    cb.onThinking(resolveInitialThinkingLabel(question, editingArtifact?.payload as { type?: string } | null));
    try {
      const state = useCanvasStore.getState();
      const card = state.cards[cardId];
      const history = buildAncestorHistory(
        {
          cards: state.cards,
          connections: state.connections,
          sessionArtifacts: state.sessionArtifacts,
        },
        cardId,
      );

      const { questionWithContext, files } = await collectAskAttachments(
        cardId,
        question,
        {
          cards: state.cards,
          connections: state.connections,
          canvasAssets: state.canvasAssets,
          canvasSkills: state.canvasSkills,
          sessionArtifacts: state.sessionArtifacts,
          // Group joint-context: membership + every member node collection.
          groups: state.groups,
          cardOrder: state.cardOrder,
          threads: state.threads,
          threadOrder: state.threadOrder,
          canvasArtifactNodes: state.canvasArtifactNodes,
          canvasAssetNodes: state.canvasAssetNodes,
          canvasGifNodes: state.canvasGifNodes,
          canvas3DNodes: state.canvas3DNodes,
          canvasTextLabels: state.canvasTextLabels,
        },
      );

      if (cancelled) return;

      // Faint awareness of sibling branches — ranked against the raw question,
      // never the branches' full context.
      const canvasMemory = collectSiblingGists(cardId, question);

      await registerConversation(cardId, parentConversationId);

      const useCustomUiSdk = CUSTOM_UI_SDK_ENABLED && customWork;
      const apiPath = useCustomUiSdk ? "/api/custom-ui" : "/api/chat";

      const res = await fetch(apiPath, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId: cardId,
          parentConversationId,
          question: questionWithContext,
          model,
          history,
          canvasMemory: canvasMemory.length > 0 ? canvasMemory : undefined,
          files: files?.length
            ? files.map((f) => ({
                name: f.name,
                type: f.mimeType,
                data: f.base64,
                turnLabel: f.turnLabel,
              }))
            : undefined,
          editingArtifact,
          sourceData: handoffSource,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (cancelled) return;

        // The guest wall. A 402 here is not a failure to report — it is a
        // conversion moment, so open the sign-in modal and say nothing in the
        // card. Rendering "Request failed (HTTP 402)" would be both alarming
        // and wrong.
        if (await raiseGuestWallIfLimited(res)) {
          // Mark content as received so the `finally` block below does not
          // add "⚠️ No response received. The connection may have timed
          // out." — nothing failed and nothing timed out, and telling a
          // visitor otherwise at the exact moment we ask them to sign in is
          // both untrue and alarming.
          receivedContent = true;
          cb.onThinking?.("Sign in to continue");
          // Leaves a calm line in the card, so it still makes sense after
          // the modal is dismissed. Without any text the card falls through
          // to the missing-answer retry placeholder.
          cb.onToken(
            "Sign in to see this answer — your canvas is saved and comes with you.",
          );
          // No onDone here: the `finally` block owns that, and calling it
          // twice double-fires the turn-complete handlers.
          return;
        }

        receivedContent = true;
        const timeout =
          res.status === 504 || res.status === 408;
        cb.onThinking?.("Request failed");
        cb.onToken(
          timeout
            ? customWork
              ? "⚠️ The custom UI request timed out before completing. Your existing artifact on the canvas is unchanged — try a smaller change (e.g. theme or colors only) or retry."
              : "⚠️ The request timed out before the server could respond. Try again with a simpler prompt or fewer attachments."
            : `⚠️ Request failed (HTTP ${res.status}). Try again in a moment.`,
        );
        cb.onDone({ artifactId: null, responseType: "text" });
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done || cancelled) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          if (raw === "[DONE]") continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.images) {
              receivedContent = true;
              responseType = "image";
              cb.onResponseType?.("image");
              cb.onImages?.(parsed.images as CardImage[]);
            } else if (parsed.artifact) {
              receivedContent = true;
              const raw = parsed.artifact as {
                type?: string;
                title?: string;
                description?: string;
                data?: Record<string, unknown>;
              };
              const validTypes = [
                "table",
                "code",
                "video",
                "custom",
                "3d",
                "map",
                "streetview",
                "todo",
                "calendar",
                "timeline",
                "chart",
              ] as const;
              if (
                !raw.type ||
                !validTypes.includes(raw.type as (typeof validTypes)[number])
              ) {
                continue;
              }
              const artifact: EmittedArtifact = {
                type: raw.type as EmittedArtifact["type"],
                title: raw.title ?? "Artifact",
                description: raw.description,
                data: raw.data ?? {},
              };
              responseType = artifact.type;
              cb.onResponseType?.(artifact.type);
              cb.onArtifact?.(artifact);
            } else if (parsed.responseType === "image") {
              responseType = "image";
              cb.onResponseType?.("image");
            } else if (parsed.pendingArtifact?.type === "table") {
              cb.onThinking?.("Building table…");
            } else if (parsed.pendingArtifact?.type === "calendar") {
              cb.onThinking?.(CALENDAR_THINKING_LABEL);
            } else if (parsed.pendingArtifact?.type === "timeline") {
              cb.onThinking?.(TIMELINE_THINKING_LABEL);
            } else if (parsed.pendingArtifact?.type === "custom") {
              if (!useCustomUiSdk) {
                cb.onThinking?.(CUSTOM_UI_THINKING_LABEL);
              }
              cb.onResponseType?.("custom");
            } else if (parsed.pendingArtifact?.type === "map") {
              cb.onThinking?.("Preparing map…");
            } else if (parsed.pendingArtifact?.type === "chart") {
              cb.onThinking?.(CHART_THINKING_LABEL);
            } else if (parsed.mcpApproval) {
              const approval = parsed.mcpApproval as {
                requestId?: string;
                serverId?: string;
                serverName?: string;
                toolName?: string;
                description?: string;
                inputPreview?: Record<string, unknown>;
              };
              if (approval.requestId && approval.toolName) {
                cb.onMcpApproval?.({
                  requestId: approval.requestId,
                  serverId: approval.serverId ?? "",
                  serverName: approval.serverName ?? "MCP server",
                  toolName: approval.toolName,
                  description: approval.description ?? "",
                  inputPreview: approval.inputPreview ?? {},
                });
              }
            } else if (parsed.mcpApprovalResolved) {
              const resolved = parsed.mcpApprovalResolved as { requestId?: string };
              if (resolved.requestId) {
                cb.onMcpApprovalResolved?.(resolved.requestId);
              }
            } else if (parsed.customUiHandoff) {
              if (!handoffSeen) {
                const raw = parsed.customUiHandoff as {
                  title?: unknown;
                  source?: unknown;
                };
                const source = sanitizeCustomUiSource(raw.source);
                const title = typeof raw.title === "string" ? raw.title.trim() : "";
                if (source && title) {
                  handoffSeen = true;
                  cb.onCustomUiHandoff?.({ title, source });
                }
              }
            } else if (parsed.thinking || parsed.sdkBuildStages) {
              if (typeof parsed.thinking === "string" && parsed.thinking) {
                cb.onThinking(parsed.thinking);
              }
              if (Array.isArray(parsed.sdkBuildStages) && parsed.sdkBuildStages.length > 0) {
                cb.onSdkBuildStages?.(parsed.sdkBuildStages as SdkBuildStage[]);
              }
            } else if (parsed.usage) {
              const {
                inputTokens,
                outputTokens,
                cacheReadTokens = 0,
                cacheCreationTokens = 0,
              } = parsed.usage;
              const store = useCanvasStore.getState();
              store.addUsage(
                inputTokens,
                outputTokens,
                cacheReadTokens,
                cacheCreationTokens,
              );
              store.addCardTurnUsage(
                cardId,
                inputTokens,
                outputTokens,
                cacheReadTokens,
                cacheCreationTokens,
              );
            } else if (parsed.error) {
              receivedContent = true;
              cb.onThinking?.("Request failed");
              acc = acc ? `${acc}\n\n⚠️ ${parsed.error}` : `⚠️ ${parsed.error}`;
              cb.onToken(acc);
            } else if (parsed.text) {
              receivedContent = true;
              acc += parsed.text;
              cb.onToken(acc);
            }
          } catch {
            // malformed chunk — skip
          }
        }
      }
    } catch (err) {
      if (cancelled || isAbortError(err)) return;
      receivedContent = true;
      const msg = err instanceof Error ? err.message : String(err);
      cb.onThinking?.("Request failed");
      cb.onToken(`⚠️ ${msg}`);
    } finally {
      clearHardTimeout();
      if (!cancelled) {
        if (!receivedContent) {
          cb.onThinking?.("Request failed");
          cb.onToken(
            customWork
              ? "⚠️ No response received — the custom UI build may have timed out. Your previous artifact is still on the canvas. Try a smaller change or retry."
              : "⚠️ No response received. The connection may have timed out.",
          );
        }
        cb.onDone({ artifactId: null, responseType });
      }
    }
  };

  void run().catch((err) => {
    if (cancelled || isAbortError(err)) return;
    console.error("[askClaude] unexpected error", err);
  });

  return {
    cancel: () => {
      cancelled = true;
      clearHardTimeout();
      controller.abort(new DOMException("Q&A request cancelled", "AbortError"));
    },
  };
}

export { applyEmittedArtifact };
