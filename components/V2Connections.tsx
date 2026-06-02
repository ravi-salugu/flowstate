"use client";

/**
 * R5c — V2 manual connections SVG layer.
 *
 * Renders connections from `useV2ConnectionsStore` (the in-memory store of
 * connections the user created via drag-to-connect). Endpoints are looked up
 * via the unified Component projection so cross-kind connections work
 * (card→artifact, artifact→artifact, etc.) — the existing v1 Connections
 * layer only handles card→card and silently skips anything else.
 *
 * Renders alongside, not instead of, v1 Connections — they handle distinct
 * sets of edges:
 *   v1 `Connections.tsx`     ← branch / follow-up edges, both endpoints in cards
 *   V2 `V2Connections.tsx`   ← user-drawn manual edges, endpoints from
 *                              unified projection (any kind)
 *
 * Connector geometry reuses `buildPlugConnectorPath` so the curves match the
 * v1 visual style. Mode is visually encoded:
 *   visual     → dashed line
 *   context    → solid line (default)
 *   regenerate → solid line + small "regen" badge at midpoint
 */

import {
  buildPlugConnectorPath,
  plugAnchorAt,
} from "@/lib/plugConnector";
import { compensatedStrokeWidth } from "@/lib/zoomDisplay";
import { useCanvasStore } from "@/lib/store";
import { useV2ConnectionsStore } from "@/lib/v2ConnectionsStore";
import { useUnifiedComponents } from "@/lib/components/projection";

const STROKE_FALLBACK = "#2f6cd6";
const BASE_STROKE_SCREEN = 1.75;

/**
 * R6c — query the live DOM for an existing component's rendered size.
 * Matches the trick v1 `getLayoutCardBounds` uses for Connections.tsx:
 * the projection's fallback heights (240px etc.) don't match a tall card's
 * actual `offsetHeight`, which would attach connector endpoints to a phantom
 * point inside the card body. Reading the live DOM keeps the anchor on the
 * visible edge.
 *
 * Falls back to the projection size if the DOM element isn't mounted yet
 * (initial render before children paint).
 */
function liveBoundsOrFallback(
  componentId: string,
  fallback: { w: number; h: number },
): { w: number; h: number } {
  if (typeof document === "undefined") return fallback;
  const el = document.querySelector(
    `[data-canvas-card="${componentId}"], [data-canvas-artifact="${componentId}"]`,
  ) as HTMLElement | null;
  if (!el) return fallback;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  if (w <= 0 || h <= 0) return fallback;
  return { w, h };
}

export function V2Connections() {
  const order = useV2ConnectionsStore((s) => s.order);
  const connections = useV2ConnectionsStore((s) => s.connections);
  const viewport = useCanvasStore((s) => s.viewport);
  const connectorStyle = useCanvasStore((s) => s.connectorStyle);
  const threads = useCanvasStore((s) => s.threads);
  const { components } = useUnifiedComponents();

  const strokeWidth = compensatedStrokeWidth(
    BASE_STROKE_SCREEN,
    viewport.scale,
    BASE_STROKE_SCREEN,
  );

  return (
    <svg
      className="absolute left-0 top-0 z-[11]"
      style={{ overflow: "visible" }}
      width={1}
      height={1}
    >
      {order.map((id) => {
        const conn = connections[id];
        if (!conn) return null;
        const from = components[conn.fromComponentId];
        const to = components[conn.toComponentId];
        if (!from || !to) return null;

        // R6c — use live DOM bounds so anchors land on the visible edge of
        // tall cards (whose card.size.h hasn't been written back yet).
        const fromBounds = liveBoundsOrFallback(from.id, from.size);
        const toBounds = liveBoundsOrFallback(to.id, to.size);

        const a = plugAnchorAt(
          from.position.x,
          from.position.y,
          fromBounds.w,
          fromBounds.h,
          conn.fromSide,
        );
        const b = plugAnchorAt(
          to.position.x,
          to.position.y,
          toBounds.w,
          toBounds.h,
          conn.toSide,
        );

        const { d, midX, midY } = buildPlugConnectorPath(
          a,
          b,
          conn.fromSide,
          conn.toSide,
          connectorStyle,
        );

        // Colour from the source thread if both endpoints share one,
        // otherwise neutral.
        const accent =
          from.threadId && from.threadId === to.threadId
            ? threads[from.threadId]?.accentColour ?? STROKE_FALLBACK
            : STROKE_FALLBACK;

        const dashed = conn.mode === "visual";
        const showRegenBadge = conn.mode === "regenerate";

        return (
          <g key={id} pointerEvents="none">
            <path
              d={d}
              fill="none"
              stroke={accent}
              strokeOpacity={0.85}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={dashed ? "6 5" : undefined}
            />
            {showRegenBadge && midX !== undefined && midY !== undefined && (
              <g transform={`translate(${midX}, ${midY})`}>
                <rect
                  x={-18}
                  y={-8}
                  width={36}
                  height={16}
                  rx={8}
                  fill={accent}
                  opacity={0.95}
                />
                <text
                  x={0}
                  y={3}
                  textAnchor="middle"
                  fontSize={9}
                  fill="white"
                  fontWeight={600}
                  letterSpacing={0.5}
                >
                  REGEN
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
