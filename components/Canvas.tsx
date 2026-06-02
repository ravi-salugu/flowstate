"use client";

import {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { collectFamiliesInWorldRect } from "@/lib/canvasSelection";
import { getLatestVersion } from "@/lib/sessionArtifacts";
import {
  allowSidebarDrop,
  parseSidebarDragPayload,
  uploadedToPending,
} from "@/lib/sidebarDnD";
import {
  CANVAS_ARTIFACT_WIDTH,
  CANVAS_TABLE_ARTIFACT_WIDTH,
  CANVAS_TEXT_LABEL_FONT_SIZE,
  useCanvasStore,
} from "@/lib/store";
import { viewportCenteredOnWorldPoint } from "@/lib/viewport";
import {
  CanvasContextMenu,
  ContextMenuState,
} from "@/components/CanvasContextMenu";
import { CanvasLanding } from "@/components/CanvasLanding";
import { CanvasViewport } from "@/components/CanvasViewport";
import { CanvasTextLabelNode } from "@/components/CanvasTextLabelNode";
import { ComponentRenderer } from "@/components/ComponentRenderer";
import { Connections } from "@/components/Connections";
import { V2Connections } from "@/components/V2Connections";
import { V2ConnectDropManager } from "@/components/V2ConnectDropManager";
import { useUnifiedComponents } from "@/lib/components/projection";
import { installParityHelper } from "@/lib/canvasV2Parity";
import { PlugConnectorLayer } from "@/components/plugs/PlugConnectorLayer";
import { usePlugDragSession } from "@/hooks/usePlugDragSession";
import { focusCanvasArtifact } from "@/lib/canvasArtifacts";
import { focusCanvasCard } from "@/lib/canvasFocus";
import { CARD_WIDTH, EMPTY_CARD_HEIGHT } from "@/lib/canvasNodeBounds";
import { shouldCanvasWheelZoom } from "@/lib/canvasWheel";
import {
  markUserViewportInteraction,
  requestCanvasFocus,
} from "@/lib/canvasViewportGuard";
import {
  getLandingCardId,
  shouldShowCanvasLanding,
} from "@/lib/canvasLandingState";
import { GroupBounds } from "@/components/GroupBounds";
import { GroupSummaryIcon } from "@/components/GroupSummaryIcon";
import { SelectionOverlay } from "@/components/SelectionOverlay";
import { SelectionToolbar } from "@/components/SelectionToolbar";
import { SendIconPreview } from "@/components/SendIconButton";
import { usePersistenceReady } from "@/components/AuthProvider";

const MARQUEE_MIN_DRAG_PX = 6;

/** Avoid re-panning on resize once the initial viewport has been applied. */
let initialViewportApplied = false;

interface PlacementState {
  x: number;
  y: number;
}

export function Canvas() {
  const persistenceReady = usePersistenceReady();
  const cards = useCanvasStore((s) => s.cards);
  const cardOrder = useCanvasStore((s) => s.cardOrder);
  const panBy = useCanvasStore((s) => s.panBy);
  const zoomAt = useCanvasStore((s) => s.zoomAt);
  const viewport = useCanvasStore((s) => s.viewport);
  const createRootCard = useCanvasStore((s) => s.createRootCard);
  const updateCard = useCanvasStore((s) => s.updateCard);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const uploadedAttachments = useCanvasStore((s) => s.uploadedAttachments);
  const sessionArtifacts = useCanvasStore((s) => s.sessionArtifacts);
  const canvasArtifactNodes = useCanvasStore((s) => s.canvasArtifactNodes);
  const canvasArtifactOrder = useCanvasStore((s) => s.canvasArtifactOrder);
  const canvasTextLabels = useCanvasStore((s) => s.canvasTextLabels);
  const canvasTextLabelOrder = useCanvasStore((s) => s.canvasTextLabelOrder);
  const selectedCanvasTextLabelId = useCanvasStore(
    (s) => s.selectedCanvasTextLabelId,
  );
  const spawnCanvasTextLabel = useCanvasStore((s) => s.spawnCanvasTextLabel);
  const removeCanvasTextLabel = useCanvasStore((s) => s.removeCanvasTextLabel);
  const selectCanvasTextLabel = useCanvasStore((s) => s.selectCanvasTextLabel);
  const clearSelection = useCanvasStore((s) => s.clearSelection);
  const selectCanvasArtifact = useCanvasStore((s) => s.selectCanvasArtifact);
  const setSelectedFamilyRootIds = useCanvasStore(
    (s) => s.setSelectedFamilyRootIds,
  );
  const groups = useCanvasStore((s) => s.groups);
  const groupList = Object.values(groups);

  // R4c — unified component projection. Iteration source for the render loop
  // below. Underlying slice subscriptions stay because the rest of Canvas
  // (selection, marquee, drag, focus) still reads cards / canvasArtifactNodes
  // directly. Those mutations naturally re-derive the projection.
  const { components, componentOrder } = useUnifiedComponents();

  const showLanding = shouldShowCanvasLanding(cards, cardOrder);
  const landingCardId = getLandingCardId(cards, cardOrder);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const landingViewportCenteredRef = useRef(false);
  const seedingRef = useRef(false);

  useEffect(() => {
    if (cardOrder.length === 0) seedingRef.current = false;
  }, [cardOrder.length]);

  // R8b — expose `window.__verifyV1V2Parity()` for console-driven parity checks
  // during the v2 cut-over verification window. No-op in production.
  useEffect(() => {
    installParityHelper();
  }, []);

  usePlugDragSession(containerRef);
  const panState = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(
    null,
  );
  const marqueeState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const spaceHeldRef = useRef(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [marqueeRect, setMarqueeRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  // Latest cursor position in screen space, kept in a ref so a window keydown
  // listener can read it without re-binding on every mousemove.
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const canvasPointerRef = useRef<{ x: number; y: number } | null>(null);

  // Two-step Q placement: press Q -> ghost follows cursor; click -> anchor;
  // Esc -> cancel. Holding both state (for re-render) and a ref (for stable
  // handler closures).
  const [placement, setPlacement] = useState<PlacementState | null>(null);
  const [textPlacement, setTextPlacement] = useState<PlacementState | null>(
    null,
  );
  const [autoEditLabelId, setAutoEditLabelId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const placementRef = useRef<PlacementState | null>(null);
  const textPlacementRef = useRef<PlacementState | null>(null);
  useEffect(() => {
    placementRef.current = placement;
  }, [placement]);
  useEffect(() => {
    textPlacementRef.current = textPlacement;
  }, [textPlacement]);

  const canvasPlacementRequest = useCanvasStore((s) => s.canvasPlacementRequest);

  const beginPlacementAtCursor = (tool: "question" | "text") => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const canvasPtr = canvasPointerRef.current;
    const cursor = cursorRef.current;
    const rawX = canvasPtr?.x ?? cursor?.x ?? rect.left + rect.width / 2;
    const rawY = canvasPtr?.y ?? cursor?.y ?? rect.top + rect.height / 2;
    const clientX = Math.min(rect.right, Math.max(rect.left, rawX));
    const clientY = Math.min(rect.bottom, Math.max(rect.top, rawY));
    const world = computeWorldFromClient(clientX, clientY);
    if (!world) return;
    const pos = placementWorld(world);
    setContextMenu(null);
    if (tool === "question") {
      setTextPlacement(null);
      setPlacement(pos);
    } else {
      setPlacement(null);
      setTextPlacement(pos);
    }
  };

  useEffect(() => {
    if (!canvasPlacementRequest) return;
    beginPlacementAtCursor(canvasPlacementRequest);
    useCanvasStore.setState({ canvasPlacementRequest: null });
  }, [canvasPlacementRequest]);

  useEffect(() => {
    const mode = placement ? "question" : textPlacement ? "text" : null;
    if (useCanvasStore.getState().activeCanvasPlacement !== mode) {
      useCanvasStore.setState({ activeCanvasPlacement: mode });
    }
  }, [placement, textPlacement]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }
      e.preventDefault();
      spaceHeldRef.current = true;
      setSpaceHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      spaceHeldRef.current = false;
      setSpaceHeld(false);
    };
    const onBlur = () => {
      spaceHeldRef.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const computeWorldFromClient = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const { x: vx, y: vy, scale } = useCanvasStore.getState().viewport;
    return {
      x: (clientX - rect.left - vx) / scale,
      y: (clientY - rect.top - vy) / scale,
    };
  };

  /** World coordinates are unbounded — cards stay where you place them on the canvas. */
  const placementWorld = (world: PlacementState): PlacementState => world;

  // Seed the home card as soon as the container has size (do not wait on cloud load).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const seedIfEmpty = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const state = useCanvasStore.getState();
      if (state.cardOrder.length > 0 || seedingRef.current) return;

      seedingRef.current = true;
      initialViewportApplied = false;
      createRootCard({
        x: -CARD_WIDTH / 2,
        y: -EMPTY_CARD_HEIGHT / 2,
      });
      setViewport(
        viewportCenteredOnWorldPoint(0, 0, rect.width, rect.height, 1),
      );
      initialViewportApplied = true;
    };

    seedIfEmpty();
    const ro = new ResizeObserver(seedIfEmpty);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cardOrder.length, createRootCard, setViewport]);

  // After persistence hydrates, center on the first card if we have not yet.
  useEffect(() => {
    if (!persistenceReady) return;

    const el = containerRef.current;
    if (!el) return;

    const bootstrap = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const state = useCanvasStore.getState();
      if (state.cardOrder.length === 0) return;
      if (initialViewportApplied) return;

      const landingId = getLandingCardId(state.cards, state.cardOrder);
      if (landingId) {
        setViewport(
          viewportCenteredOnWorldPoint(0, 0, rect.width, rect.height, 1),
        );
        initialViewportApplied = true;
        return;
      }

      const first = state.cards[state.cardOrder[0]];
      if (!first) return;

      const w = first.size?.w ?? CARD_WIDTH;
      const h = first.size?.h ?? EMPTY_CARD_HEIGHT;
      setViewport(
        viewportCenteredOnWorldPoint(
          first.position.x + w / 2,
          first.position.y + h / 2,
          rect.width,
          rect.height,
          1,
        ),
      );
      initialViewportApplied = true;
    };

    bootstrap();
    const ro = new ResizeObserver(bootstrap);
    ro.observe(el);
    return () => ro.disconnect();
  }, [persistenceReady, setViewport]);

  // Keep the landing stack in view when resuming an empty canvas (e.g. saved pan).
  useEffect(() => {
    if (!showLanding) {
      landingViewportCenteredRef.current = false;
      return;
    }
    if (landingViewportCenteredRef.current) return;

    const el = containerRef.current;
    if (!el) return;

    const centerLanding = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const scale = useCanvasStore.getState().viewport.scale;
      setViewport(
        viewportCenteredOnWorldPoint(0, 0, rect.width, rect.height, scale),
      );
      landingViewportCenteredRef.current = true;
    };

    centerLanding();
    const ro = new ResizeObserver(centerLanding);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showLanding, setViewport]);

  // Prevent native page zoom (pinch / Ctrl+wheel) while interacting with the canvas.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const preventGesture = (e: Event) => e.preventDefault();
    el.addEventListener("gesturestart", preventGesture);
    el.addEventListener("gesturechange", preventGesture);
    el.addEventListener("gestureend", preventGesture);
    return () => {
      el.removeEventListener("gesturestart", preventGesture);
      el.removeEventListener("gesturechange", preventGesture);
      el.removeEventListener("gestureend", preventGesture);
    };
  }, []);

  // Track cursor position globally; also update ghost position when in placement.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      cursorRef.current = { x: e.clientX, y: e.clientY };
      if (placementRef.current) {
        const world = computeWorldFromClient(e.clientX, e.clientY);
        if (world) setPlacement(placementWorld(world));
      }
      if (textPlacementRef.current) {
        const world = computeWorldFromClient(e.clientX, e.clientY);
        if (world) setTextPlacement(placementWorld(world));
      }
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Q (enter placement) / Esc (cancel placement). Capture phase so Q works as a
  // canvas tool shortcut even when an empty question field is focused.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (placementRef.current) {
          e.preventDefault();
          setPlacement(null);
        }
        if (textPlacementRef.current) {
          e.preventDefault();
          setTextPlacement(null);
        }
        setContextMenu(null);
        useCanvasStore.getState().clearSelection();
        useCanvasStore.getState().selectCanvasTextLabel(null);
        return;
      }

      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedCanvasTextLabelId
      ) {
        const target = e.target as HTMLElement | null;
        if (target) {
          const tag = target.tagName;
          if (
            tag === "INPUT" ||
            tag === "TEXTAREA" ||
            target.isContentEditable
          ) {
            return;
          }
        }
        e.preventDefault();
        removeCanvasTextLabel(selectedCanvasTextLabelId);
        return;
      }

      if (e.code !== "KeyQ" || e.repeat || e.ctrlKey || e.metaKey || e.altKey)
        return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") {
          const field = target as HTMLInputElement | HTMLTextAreaElement;
          if (field.value.trim().length > 0) return;
        } else if (target.isContentEditable) {
          return;
        }
      }

      if (placementRef.current || textPlacementRef.current) return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const canvasPtr = canvasPointerRef.current;
      const cursor = cursorRef.current;
      const rawX = canvasPtr?.x ?? cursor?.x ?? rect.left + rect.width / 2;
      const rawY = canvasPtr?.y ?? cursor?.y ?? rect.top + rect.height / 2;
      const clientX = Math.min(rect.right, Math.max(rect.left, rawX));
      const clientY = Math.min(rect.bottom, Math.max(rect.top, rawY));
      const world = computeWorldFromClient(clientX, clientY);
      if (!world) return;

      e.preventDefault();
      e.stopPropagation();
      setContextMenu(null);
      setTextPlacement(null);
      target?.blur();
      setPlacement(placementWorld(world));
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [removeCanvasTextLabel, selectedCanvasTextLabelId]);

  // T (enter text placement) — same rules as Q for focused inputs.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "KeyT" || e.repeat || e.ctrlKey || e.metaKey || e.altKey)
        return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") {
          const field = target as HTMLInputElement | HTMLTextAreaElement;
          if (field.value.trim().length > 0) return;
        } else if (target.isContentEditable) {
          return;
        }
      }

      if (placementRef.current || textPlacementRef.current) return;

      e.preventDefault();
      e.stopPropagation();
      setContextMenu(null);
      setPlacement(null);
      target?.blur();
      beginPlacementAtCursor("text");
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // Window-level click handler that finalises placement and consumes the event
  // so it doesn't focus inputs or trigger pan on the underlying surface.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;

      const textPos = textPlacementRef.current;
      if (textPos) {
        e.preventDefault();
        e.stopPropagation();
        const id = spawnCanvasTextLabel({
          x: textPos.x,
          y: textPos.y - CANVAS_TEXT_LABEL_FONT_SIZE / 2,
        });
        setAutoEditLabelId(id);
        setTextPlacement(null);
        return;
      }

      if (!placementRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      const world =
        computeWorldFromClient(e.clientX, e.clientY) ?? placementRef.current;
      const cardId = createRootCard({
        x: world.x - CARD_WIDTH / 2,
        y: world.y - EMPTY_CARD_HEIGHT / 2,
      });
      requestCanvasFocus(() => focusCanvasCard(cardId));
      setPlacement(null);
    };
    // Capture phase so we run before any element's own listeners (including
    // textareas trying to receive focus on click).
    window.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      window.removeEventListener("pointerdown", onPointerDown, true);
  }, [createRootCard, spawnCanvasTextLabel]);

  const handleSidebarDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const payload = parseSidebarDragPayload(e.dataTransfer);
    if (!payload) return;

    if (payload.kind === "artifact") {
      const art = sessionArtifacts[payload.artifactId];
      if (!art) return;
      const world = computeWorldFromClient(e.clientX, e.clientY);
      if (!world) return;
      const artWidth =
        art.kind === "table" ? CANVAS_TABLE_ARTIFACT_WIDTH : CANVAS_ARTIFACT_WIDTH;
      const artHeight = art.kind === "table" ? 480 : 280;
      useCanvasStore.getState().ensureCanvasArtifactAt(
        payload.artifactId,
        payload.versionId,
        {
          x: world.x - artWidth / 2,
          y: world.y - artHeight / 2,
        },
      );
      requestCanvasFocus(() => focusCanvasArtifact(payload.artifactId));
      return;
    }

    const world = computeWorldFromClient(e.clientX, e.clientY);
    if (!world) return;
    const att = uploadedAttachments.find((a) => a.id === payload.attachmentId);
    if (!att) return;
    const cardId = createRootCard({
      x: world.x - CARD_WIDTH / 2,
      y: world.y - EMPTY_CARD_HEIGHT / 2,
    });
    updateCard(cardId, {
      pendingFiles: [uploadedToPending(att)],
    });
    requestCanvasFocus(() => focusCanvasCard(cardId));
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (placementRef.current || textPlacementRef.current) return;
    if ((e.target as HTMLElement).closest("[data-canvas-card]")) return;
    if ((e.target as HTMLElement).closest("[data-canvas-artifact]")) return;
    if ((e.target as HTMLElement).closest("[data-canvas-text-label]")) return;
    setContextMenu({ screenX: e.clientX, screenY: e.clientY });
  };

  const handleAddTextAtContextMenu = () => {
    if (!contextMenu) return;
    const world = computeWorldFromClient(
      contextMenu.screenX,
      contextMenu.screenY,
    );
    if (!world) return;
    const id = spawnCanvasTextLabel({
      x: world.x,
      y: world.y - CANVAS_TEXT_LABEL_FONT_SIZE / 2,
    });
    setAutoEditLabelId(id);
  };

  const applyMarqueeAt = (clientX: number, clientY: number) => {
    const ms = marqueeState.current;
    if (!ms) return;

    const x1 = Math.min(ms.startX, clientX);
    const y1 = Math.min(ms.startY, clientY);
    const x2 = Math.max(ms.startX, clientX);
    const y2 = Math.max(ms.startY, clientY);

    const w1 = computeWorldFromClient(x1, y1);
    const w2 = computeWorldFromClient(x2, y2);
    if (!w1 || !w2) return;

    const roots = collectFamiliesInWorldRect(useCanvasStore.getState(), {
      x1: Math.min(w1.x, w2.x),
      y1: Math.min(w1.y, w2.y),
      x2: Math.max(w1.x, w2.x),
      y2: Math.max(w1.y, w2.y),
    });
    setSelectedFamilyRootIds(roots);
  };

  const isCanvasBackgroundTarget = (target: HTMLElement) =>
    !target.closest("[data-canvas-card]") &&
    !target.closest("[data-canvas-artifact]") &&
    !target.closest("[data-canvas-text-label]") &&
    !target.closest("[data-canvas-landing]") &&
    !target.closest("[data-group-summary-icon]");

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (placementRef.current || textPlacementRef.current) return;
    if (useCanvasStore.getState().plugDrag) return;
    const target = e.target as HTMLElement;
    if (!isCanvasBackgroundTarget(target)) return;
    setContextMenu(null);
    if (e.button !== 0) return;

    const el = e.currentTarget as HTMLDivElement;
    el.setPointerCapture(e.pointerId);

    if (spaceHeldRef.current) {
      panState.current = {
        pointerId: e.pointerId,
        lastX: e.clientX,
        lastY: e.clientY,
      };
      return;
    }

    marqueeState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
    };
    setMarqueeRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
    clearSelection();
    selectCanvasArtifact(null);
    selectCanvasTextLabel(null);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    canvasPointerRef.current = { x: e.clientX, y: e.clientY };

    const ms = marqueeState.current;
    if (ms && ms.pointerId === e.pointerId) {
      const x = Math.min(ms.startX, e.clientX);
      const y = Math.min(ms.startY, e.clientY);
      const w = Math.abs(e.clientX - ms.startX);
      const h = Math.abs(e.clientY - ms.startY);
      setMarqueeRect({ x, y, w, h });
      if (w >= MARQUEE_MIN_DRAG_PX || h >= MARQUEE_MIN_DRAG_PX) {
        applyMarqueeAt(e.clientX, e.clientY);
      }
      return;
    }

    const ps = panState.current;
    if (!ps || ps.pointerId !== e.pointerId) return;
    const dx = e.clientX - ps.lastX;
    const dy = e.clientY - ps.lastY;
    ps.lastX = e.clientX;
    ps.lastY = e.clientY;
    markUserViewportInteraction();
    panBy(dx, dy);
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const ms = marqueeState.current;
    if (ms && ms.pointerId === e.pointerId) {
      const w = Math.abs(e.clientX - ms.startX);
      const h = Math.abs(e.clientY - ms.startY);
      if (w >= MARQUEE_MIN_DRAG_PX || h >= MARQUEE_MIN_DRAG_PX) {
        applyMarqueeAt(e.clientX, e.clientY);
      } else {
        clearSelection();
      }
      marqueeState.current = null;
      setMarqueeRect(null);
      try {
        (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      return;
    }

    const ps = panState.current;
    if (!ps || ps.pointerId !== e.pointerId) return;
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    panState.current = null;
  };

  const handleWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    if (!shouldCanvasWheelZoom(e.target)) return;

    // Ctrl/Meta + wheel = zoom (also trackpad pinch comes through as ctrl+wheel).
    // Plain wheel = also zoom on the canvas to keep the interaction simple in V1.
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pivotX = e.clientX - rect.left;
    const pivotY = e.clientY - rect.top;
    const intensity = e.ctrlKey || e.metaKey ? 0.0125 : 0.0015;
    const factor = Math.exp(-e.deltaY * intensity);
    markUserViewportInteraction();
    zoomAt(factor, pivotX, pivotY);
  };

  // Dot grid that pans and scales with the viewport.
  const dotSize = 22 * viewport.scale;
  const offsetX = viewport.x % dotSize;
  const offsetY = viewport.y % dotSize;

  return (
    <div
      ref={containerRef}
      data-canvas-container
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
      onDragOver={allowSidebarDrop}
      onDrop={handleSidebarDrop}
      className={`relative h-full w-full overflow-hidden bg-canvas-bg select-none touch-none ${
        placement || textPlacement
          ? "cursor-crosshair"
          : spaceHeld
            ? "cursor-grab active:cursor-grabbing"
            : "cursor-crosshair"
      }`}
      style={{
        backgroundImage:
          "radial-gradient(circle, var(--dot-color) 1px, transparent 1px)",
        backgroundSize: `${dotSize}px ${dotSize}px`,
        backgroundPosition: `${offsetX}px ${offsetY}px`,
      }}
    >
      <CanvasViewport>
        <PlugConnectorLayer />
        {groupList.map((group) => (
          <GroupBounds key={group.id} group={group} />
        ))}
        {/* R4c — unified render via ComponentRenderer dispatch on kind */}
        {componentOrder.map((id) => {
          const component = components[id];
          if (!component) return null;
          return <ComponentRenderer key={id} component={component} />;
        })}
        {canvasTextLabelOrder.map((id) => {
          const label = canvasTextLabels[id];
          if (!label) return null;
          return (
            <CanvasTextLabelNode
              key={id}
              label={label}
              startEditing={autoEditLabelId === id}
            />
          );
        })}
        {groupList.map((group) =>
          group.summaryMarkdown ? (
            <GroupSummaryIcon key={`summary-icon-${group.id}`} group={group} />
          ) : null,
        )}
        <Connections />
        {/* R5c — manual v2 connections drawn from local store, atop v1 connections */}
        <V2Connections />
        {placement && <GhostCard world={placement} />}
        {textPlacement && <GhostTextLabel world={textPlacement} />}
      </CanvasViewport>
      {/* R5c — registers the connect-drop handler and renders the mode modal */}
      <V2ConnectDropManager />
      {showLanding && !placement && landingCardId && (
        <div
          className="absolute left-0 top-0 z-40 origin-top-left will-change-transform"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          }}
        >
          <CanvasLanding cardId={landingCardId} />
        </div>
      )}
      <SelectionOverlay rect={marqueeRect} />
      <SelectionToolbar />
      {contextMenu && (
        <CanvasContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onAddText={handleAddTextAtContextMenu}
        />
      )}
    </div>
  );
}

