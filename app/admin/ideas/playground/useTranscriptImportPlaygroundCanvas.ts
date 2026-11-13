"use client";

import { useCallback, useEffect, useRef } from "react";
import { buildCanvasSnapshot } from "@/lib/canvasSnapshot";
import type { TranscriptImportCanvasDef } from "@/lib/buildTranscriptImportPlaygroundSnapshot";
import {
  beginTranscriptImportPlaygroundSession,
  endTranscriptImportPlaygroundSession,
} from "@/lib/transcriptImportPlaygroundSession";
import {
  markViewportRestoredFromSnapshot,
  resetViewportBootstrap,
} from "@/lib/canvasViewportBootstrap";
import { getArtifactBounds, getCardBounds } from "@/lib/canvasNodeBounds";
import { viewportCenteredOnWorldPoint } from "@/lib/viewport";
import { usePersistenceReady } from "@/components/AuthProvider";
import { useCanvasStore } from "@/lib/store";

function fitViewportToImport(
  container: HTMLElement,
  canvas: TranscriptImportCanvasDef,
  padding = 200,
): void {
  const state = useCanvasStore.getState();
  const rects: { x: number; y: number; w: number; h: number }[] = [];

  for (const id of state.cardOrder) {
    const card = state.cards[id];
    if (!card) continue;
    const { w, h } = getCardBounds(card);
    rects.push({ x: card.position.x, y: card.position.y, w, h });
  }

  for (const id of state.canvasArtifactOrder) {
    const node = state.canvasArtifactNodes[id];
    if (!node) continue;
    const art = state.sessionArtifacts[node.artifactId];
    const { w, h } = getArtifactBounds(node, art);
    rects.push({ x: node.position.x, y: node.position.y, w, h });
  }

  const { width, height } = container.getBoundingClientRect();
  if (rects.length === 0) {
    const center = canvas.contentCenter();
    state.setViewport(
      viewportCenteredOnWorldPoint(center.x, center.y, width, height, 0.55),
    );
    markViewportRestoredFromSnapshot();
    return;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.w);
    maxY = Math.max(maxY, rect.y + rect.h);
  }

  const contentW = maxX - minX + padding;
  const contentH = maxY - minY + padding;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = Math.min(0.85, Math.min(width / contentW, height / contentH));

  state.setViewport(
    viewportCenteredOnWorldPoint(cx, cy, width, height, scale),
  );
  markViewportRestoredFromSnapshot();
}

export function useTranscriptImportPlaygroundCanvas(
  containerRef: React.RefObject<HTMLElement | null>,
  canvas: TranscriptImportCanvasDef,
) {
  const persistenceReady = usePersistenceReady();
  const hydrateFromSnapshot = useCanvasStore((s) => s.hydrateFromSnapshot);
  const sessionStartedRef = useRef(false);

  const fitContent = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    fitViewportToImport(el, canvas);
  }, [containerRef, canvas]);

  // The user's real canvas is stashed once for the whole visit and restored on
  // the way out — switching between imported canvases must not touch it.
  useEffect(() => {
    if (!persistenceReady) return;
    beginTranscriptImportPlaygroundSession(
      useCanvasStore.getState().getCanvasSnapshotSource(),
    );
    sessionStartedRef.current = true;

    return () => {
      if (!sessionStartedRef.current) return;
      sessionStartedRef.current = false;
      endTranscriptImportPlaygroundSession((restore) => {
        resetViewportBootstrap();
        hydrateFromSnapshot(buildCanvasSnapshot(restore), {
          applyViewport: true,
        });
      });
    };
  }, [persistenceReady, hydrateFromSnapshot]);

  useEffect(() => {
    if (!persistenceReady) return;
    resetViewportBootstrap();
    hydrateFromSnapshot(canvas.buildSnapshot(), { applyViewport: false });

    requestAnimationFrame(() => {
      if (containerRef.current) {
        fitViewportToImport(containerRef.current, canvas);
      }
    });
  }, [persistenceReady, canvas, hydrateFromSnapshot, containerRef]);

  return { fitContent };
}
