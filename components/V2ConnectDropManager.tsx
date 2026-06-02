"use client";

/**
 * R5c — V2 connect-drop manager.
 *
 * One mountable component. On mount:
 *   - registers a handler with the connect-drop bus (so usePlugDragSession
 *     routes drops-on-existing-components here)
 *
 * On drop:
 *   - opens ConnectionModeModal with the pending source + target
 *   - if a remembered mode exists in localStorage, skips the modal and
 *     materialises the connection immediately
 *   - on confirm: pushes into useV2ConnectionsStore so V2Connections renders
 *     it (R6 will also push into v1 connections slice for persistence)
 *
 * On unmount: clears the handler. Cancels any in-flight modal.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionModeModal,
  type ConnectionModeChoice,
  loadRememberedMode,
} from "@/components/ConnectionModeModal";
import {
  setConnectDropHandler,
  type ConnectDropSource,
  type ConnectDropTarget,
} from "@/lib/connectDropBus";
import { useV2ConnectionsStore } from "@/lib/v2ConnectionsStore";
import { useCanvasStore } from "@/lib/store";
import { useUnifiedComponents } from "@/lib/components/projection";
import { kindRegistry } from "@/lib/components/KindRegistry";
// Side-effect import — populates the registry with built-in kinds.
import "@/lib/components/kinds";
import type {
  ConnectionMode,
  ConnectorSide,
  PayloadContextChunk,
} from "@/lib/types/component";
import type { CardSide } from "@/lib/store";

function manualConnectionId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  return `mconn_${rand}`;
}

interface PendingDrop {
  source: ConnectDropSource;
  target: ConnectDropTarget;
}

function sourceComponentIdOf(source: ConnectDropSource): string {
  if (source.kind === "branch") return source.sourceCardId;
  return source.sourceNodeId;
}

/**
 * R6b — would adding the edge `newFrom → newTo` create a cycle?
 *
 * BFS from `newTo` following outgoing edges in the current connections list.
 * If we can reach `newFrom`, then `newTo → … → newFrom` already exists, and
 * adding `newFrom → newTo` closes the loop.
 *
 * Bounded by depth 16 (matches ConnectionService.resolveAncestors). Same-node
 * self-link is rejected up-front.
 */
function wouldCreateCycle(
  newFrom: string,
  newTo: string,
  edges: ReadonlyArray<{ from: string; to: string }>,
  maxDepth = 16,
): boolean {
  if (newFrom === newTo) return true;
  const visited = new Set<string>([newTo]);
  let frontier: string[] = [newTo];
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const node of frontier) {
      for (const e of edges) {
        if (e.from !== node) continue;
        if (e.to === newFrom) return true;
        if (!visited.has(e.to)) {
          visited.add(e.to);
          next.push(e.to);
        }
      }
    }
    frontier = next;
  }
  return false;
}