function GhostTextLabel({ world }: { world: PlacementState }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute font-medium leading-tight text-canvas-ink/50"
      style={{
        left: world.x,
        top: world.y - CANVAS_TEXT_LABEL_FONT_SIZE / 2,
        fontSize: CANVAS_TEXT_LABEL_FONT_SIZE,
      }}
    >
      Text
    </div>
  );
}

function GhostCard({ world }: { world: PlacementState }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute rounded-2xl border border-dashed border-canvas-border bg-canvas-card/85 shadow-card"
      style={{
        left: world.x - CARD_WIDTH / 2,
        top: world.y - EMPTY_CARD_HEIGHT / 2,
        width: CARD_WIDTH,
      }}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-end gap-0 rounded-2xl border border-dashed border-canvas-border/80 bg-canvas-card/90 px-2 py-2">
          <span className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-canvas-bg text-[20px] font-light text-canvas-muted">
            +
          </span>
          <span className="mx-1 mb-2 h-6 w-px shrink-0 bg-canvas-border" aria-hidden />
          <span className="min-w-0 flex-1 py-2 text-[14px] text-canvas-muted/60">
            Ask anything
          </span>
          <SendIconPreview className="opacity-80" />
        </div>
        <p className="mt-2 text-center text-[11px] text-canvas-muted">
          Click to place, Esc to cancel
        </p>
      </div>
    </div>
  );
}
