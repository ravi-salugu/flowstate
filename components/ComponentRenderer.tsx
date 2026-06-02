"use client";

/**
 * R4b — ComponentRenderer.
 *
 * Dispatch component that takes a unified `Component<K>` and renders the
 * appropriate underlying React component. For now (R4) the dispatch is
 * intentionally thin: chat-kind components render via the existing
 * `<Card />`, artifact-kind components render via the existing
 * `<CanvasArtifactNode />`. This keeps the 540-line `Card.tsx` and
 * `CanvasArtifactNode.tsx` untouched — they keep their existing prop shapes
 * and behaviour. The renderer just routes by `component.kind`.
 *
 * Each sub-renderer subscribes to the store directly via `useCanvasStore`
 * so that fine-grained card / node mutations only re-render the affected
 * sub-tree, not the whole canvas. The projection's `Component` view exists
 * for *iteration* (Canvas walking the list); the actual prop data for each
 * underlying renderer still comes from the original v1 slices.
 *
 * R4b status: this file exists. Nothing imports it yet — that's R4c.
 *
 * Kinds the projection produces today (from v1 store):
 *   chat, text (not yet), image (not yet), gallery, table, code, 3d, ui
 *
 * Kinds not yet producible from v1 (chart, browser) render the fallback
 * "unknown kind" body — defensive, you should never actually see it.
 */

import { memo } from "react";
import { useCanvasStore } from "@/lib/store";
import { Card } from "@/components/Card";
import { CanvasArtifactNode } from "@/components/CanvasArtifactNode";
import type { Component, ComponentKind } from "@/lib/types/component";

interface ComponentRendererProps {
  component: Component;
}

// ---------------------------------------------------------------------------
// Sub-renderers — each subscribes to its own slice for minimal re-renders
// ---------------------------------------------------------------------------

interface ChatSubRendererProps {
  id: string;
}

function ChatSubRendererImpl({ id }: ChatSubRendererProps) {
  const card = useCanvasStore((s) => s.cards[id]);
  if (!card) return null;
  return <Card card={card} />;
}
const ChatSubRenderer = memo(ChatSubRendererImpl);

interface ArtifactSubRendererProps {
  id: string;
}

function ArtifactSubRendererImpl({ id }: ArtifactSubRendererProps) {
  const node = useCanvasStore((s) => s.canvasArtifactNodes[id]);
  if (!node) return null;
  return <CanvasArtifactNode node={node} />;
}
const ArtifactSubRenderer = memo(ArtifactSubRendererImpl);

function UnknownKindFallback({ kind, id }: { kind: ComponentKind; id: string }) {
  return (
    <div
      data-component-id={id}
      data-kind={kind}
      className="absolute rounded-lg border border-dashed border-canvas-border bg-canvas-card/70 px-3 py-2 text-xs text-canvas-muted"
      style={{ left: 0, top: 0 }}
    >
      Unknown kind: <code className="font-mono">{kind}</code>
      <br />
      <code className="font-mono text-[10px]">{id}</code>
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE dispatcher
// ---------------------------------------------------------------------------

function ComponentRendererImpl({ component }: ComponentRendererProps) {
  switch (component.kind) {
    case "chat":
      return <ChatSubRenderer id={component.id} />;
    // All v1-producible artifact kinds route to the existing CanvasArtifactNode.
    case "table":
    case "code":
    case "gallery":
    case "3d":
    case "ui":
      return <ArtifactSubRenderer id={component.id} />;
    // Kinds the v1 store doesn't currently produce — defensive fallback.
    // R5+ will introduce real renderers for these.
    case "text":
    case "image":
    case "chart":
    case "browser":
      return <UnknownKindFallback kind={component.kind} id={component.id} />;
    default: {
      // Exhaustiveness check — adding a new kind to the union without a case
      // here is a compile error.
      const _exhaustive: never = component.kind;
      return <UnknownKindFallback kind={_exhaustive} id={component.id} />;
    }
  }
}

export const ComponentRenderer = memo(ComponentRendererImpl);