export function V2ConnectDropManager() {
  const [pending, setPending] = useState<PendingDrop | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const add = useV2ConnectionsStore((s) => s.add);
  const cards = useCanvasStore((s) => s.cards);
  const canvasArtifactNodes = useCanvasStore((s) => s.canvasArtifactNodes);
  const sessionArtifacts = useCanvasStore((s) => s.sessionArtifacts);
  const updateCard = useCanvasStore((s) => s.updateCard);
  const { components } = useUnifiedComponents();

  // Auto-clear toast after 3s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  /**
   * R6c — fire regen for chat-kind targets. Builds context from the source's
   * payload via KindRegistry.serializeForContext, calls /api/components/[id]/
   * regenerate with target's existing question + chunks, writes the new
   * answer back into the target Card via updateCard.
   *
   * Best-effort. Sets target status to 'thinking' during the call; reverts to
   * 'done' on success or error. Network errors surface as a toast.
   */
  const fireRegen = useCallback(
    async (
      sourceComponentId: string,
      targetComponentId: string,
    ): Promise<void> => {
      const source = components[sourceComponentId];
      const target = components[targetComponentId];
      if (!source || !target) {
        setToast("Source or target component not found");
        return;
      }
      if (target.kind !== "chat") {
        setToast(`Regenerate not supported for kind "${target.kind}" yet`);
        return;
      }

      const targetCard = cards[targetComponentId];
      const prompt = targetCard?.question ?? target.prompt;
      if (!prompt) {
        setToast("Target card has no prompt to re-run");
        return;
      }

      // Build context from source via KindRegistry. Skip if the source kind
      // isn't registered (defensive — shouldn't happen with the 8 R2 kinds).
      let contextChunks: PayloadContextChunk[] = [];
      try {
        if (!kindRegistry.has(source.kind)) {
          throw new Error(`No spec for kind "${source.kind}"`);
        }
        const spec = kindRegistry.get(source.kind);
        contextChunks = (
          spec.serializeForContext as (p: unknown) => PayloadContextChunk[]
        )(source.payload);
      } catch (err) {
        setToast(
          `Could not serialize source: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }

      // Optimistically flip target to thinking
      updateCard(targetComponentId, { status: "thinking" });

      try {
        const res = await fetch(
          `/api/components/${encodeURIComponent(targetComponentId)}/regenerate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, contextChunks }),
          },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { answer: string };
        updateCard(targetComponentId, {
          status: "done",
          answer: data.answer,
        });
      } catch (err) {
        updateCard(targetComponentId, { status: "done" });
        // eslint-disable-next-line no-console
        console.warn("[regenerate] failed:", err);
        setToast(
          `Regenerate failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    [components, cards, updateCard],
  );

  // Materialise a connection at the chosen mode.
  const commit = useCallback(
    (
      source: ConnectDropSource,
      target: ConnectDropTarget,
      mode: ConnectionMode,
    ) => {
      const fromId = sourceComponentIdOf(source);
      const toId = target.componentId;
      const id = manualConnectionId();

      // R6a — push to v2 store (with mode metadata for rendering + regen)
      // and to the v1 connections slice (so dual-write picks it up and the
      // connection survives reload). Shared id keeps them in lockstep.
      add(
        {
          fromComponentId: fromId,
          toComponentId: toId,
          fromSide: source.fromSide,
          toSide: target.toSide,
          mode,
        },
        id,
      );

      useCanvasStore.setState((s) => ({
        connections: [
          ...s.connections,
          {
            id,
            from: fromId,
            to: toId,
            fromSide: source.fromSide as CardSide,
            toSide: target.toSide as CardSide,
          },
        ],
      }));

      // R6c — if regenerate, fire the API call asynchronously
      if (mode === "regenerate") {
        void fireRegen(fromId, toId);
      }
    },
    [add, fireRegen],
  );

  // R7+ — keep the latest `commit` reachable from a ref so the registered
  // handler can always call the freshest closure WITHOUT depending on
  // `commit` in the useEffect deps. Without this, every render that produces
  // a new `commit` identity (which happens any time the projection / cards
  // change) would trigger a re-register, spamming the console and re-binding
  // the bus needlessly.
  const commitRef = useRef(commit);
  commitRef.current = commit;

  // Register the handler EXACTLY ONCE on mount, unregister on unmount.
  // Empty deps array → no churn. The handler delegates to commitRef.current
  // each call so it always sees the latest state.
  useEffect(() => {
    setConnectDropHandler((source, target) => {
      const fromId = sourceComponentIdOf(source);
      const toId = target.componentId;

      // R6b — refuse to add a connection that would close a cycle.
      const edges = useCanvasStore.getState().connections;
      if (wouldCreateCycle(fromId, toId, edges)) {
        setToast("Connection would create a cycle — skipped");
        return;
      }

      const remembered = loadRememberedMode();
      if (remembered) {
        commitRef.current(source, target, remembered);
        return;
      }
      setPending({ source, target });
    });
    return () => {
      setConnectDropHandler(null);
    };
    // Intentionally empty deps — see commitRef pattern above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lookup friendly titles for the modal description.
  const titles = (() => {
    if (!pending) return { from: undefined, to: undefined };
    const fromId = sourceComponentIdOf(pending.source);
    const toId = pending.target.componentId;
    const fromTitle =
      cards[fromId]?.question ||
      sessionArtifacts[canvasArtifactNodes[fromId]?.artifactId ?? ""]?.title ||
      fromId;
    const toTitle =
      cards[toId]?.question ||
      sessionArtifacts[canvasArtifactNodes[toId]?.artifactId ?? ""]?.title ||
      toId;
    return { from: fromTitle, to: toTitle };
  })();

  const handleConfirm = useCallback(
    (choice: ConnectionModeChoice) => {
      if (!pending) return;
      commit(pending.source, pending.target, choice.mode);
      setPending(null);
    },
    [pending, commit],
  );

  const handleCancel = useCallback(() => {
    setPending(null);
  }, []);

  return (
    <>
      <ConnectionModeModal
        open={pending !== null}
        fromTitle={titles.from}
        toTitle={titles.to}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-canvas-border bg-canvas-card px-4 py-2 text-xs text-canvas-ink shadow-card"
        >
          {toast}
        </div>
      )}
    </>
  );
}

// Quieten unused-var lint on ConnectorSide import while the type is reserved
// for future explicit narrowing in commit().
export type { ConnectorSide };
