"use client";

import { useEffect, useRef } from "react";
import { focusCanvasCard } from "@/lib/canvasFocus";
import { requestCanvasFocus } from "@/lib/canvasViewportGuard";
import {
  COMPOSER_PROXIMITY_PX,
  findComponentTargetAtPoint,
  findNearestComposerTarget,
  hitReceivePlug,
  PLUG_DRAG_THRESHOLD_PX,
  screenToWorld,
} from "@/lib/plugGeometry";
import { useCanvasStore } from "@/lib/store";
import { getConnectDropHandler } from "@/lib/connectDropBus";
import { useConnectDragHoverStore } from "@/lib/connectDragHoverStore";
import type { ConnectorSide } from "@/lib/types/component";

const CARD_WIDTH = 420;
const CARD_DROP_Y_OFFSET = 30;

export function usePlugDragSession(
  containerRef: React.RefObject<HTMLDivElement | null>,
) {
  const plugDrag = useCanvasStore((s) => s.plugDrag);
  const updatePlugDrag = useCanvasStore((s) => s.updatePlugDrag);
  const endPlugDrag = useCanvasStore((s) => s.endPlugDrag);
  const createBranch = useCanvasStore((s) => s.createBranch);
  const createBranchAt = useCanvasStore((s) => s.createBranchAt);
  const createRootCardWithAttachment = useCanvasStore(
    (s) => s.createRootCardWithAttachment,
  );
  const setCardComposerAttachment = useCanvasStore(
    (s) => s.setCardComposerAttachment,
  );
  const startRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!plugDrag) {
      startRef.current = null;
      return;
    }

    const onPointerMove = (e: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const viewport = useCanvasStore.getState().viewport;
      const world = screenToWorld(e.clientX, e.clientY, rect, viewport);

      if (!startRef.current) {
        startRef.current = { x: e.clientX, y: e.clientY };
      }
      const dist = Math.hypot(
        e.clientX - startRef.current.x,
        e.clientY - startRef.current.y,
      );
      const didDrag =
        dist >= PLUG_DRAG_THRESHOLD_PX ||
        (useCanvasStore.getState().plugDrag?.didDrag ?? false);

      const drag = useCanvasStore.getState().plugDrag;
      if (!drag) return;

      // R7+ — surface the current drop target so the matching card / artifact
      // node can highlight itself in real time. Filter out self-link (the
      // source card is always under the cursor for a moment at drag start).
      const componentHit = findComponentTargetAtPoint(e.clientX, e.clientY);
      const sourceId =
        drag.kind === "branch" ? drag.sourceCardId : drag.artifactNodeId;
      const hoverId =
        componentHit && componentHit.componentId !== sourceId
          ? componentHit.componentId
          : null;
      useConnectDragHoverStore.getState().setHover(hoverId);

      if (drag.kind === "artifact") {
        const nearest = findNearestComposerTarget(
          world,
          container,
          viewport,
          COMPOSER_PROXIMITY_PX,
        );
        const hit = nearest ? hitReceivePlug(world, nearest) : null;
        updatePlugDrag({
          pointerWorld: world,
          didDrag,
          receiveTargetCardId: nearest?.cardId ?? null,
          hoveredReceiveSide: hit?.side ?? null,
        });
      } else {
        updatePlugDrag({ pointerWorld: world, didDrag });
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const viewport = useCanvasStore.getState().viewport;
      const world = screenToWorld(e.clientX, e.clientY, rect, viewport);
      const drag = useCanvasStore.getState().plugDrag;
      if (!drag) return;

      // R5b — check for drop ON another existing component. If hit AND R5c
      // has registered a connect handler, route there instead of the existing
      // branch/artifact create-new behaviour. Drop on empty canvas falls
      // through to the original handlers (preserves all v1 plug UX).
      //
      // R6c — dropped the `drag.didDrag` requirement. The self-link guard
      // (hit.componentId !== sourceId) is enough to distinguish a "click on
      // the source plug to create a default branch" from a real drag onto a
      // different component. Without this change, a slow / short drag (<5px
      // movement) onto another card would fall through to createBranch and
      // spawn an empty chat — exactly the user's complaint.
      const hit = findComponentTargetAtPoint(e.clientX, e.clientY);
      const connectHandler = getConnectDropHandler();
      const sourceId =
        drag.kind === "branch" ? drag.sourceCardId : drag.artifactNodeId;
      const isSelfLink = hit?.componentId === sourceId;

      // Temporary diagnostic — remove after drop-to-connect is verified.
      const rawEl =
        typeof document !== "undefined"
          ? (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)
          : null;
      // eslint-disable-next-line no-console
      console.log("[plug drop]", {
        dragKind: drag.kind,
        didDrag: drag.didDrag,
        sourceId,
        client: { x: e.clientX, y: e.clientY },
        rawElTag: rawEl?.tagName ?? null,
        rawElDataset: rawEl ? { ...rawEl.dataset } : null,
        hitId: hit?.componentId,
        hitVisualKind: hit?.visualKind,
        hasHandler: !!connectHandler,
        isSelfLink,
        willRouteToConnect: !!hit && !!connectHandler && !isSelfLink,
      });

      if (hit && connectHandler && !isSelfLink) {
        if (drag.kind === "branch") {
          connectHandler(
            {
              kind: "branch",
              sourceCardId: drag.sourceCardId,
              fromSide: drag.fromSide as ConnectorSide,
            },
            {
              componentId: hit.componentId,
              visualKind: hit.visualKind,
              toSide: hit.side,
            },
          );
        } else if (drag.kind === "artifact") {
          connectHandler(
            {
              kind: "artifact",
              sourceNodeId: drag.artifactNodeId,
              artifactId: drag.artifactId,
              versionId: drag.versionId,
              fromSide: drag.fromSide as ConnectorSide,
            },
            {
              componentId: hit.componentId,
              visualKind: hit.visualKind,
              toSide: hit.side,
            },
          );
        }
        endPlugDrag();
        startRef.current = null;
        return;
      }

      if (drag.kind === "branch") {
        if (drag.didDrag) {
          createBranchAt(drag.sourceCardId, drag.fromSide, world);
        } else {
          createBranch(drag.sourceCardId, drag.fromSide);
        }
      } else if (drag.kind === "artifact") {
        const nearest = findNearestComposerTarget(
          world,
          container,
          viewport,
          COMPOSER_PROXIMITY_PX,
        );
        const hit = nearest ? hitReceivePlug(world, nearest) : null;

        if (hit) {
          setCardComposerAttachment(hit.cardId, {
            artifactId: drag.artifactId,
            versionId: drag.versionId,
          });
        } else if (drag.didDrag) {
          const cardId = createRootCardWithAttachment(
            {
              x: world.x - CARD_WIDTH / 2,
              y: world.y - CARD_DROP_Y_OFFSET,
            },
            {
              artifactId: drag.artifactId,
              versionId: drag.versionId,
            },
          );
          if (cardId) requestCanvasFocus(() => focusCanvasCard(cardId));
        }
      }

      endPlugDrag();
      startRef.current = null;
      useConnectDragHoverStore.getState().clear();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        useCanvasStore.getState().cancelPlugDrag();
        startRef.current = null;
        useConnectDragHoverStore.getState().clear();
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    plugDrag,
    containerRef,
    updatePlugDrag,
    endPlugDrag,
    createBranch,
    createBranchAt,
    createRootCardWithAttachment,
    setCardComposerAttachment,
  ]);
}
