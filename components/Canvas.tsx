"use client";

import {
  PointerEvent as ReactPointerEvent,
  MutableRefObject,
  ReactNode,
  RefObject,
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  collectCanvasItemsInWorldRect,
  mergeCanvasSelections,
  type CanvasSelection,
} from "@/lib/canvasSelection";
import {
  applyContextMenuSelection,
  canCopyCanvasSelection,
  canRemoveCanvasSelection,
  hasCanvasSelection,
  isContextHitInSelection,
  resolveCanvasContextHit,
} from "@/lib/canvasContextSelection";
import {
  readCanvasClipboardFromDataTransfer,
} from "@/lib/canvasClipboard";
import { getLatestVersion } from "@/lib/sessionArtifacts";
import {
  allowSidebarDrop,
  parseSidebarDragPayload,
  uploadedToPending,
} from "@/lib/sidebarDnD";
import { DEFAULT_GIF_WIDTH } from "@/lib/canvasGifBounds";
import { DEFAULT_3D_WIDTH } from "@/lib/canvas3dBounds";
import { DEFAULT_ASSET_IMAGE_WIDTH, getCanvasAssetBounds } from "@/lib/canvasAssetBounds";
import { CANVAS_SKILL_SIZE } from "@/lib/canvasSkillBounds";
import {
  uploadAssetFiles,
  type AssetUploadError,
} from "@/lib/attachments";
import { showUploadErrorsToast } from "@/lib/uploadErrorToast";
import { isAudioFile } from "@/lib/audioArtifact";
import { getAudioFilesFromDataTransfer } from "@/lib/audioFileImport";
import { getThreeDFilesFromDataTransfer } from "@/lib/threeDFileImport";
import { isThreeDModelFile } from "@/lib/threeDArtifact";
import {
  CANVAS_ARTIFACT_WIDTH,
  CANVAS_TEXT_LABEL_FONT_SIZE,
  useCanvasStore,
  type SpawnCanvasGifInput,
  type SpawnCanvas3DInput,
} from "@/lib/store";
import { getArtifactBounds, getDropArtifactSize } from "@/lib/canvasNodeBounds";
import { payloadToArtifactKind } from "@/lib/artifactTypes";
import {
  createManualArtifactPayload,
  type ManualArtifactType,
} from "@/lib/manualArtifactDefaults";
import { MANUAL_ARTIFACT_MENU_ITEMS } from "@/lib/manualArtifactMenu";
import { ArtifactTypeIcon } from "@/components/artifacts/ArtifactTypeIcon";
import { viewportCenteredOnWorldPoint } from "@/lib/viewport";
import { fetchYoutubeMeta, isYoutubeUrl } from "@/lib/youtube";
import {
  CanvasContextMenu,
  ContextMenuState,
} from "@/components/CanvasContextMenu";
import { CanvasLandingOverlay } from "@/components/CanvasLandingOverlay";
import { CanvasBackgroundLayer } from "@/components/canvasBackgrounds/CanvasBackgroundLayer";
import { CanvasViewport } from "@/components/CanvasViewport";
import { CanvasArtifactNode } from "@/components/CanvasArtifactNode";
import { CanvasAssetNode } from "@/components/CanvasAssetNode";
import { CanvasGifNode } from "@/components/CanvasGifNode";
import { Canvas3DNode } from "@/components/Canvas3DNode";
import { CanvasSkillNode } from "@/components/CanvasSkillNode";
import {
  CANVAS_TEXT_EDITOR_ATTR,
  CanvasTextLabelNode,
} from "@/components/CanvasTextLabelNode";
import { CanvasDrawingLayer } from "@/components/CanvasDrawingLayer";
import { Card } from "@/components/Card";
import { Connections } from "@/components/Connections";
import { ConnectionsCanvas } from "@/components/ConnectionsCanvas";
import { useArtifactStyle } from "@/components/ArtifactStyleScope";
import { useGroupBento } from "@/hooks/useGroupBento";
import { setMarqueeSelecting } from "@/lib/gesture/gestureLayer";

/** Kill-switch: restore the legacy SVG connections renderer for one release. */
const SVG_CONNECTIONS = process.env.NEXT_PUBLIC_SVG_CONNECTIONS === "1";
import { ArtifactPlugConnections } from "@/components/plugs/ArtifactPlugConnections";
import { AssetPlugConnections } from "@/components/plugs/AssetPlugConnections";
import { SkillPlugConnections } from "@/components/plugs/SkillPlugConnections";
import { GroupPlugConnections } from "@/components/plugs/GroupPlugConnections";
import { PlugConnectorLayer } from "@/components/plugs/PlugConnectorLayer";
import { useCanvasFontLoader } from "@/hooks/useCanvasFontLoader";
import { usePlugDragSession } from "@/hooks/usePlugDragSession";
import { getCanvasFontPreviewStyles } from "@/lib/canvasFonts/previewStyles";
import { useCanvasPan } from "@/hooks/useCanvasPan";
import { useCanvasViewportInput } from "@/hooks/useCanvasViewportInput";
import { useViewportCulling } from "@/hooks/useViewportCulling";
import { useCaptureMountAllNodes } from "@/lib/canvasSnapshotThumbnail/captureMountAll";
import { focusCanvasArtifact } from "@/lib/canvasArtifacts";
import { createUrlArtifactFromText } from "@/lib/createUrlArtifact";
import {
  fetchImageUrlAsFile,
  getImageFilesFromDataTransfer,
  isExternalImageDrag,
  isImageMime,
  isImageUrl,
  resolveImageFileFromDataTransfer,
} from "@/lib/canvasImageImport";
import { focusCanvasCard } from "@/lib/canvasFocus";
import { isCanvasHotkeyBlockedByTarget } from "@/lib/canvasHotkeys";
import { RESOLVED_CANVAS_TUNING } from "@/lib/canvasTuning";
import { landingStackViewportCenter } from "@/lib/canvasOrigin";
import {
  isViewportBootstrapApplied,
  isViewportRestoredFromSnapshot,
  markViewportBootstrapApplied,
  resetViewportBootstrap,
} from "@/lib/canvasViewportBootstrap";
import {
  requestCanvasFocus,
} from "@/lib/canvasViewportGuard";
import { useHiddenCardIds } from "@/hooks/useHiddenCardIds";
import {
  getLandingCardId,
  pickCanvasLandingInput,
  shouldShowCanvasLanding,
} from "@/lib/canvasLandingState";
import { GroupBounds } from "@/components/GroupBounds";
import { GroupSummaryIcon } from "@/components/GroupSummaryIcon";
import { SelectionToolbar } from "@/components/SelectionToolbar";
import { SendIconPreview } from "@/components/SendIconButton";
import {
  usePersistenceReady,
  useAuth,
  useCanEditCanvas,
} from "@/components/AuthProvider";
import { CanvasPieMenu } from "@/components/CanvasPieMenu";
import { useCanvasPieMenu } from "@/hooks/useCanvasPieMenu";
import { CollaboratorCursors } from "@/components/CollaboratorCursors";
import { isConversationCard } from "@/lib/conversationCard";

const MARQUEE_MIN_DRAG_PX = 6;

interface PlacementState {
  x: number;
  y: number;
}

interface ImagePlacementState extends PlacementState {
  assetId: string;
  previewUrl: string;
  aspectRatio: number;
}

interface GifPlacementState extends SpawnCanvasGifInput, PlacementState {}

interface ThreeDPlacementState extends SpawnCanvas3DInput, PlacementState {}

interface ArtifactPlacementState extends PlacementState {
  artifactType: ManualArtifactType;
}

/**
 * Mount-once keep-alive for culled STATEFUL nodes (artifacts, assets, gifs,
 * 3D). Culling used to UNMOUNT offscreen nodes; every 240px band round-trip
 * destroyed and recreated the subtree — iframes (website/embed/google-doc)
 * reloaded from the network, WebGL contexts rebuilt, media playback reset,
 * and content visibly "re-rendered" on pan/zoom. Now such a node mounts the
 * first time it becomes visible and is thereafter only hidden with
 * content-visibility:hidden — zero style/layout/raster cost while offscreen,
 * but DOM (and iframe/player state) survives, so revisiting a region shows
 * content instantly, exactly as it was.
 *
 * NOT display:none: that collapses every box to 0×0, so ResizeObservers fire
 * with zero size (ParentSize unmounted ECharts, Leaflet re-laid its tiles)
 * and CSS animations restart — charts, maps and staggered table/todo rows
 * replayed their load-in every time they scrolled back into view.
 * content-visibility keeps the last layout, so a node animates once per page
 * load. The wrapper is a zero-size box pinned at the viewport origin (same
 * as CanvasViewport), so children resolve their absolute positions exactly
 * as before; with z-index auto it adds no stacking context while visible.
 *
 * Idle warm-up (useViewportCulling's `warm`) mounts nodes here before they
 * are ever on screen — fully rendered, hidden — so the first visit is as
 * instant as a revisit.
 *
 * While culling is enabled but the first visible set hasn't computed yet
 * (one frame at load), callers pass visible=false — a null-window render
 * would otherwise pin the ENTIRE canvas in the DOM forever.
 */
function CulledKeepAlive({
  visible,
  warm,
  captureMount,
  children,
}: {
  visible: boolean;
  /** Warmed by the idle pass: mount now (hidden) so a reveal is instant. */
  warm: boolean;
  /**
   * Shown only for a dashboard-thumbnail capture. Deliberately does NOT count
   * as "seen": otherwise one capture would pin every artifact on the canvas
   * (and load every offscreen iframe/player) for the rest of the session.
   */
  captureMount: boolean;
  children: ReactNode;
}) {
  const seenRef = useRef(false);
  if (visible || warm) seenRef.current = true;
  if (!seenRef.current && !captureMount) return null;
  return <ResidentBox visible={visible || captureMount}>{children}</ResidentBox>;
}

/**
 * Resident wrapper for plain-DOM nodes (cards, skills, labels): mounted while
 * in the culling band OR warm, content-visibility:hidden when only warm.
 * Unlike CulledKeepAlive it is not sticky — a node that leaves both sets
 * unmounts, which keeps the resident set bounded by WARM_NODE_BUDGET on very
 * large canvases. Always rendered (even with culling off) so a node never
 * gains or loses a parent element, which would remount it.
 */
function CulledResident({
  visible,
  warm,
  children,
}: {
  visible: boolean;
  warm: boolean;
  children: ReactNode;
}) {
  if (!visible && !warm) return null;
  return <ResidentBox visible={visible}>{children}</ResidentBox>;
}

/**
 * The culling wrapper box. A node mounted while offscreen (idle warm-up)
 * renders normally for its first two frames before hiding: content under
 * content-visibility:hidden is never laid out, so ResizeObserver-sized
 * content (charts, maps) would otherwise first draw at reveal time.
 */
function ResidentBox({
  visible,
  children,
}: {
  visible: boolean;
  children: ReactNode;
}) {
  const [laidOut, setLaidOut] = useState(false);
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setLaidOut(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);
  return (
    <div
      className="absolute left-0 top-0"
      style={{ contentVisibility: visible || !laidOut ? "visible" : "hidden" }}
    >
      {children}
    </div>
  );
}

/**
 * The culled node list, isolated from Canvas. Culling commits a new visible
 * set every time a node crosses the padding band — several times a second
 * during a steady pan. Owning that state here means those commits re-render
 * only this list (memoized nodes bail out; only entering/leaving ones do
 * work) instead of the whole 2k-line Canvas and every chrome layer under it
 * (pie menu, selection toolbar, cursors, plug layers, drawing layer).
 */
const CanvasNodeLayer = memo(function CanvasNodeLayer({
  containerRef,
  landingCardId,
  autoEditLabelId,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  landingCardId: string | null;
  autoEditLabelId: string | null;
}) {
  const {
    enabled: cullingEnabled,
    visible: visibleNodes,
    warm: warmNodes,
  } = useViewportCulling(containerRef, { landingCardId });
  // A dashboard-thumbnail capture renders the whole canvas — mount every node
  // for its duration (see captureMountAll).
  const captureMountAll = useCaptureMountAllNodes();
  const cullCards = cullingEnabled && !captureMountAll;
  const hiddenCardIds = useHiddenCardIds();
  const cards = useCanvasStore((s) => s.cards);
  const cardOrder = useCanvasStore((s) => s.cardOrder);
  const canvasArtifactNodes = useCanvasStore((s) => s.canvasArtifactNodes);
  const canvasArtifactOrder = useCanvasStore((s) => s.canvasArtifactOrder);
  const canvasAssetNodes = useCanvasStore((s) => s.canvasAssetNodes);
  const canvasAssetOrder = useCanvasStore((s) => s.canvasAssetOrder);
  const canvasGifNodes = useCanvasStore((s) => s.canvasGifNodes);
  const canvasGifOrder = useCanvasStore((s) => s.canvasGifOrder);
  const canvas3DNodes = useCanvasStore((s) => s.canvas3DNodes);
  const canvas3DOrder = useCanvasStore((s) => s.canvas3DOrder);
  const canvasSkillNodes = useCanvasStore((s) => s.canvasSkillNodes);
  const canvasSkillOrder = useCanvasStore((s) => s.canvasSkillOrder);
  const canvasTextLabels = useCanvasStore((s) => s.canvasTextLabels);
  const canvasTextLabelOrder = useCanvasStore((s) => s.canvasTextLabelOrder);

  // Whatever the user clicks or selects stacks above everything else.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const raise = useCanvasStore.getState().raiseCanvasNodes;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      const hit = target?.closest<HTMLElement>(
        "[data-canvas-card], [data-canvas-node-id]",
      );
      const id = hit?.dataset.canvasCard ?? hit?.dataset.canvasNodeId;
      if (id) raise([id]);
    };
    container.addEventListener("pointerdown", onPointerDown, true);
    const unsubscribe = useCanvasStore.subscribe((state, prev) => {
      if (state.canvasSelection === prev.canvasSelection) return;
      const before = new Set(prev.canvasSelection.map((item) => item.id));
      const added = state.canvasSelection
        .filter((item) => !before.has(item.id))
        .map((item) => item.id);
      if (added.length > 0) raise(added);
    });
    return () => {
      container.removeEventListener("pointerdown", onPointerDown, true);
      unsubscribe();
    };
  }, [containerRef]);

  return (
    <>
      {cardOrder.map((id) => {
        const card = cards[id];
        if (!card) return null;
        if (hiddenCardIds.has(id)) return null;
        return (
          <CulledResident
            key={id}
            visible={!cullCards || !visibleNodes || visibleNodes.cards.has(id)}
            warm={warmNodes?.cards.has(id) ?? false}
          >
            <Card card={card} />
          </CulledResident>
        );
      })}
      {canvasArtifactOrder.map((id) => {
        const node = canvasArtifactNodes[id];
        if (!node) return null;
        return (
          <CulledKeepAlive
            key={id}
            captureMount={captureMountAll}
            visible={
              !cullingEnabled || (visibleNodes?.artifacts.has(id) ?? false)
            }
            warm={warmNodes?.artifacts.has(id) ?? false}
          >
            <CanvasArtifactNode node={node} />
          </CulledKeepAlive>
        );
      })}
      {canvasAssetOrder.map((id) => {
        const node = canvasAssetNodes[id];
        if (!node) return null;
        return (
          <CulledKeepAlive
            key={id}
            captureMount={captureMountAll}
            visible={
              !cullingEnabled || (visibleNodes?.assets.has(id) ?? false)
            }
            warm={warmNodes?.assets.has(id) ?? false}
          >
            <CanvasAssetNode node={node} />
          </CulledKeepAlive>
        );
      })}
      {canvasGifOrder.map((id) => {
        const node = canvasGifNodes[id];
        if (!node) return null;
        return (
          <CulledKeepAlive
            key={id}
            captureMount={captureMountAll}
            visible={
              !cullingEnabled || (visibleNodes?.gifs.has(id) ?? false)
            }
            warm={warmNodes?.gifs.has(id) ?? false}
          >
            <CanvasGifNode node={node} />
          </CulledKeepAlive>
        );
      })}
      {canvas3DOrder.map((id) => {
        const node = canvas3DNodes[id];
        if (!node) return null;
        return (
          <CulledKeepAlive
            key={id}
            captureMount={captureMountAll}
            visible={
              !cullingEnabled || (visibleNodes?.threeD.has(id) ?? false)
            }
            warm={warmNodes?.threeD.has(id) ?? false}
          >
            <Canvas3DNode node={node} />
          </CulledKeepAlive>
        );
      })}
      {canvasSkillOrder.map((id) => {
        const node = canvasSkillNodes[id];
        if (!node) return null;
        return (
          <CulledResident
            key={id}
            visible={!cullCards || !visibleNodes || visibleNodes.skills.has(id)}
            warm={warmNodes?.skills.has(id) ?? false}
          >
            <CanvasSkillNode node={node} />
          </CulledResident>
        );
      })}
      {canvasTextLabelOrder.map((id) => {
        const label = canvasTextLabels[id];
        if (!label) return null;
        return (
          <CulledResident
            key={id}
            visible={!cullCards || !visibleNodes || visibleNodes.labels.has(id)}
            warm={warmNodes?.labels.has(id) ?? false}
          >
            <CanvasTextLabelNode
              label={label}
              startEditing={autoEditLabelId === id}
            />
          </CulledResident>
        );
      })}
    </>
  );
});

export function Canvas({
  containerRef: externalContainerRef,
}: {
  containerRef?: RefObject<HTMLDivElement | null>;
} = {}) {
  const persistenceReady = usePersistenceReady();
  // Chapter groups stay packed as their members change size (lib/groupBento).
  const bodyFamily = useArtifactStyle().pack.bodyFamily ?? null;
  useGroupBento(bodyFamily === "frost" ? "frost" : null);
  const {
    user,
    authLoading,
    activeCanvasId,
    canvases,
    setCanvasThumbnail,
    presenceChannelRef,
    presenceChannelReady,
    onlineUserIds,
    isSwitchingCanvas,
  } = useAuth();
  const canvasBackgroundStyle = useCanvasStore((s) => s.canvasBackgroundStyle);
  const cards = useCanvasStore((s) => s.cards);
  const cardOrder = useCanvasStore((s) => s.cardOrder);
  const connectionsBehindCards = useCanvasStore((s) =>
    s.cardOrder.some((id) => isConversationCard(s.cards[id])),
  );
  const createRootCard = useCanvasStore((s) => s.createRootCard);
  const updateCard = useCanvasStore((s) => s.updateCard);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const uploadedAttachments = useCanvasStore((s) => s.uploadedAttachments);
  const canvasAssets = useCanvasStore((s) => s.canvasAssets);
  const canvasAssetOrder = useCanvasStore((s) => s.canvasAssetOrder);
  const addCanvasAsset = useCanvasStore((s) => s.addCanvasAsset);
  const spawnCanvasAsset = useCanvasStore((s) => s.spawnCanvasAsset);
  const canvasSkillOrder = useCanvasStore((s) => s.canvasSkillOrder);
  const spawnCanvasSkill = useCanvasStore((s) => s.spawnCanvasSkill);
  const sessionArtifacts = useCanvasStore((s) => s.sessionArtifacts);
  const canvasArtifactOrder = useCanvasStore((s) => s.canvasArtifactOrder);
  const canvasTextLabelOrder = useCanvasStore((s) => s.canvasTextLabelOrder);
  const canvasStrokes = useCanvasStore((s) => s.canvasStrokes);
  const canvasStrokeOrder = useCanvasStore((s) => s.canvasStrokeOrder);
  const activeCanvasStrokeId = useCanvasStore((s) => s.activeCanvasStrokeId);
  const pencilToolActive = useCanvasStore((s) => s.pencilToolActive);
  const setPencilToolActive = useCanvasStore((s) => s.setPencilToolActive);
  const beginCanvasStroke = useCanvasStore((s) => s.beginCanvasStroke);
  const appendCanvasStrokePoint = useCanvasStore((s) => s.appendCanvasStrokePoint);
  const finishCanvasStroke = useCanvasStore((s) => s.finishCanvasStroke);
  const canvasGifOrder = useCanvasStore((s) => s.canvasGifOrder);
  const canvas3DOrder = useCanvasStore((s) => s.canvas3DOrder);
  const removeSelectedFromCanvas = useCanvasStore(
    (s) => s.removeSelectedFromCanvas,
  );
  const spawnCanvasTextLabel = useCanvasStore((s) => s.spawnCanvasTextLabel);
  const spawnCanvasGif = useCanvasStore((s) => s.spawnCanvasGif);
  const spawnCanvas3D = useCanvasStore((s) => s.spawnCanvas3D);
  const setGifPickerOpen = useCanvasStore((s) => s.setGifPickerOpen);
  const imagePlacementAssetId = useCanvasStore((s) => s.imagePlacementAssetId);
  const gifPlacementRequest = useCanvasStore((s) => s.gifPlacementRequest);
  const canvas3dPlacementRequest = useCanvasStore(
    (s) => s.canvas3dPlacementRequest,
  );
  const artifactPlacementRequest = useCanvasStore((s) => s.artifactPlacementRequest);
  const createManualArtifact = useCanvasStore((s) => s.createManualArtifact);
  const createVideoArtifactFromUrl = useCanvasStore(
    (s) => s.createVideoArtifactFromUrl,
  );
  const createAudioArtifactFromFile = useCanvasStore(
    (s) => s.createAudioArtifactFromFile,
  );
  const createThreeDArtifactFromFile = useCanvasStore(
    (s) => s.createThreeDArtifactFromFile,
  );
  const clearSelection = useCanvasStore((s) => s.clearSelection);
  const groups = useCanvasStore((s) => s.groups);
  const groupList = Object.values(groups);
  const chatsGloballyHidden = useCanvasStore((s) => s.chatsGloballyHidden);
  const bodyFontId = useCanvasStore((s) => s.canvasPreviewBodyFontId);
  const displayFontId = useCanvasStore((s) => s.canvasPreviewDisplayFontId);
  useCanvasFontLoader(bodyFontId, displayFontId);
  const fontPreviewStyle = getCanvasFontPreviewStyles(bodyFontId, displayFontId);

  const showLanding = shouldShowCanvasLanding(
    pickCanvasLandingInput({
      cards,
      cardOrder,
      canvasArtifactOrder,
      canvasAssetOrder,
      canvasGifOrder,
      canvas3DOrder,
      canvasSkillOrder,
      canvasTextLabelOrder,
    }),
  );
  const landingCardId = getLandingCardId(cards, cardOrder);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const setContainerRef = (node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (externalContainerRef) {
      (externalContainerRef as MutableRefObject<HTMLDivElement | null>).current =
        node;
    }
    setContainerReady(node !== null);
  };
  const landingViewportCenteredRef = useRef(false);
  const seedingRef = useRef(false);
  const [containerReady, setContainerReady] = useState(false);

  useEffect(() => {
    if (!pencilToolActive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setPencilToolActive(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pencilToolActive, setPencilToolActive]);

  useEffect(() => {
    if (cardOrder.length === 0) {
      seedingRef.current = false;
      landingViewportCenteredRef.current = false;
    }
  }, [cardOrder.length]);

  usePlugDragSession(containerRef);
  useCanvasViewportInput(containerRef);
  const queuePan = useCanvasPan();
  const panState = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(
    null,
  );
  const drawingState = useRef<{ pointerId: number; strokeId: string } | null>(
    null,
  );
  const marqueeState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    /** Selection at marquee start — preserved for Shift/Ctrl additive mode. */
    baseSelection: CanvasSelection | null;
  } | null>(null);
  const spaceHeldRef = useRef(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  // Marquee: React state only tracks ACTIVE (mount overlay / hide toolbar);
  // the rubber-band rect is driven imperatively per frame, and the expensive
  // spatial query + selection write are rAF-coalesced with a set-equality
  // skip — the old per-pointermove setState + full-canvas query was a top
  // jank source during multi-select.
  const [marqueeActive, setMarqueeActive] = useState(false);
  const marqueeOverlayRef = useRef<HTMLDivElement | null>(null);
  const marqueePendingRef = useRef<{ x: number; y: number } | null>(null);
  const marqueeRafRef = useRef(0);
  const lastMarqueeSelectionRef = useRef<string>("");
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
  const [imagePlacement, setImagePlacement] =
    useState<ImagePlacementState | null>(null);
  const [gifPlacement, setGifPlacement] = useState<GifPlacementState | null>(
    null,
  );
  const [threeDPlacement, setThreeDPlacement] =
    useState<ThreeDPlacementState | null>(null);
  const [artifactPlacement, setArtifactPlacement] =
    useState<ArtifactPlacementState | null>(null);
  const [placementScreen, setPlacementScreen] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [autoEditLabelId, setAutoEditLabelId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const placementRef = useRef<PlacementState | null>(null);
  const textPlacementRef = useRef<PlacementState | null>(null);
  const imagePlacementRef = useRef<ImagePlacementState | null>(null);
  const gifPlacementRef = useRef<GifPlacementState | null>(null);
  const threeDPlacementRef = useRef<ThreeDPlacementState | null>(null);
  const artifactPlacementRef = useRef<ArtifactPlacementState | null>(null);
  useEffect(() => {
    placementRef.current = placement;
  }, [placement]);
  useEffect(() => {
    textPlacementRef.current = textPlacement;
  }, [textPlacement]);
  useEffect(() => {
    imagePlacementRef.current = imagePlacement;
  }, [imagePlacement]);
  useEffect(() => {
    gifPlacementRef.current = gifPlacement;
  }, [gifPlacement]);
  useEffect(() => {
    threeDPlacementRef.current = threeDPlacement;
  }, [threeDPlacement]);
  useEffect(() => {
    artifactPlacementRef.current = artifactPlacement;
  }, [artifactPlacement]);

  const canvasPlacementRequest = useCanvasStore((s) => s.canvasPlacementRequest);

  const beginPlacementAtCursor = (tool: "question" | "text") => {
    if (useCanvasStore.getState().canvasReadOnly) return;
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
    setImagePlacement(null);
    setGifPlacement(null);
    setThreeDPlacement(null);
    setArtifactPlacement(null);
    if (tool === "question") {
      setTextPlacement(null);
      setPlacement(pos);
    } else {
      setPlacement(null);
      setTextPlacement(pos);
    }
  };

  const beginArtifactPlacementAtCursor = (artifactType: ManualArtifactType) => {
    if (useCanvasStore.getState().canvasReadOnly) return;
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
    setPlacement(null);
    setTextPlacement(null);
    setImagePlacement(null);
    setGifPlacement(null);
    setThreeDPlacement(null);
    setArtifactPlacement({ artifactType, ...pos });
    setPlacementScreen({ x: clientX, y: clientY });
  };

  useEffect(() => {
    if (!artifactPlacement) setPlacementScreen(null);
  }, [artifactPlacement]);

  // Hold-Z pie menu — north fires question placement, west fires text
  // placement (same code path as the Q/T shortcuts and toolbar buttons).
  const canEditCanvas = useCanEditCanvas();
  const { pieState, pieStateRef, closePie } = useCanvasPieMenu({
    containerRef,
    enabled: canEditCanvas,
    isBlocked: () =>
      Boolean(
        placementRef.current ||
          textPlacementRef.current ||
          imagePlacementRef.current ||
          gifPlacementRef.current ||
          threeDPlacementRef.current ||
          artifactPlacementRef.current ||
          marqueeState.current ||
          panState.current ||
          useCanvasStore.getState().plugDrag,
      ),
    getCursor: () => canvasPointerRef.current ?? cursorRef.current,
    onSelect: (sector) => {
      if (sector === "north") beginPlacementAtCursor("question");
      else if (sector === "east") beginArtifactPlacementAtCursor("stickynote");
      else if (sector === "west") beginPlacementAtCursor("text");
    },
  });

  const beginImagePlacementAtCursor = (asset: {
    id: string;
    publicUrl: string;
    aspectRatio?: number;
  }) => {
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
    setPlacement(null);
    setTextPlacement(null);
    setGifPlacement(null);
    setThreeDPlacement(null);
    setArtifactPlacement(null);
    setImagePlacement({
      assetId: asset.id,
      previewUrl: asset.publicUrl,
      aspectRatio: asset.aspectRatio && asset.aspectRatio > 0 ? asset.aspectRatio : 1,
      ...pos,
    });
  };

  const beginGifPlacementAtCursor = (input: SpawnCanvasGifInput) => {
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
    setPlacement(null);
    setTextPlacement(null);
    setImagePlacement(null);
    setThreeDPlacement(null);
    setArtifactPlacement(null);
    setGifPlacement({ ...input, ...pos });
  };

  const begin3DPlacementAtCursor = (input: SpawnCanvas3DInput) => {
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
    setPlacement(null);
    setTextPlacement(null);
    setImagePlacement(null);
    setGifPlacement(null);
    setThreeDPlacement(null);
    setArtifactPlacement(null);
    setThreeDPlacement({ ...input, ...pos });
  };

  useEffect(() => {
    if (!canvasPlacementRequest) return;
    const tool = canvasPlacementRequest;
    useCanvasStore.setState({ canvasPlacementRequest: null });
    if (tool === "question" || tool === "text") {
      beginPlacementAtCursor(tool);
    }
  }, [canvasPlacementRequest]);

  useEffect(() => {
    if (!imagePlacementAssetId) return;
    const asset = useCanvasStore.getState().canvasAssets[imagePlacementAssetId];
    useCanvasStore.setState({ imagePlacementAssetId: null });
    if (!asset) return;
    beginImagePlacementAtCursor(asset);
  }, [imagePlacementAssetId]);

  useEffect(() => {
    if (!gifPlacementRequest) return;
    const input = gifPlacementRequest;
    useCanvasStore.setState({ gifPlacementRequest: null });
    beginGifPlacementAtCursor(input);
  }, [gifPlacementRequest]);

  useEffect(() => {
    if (!canvas3dPlacementRequest) return;
    const input = canvas3dPlacementRequest;
    useCanvasStore.setState({ canvas3dPlacementRequest: null });
    begin3DPlacementAtCursor(input);
  }, [canvas3dPlacementRequest]);

  useEffect(() => {
    if (!artifactPlacementRequest) return;
    const pick = artifactPlacementRequest;
    useCanvasStore.setState({ artifactPlacementRequest: null });
    if (pick.kind === "question") {
      beginPlacementAtCursor("question");
    } else {
      beginArtifactPlacementAtCursor(pick.artifactType);
    }
  }, [artifactPlacementRequest]);

  useEffect(() => {
    const mode = placement
      ? "question"
      : artifactPlacement
        ? "artifact"
        : textPlacement || imagePlacement || gifPlacement || threeDPlacement
          ? "text"
          : null;
    if (useCanvasStore.getState().activeCanvasPlacement !== mode) {
      useCanvasStore.setState({ activeCanvasPlacement: mode });
    }
  }, [placement, artifactPlacement, textPlacement, imagePlacement, gifPlacement, threeDPlacement]);

  // Cmd/Ctrl+A selects every chapter (group) on a canvas that has them, so a
  // whole chapter grid can be dragged as one. Text fields keep their own
  // select-all.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== "a") return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }
      const st = useCanvasStore.getState();
      const groupIds = Object.keys(st.groups);
      if (groupIds.length < 2) return;
      e.preventDefault();
      st.setSelectedGroupIds(groupIds);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

  const rootCardPositionAtPointer = (worldX: number, worldY: number) => {
    const tuning = RESOLVED_CANVAS_TUNING;
    return {
      x: worldX - tuning.cardWidth / 2,
      y: worldY - tuning.emptyCardHeight / 2,
    };
  };

  const maybeFocusNewCard = (cardId: string) => {
    requestCanvasFocus(() => focusCanvasCard(cardId));
  };

  // Seed the home card for confirmed guests only — never while auth or cloud load is pending.
  useLayoutEffect(() => {
    if (!containerReady) return;
    if (authLoading) return;
    if (user) return;
    if (!persistenceReady) return;
    const el = containerRef.current;
    if (!el) return;

    const seedIfEmpty = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const state = useCanvasStore.getState();
      if (state.cardOrder.length > 0 || seedingRef.current) return;

      seedingRef.current = true;
      resetViewportBootstrap();
      createRootCard({ x: 0, y: 0 });
      const focal = landingStackViewportCenter(RESOLVED_CANVAS_TUNING);
      setViewport(
        viewportCenteredOnWorldPoint(
          focal.x,
          focal.y,
          rect.width,
          rect.height,
          1,
        ),
      );
      markViewportBootstrapApplied();
    };

    seedIfEmpty();
    const ro = new ResizeObserver(seedIfEmpty);
    ro.observe(el);
    return () => ro.disconnect();
  }, [
    authLoading,
    cardOrder.length,
    containerReady,
    createRootCard,
    persistenceReady,
    setViewport,
    user,
  ]);

  // After persistence hydrates, center on the first card if we have not yet.
  useEffect(() => {
    if (!persistenceReady) return;

    const el = containerRef.current;
    if (!el) return;
    if (isViewportBootstrapApplied()) return;

    const bootstrap = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const state = useCanvasStore.getState();
      if (state.cardOrder.length === 0) return;
      if (isViewportBootstrapApplied()) return;

      if (isViewportRestoredFromSnapshot()) {
        markViewportBootstrapApplied();
        return;
      }

      const landingId = getLandingCardId(state.cards, state.cardOrder);
      if (landingId) {
        const focal = landingStackViewportCenter(RESOLVED_CANVAS_TUNING);
        setViewport(
          viewportCenteredOnWorldPoint(
            focal.x,
            focal.y,
            rect.width,
            rect.height,
            1,
          ),
        );
        markViewportBootstrapApplied();
        return;
      }

      const first = state.cards[state.cardOrder[0]];
      if (!first) return;

      const { cardWidth, emptyCardHeight } = RESOLVED_CANVAS_TUNING;
      const w = first.size?.w ?? cardWidth;
      const h = first.size?.h ?? emptyCardHeight;
      setViewport(
        viewportCenteredOnWorldPoint(
          first.position.x + w / 2,
          first.position.y + h / 2,
          rect.width,
          rect.height,
          1,
        ),
      );
      markViewportBootstrapApplied();
    };

    bootstrap();
  }, [persistenceReady, setViewport]);

  // Snap follow-up chains to measured content height after hydrate / topology changes.
  useEffect(() => {
    if (!persistenceReady) return;
    if (cardOrder.length === 0) return;
    const t = window.setTimeout(() => {
      useCanvasStore.getState().relayoutCanvasFromDom();
    }, 150);
    return () => window.clearTimeout(t);
  }, [persistenceReady, cardOrder.length]);

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
      if (landingViewportCenteredRef.current) return;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const scale = useCanvasStore.getState().viewport.scale;
      const tuning = RESOLVED_CANVAS_TUNING;
      const focal = landingStackViewportCenter(tuning);
      setViewport(
        viewportCenteredOnWorldPoint(
          focal.x,
          focal.y,
          rect.width,
          rect.height,
          scale,
        ),
      );
      landingViewportCenteredRef.current = true;
    };

    centerLanding();
    const ro = new ResizeObserver(centerLanding);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showLanding, setViewport]);

  // Track cursor position globally; also update ghost position when in
  // placement. Ghost state updates are rAF-coalesced: one batched React
  // commit per frame instead of up to six setState calls per mousemove
  // (placement modes only — plain cursor tracking stays a ref write).
  useEffect(() => {
    let rafId = 0;
    const flushGhosts = () => {
      rafId = 0;
      const pos = cursorRef.current;
      if (!pos) return;
      const anyPlacement =
        placementRef.current ||
        textPlacementRef.current ||
        imagePlacementRef.current ||
        gifPlacementRef.current ||
        threeDPlacementRef.current ||
        artifactPlacementRef.current;
      if (!anyPlacement) return;
      const world = computeWorldFromClient(pos.x, pos.y);
      if (!world) return;
      const at = placementWorld(world);
      if (placementRef.current) setPlacement(at);
      if (textPlacementRef.current) setTextPlacement(at);
      if (imagePlacementRef.current) {
        setImagePlacement((prev) => (prev ? { ...prev, ...at } : prev));
      }
      if (gifPlacementRef.current) {
        setGifPlacement((prev) => (prev ? { ...prev, ...at } : prev));
      }
      if (threeDPlacementRef.current) {
        setThreeDPlacement((prev) => (prev ? { ...prev, ...at } : prev));
      }
      if (artifactPlacementRef.current) {
        setPlacementScreen({ x: pos.x, y: pos.y });
        setArtifactPlacement((prev) => (prev ? { ...prev, ...at } : prev));
      }
    };
    const onMove = (e: MouseEvent) => {
      cursorRef.current = { x: e.clientX, y: e.clientY };
      if (
        !rafId &&
        (placementRef.current ||
          textPlacementRef.current ||
          imagePlacementRef.current ||
          gifPlacementRef.current ||
          threeDPlacementRef.current ||
          artifactPlacementRef.current)
      ) {
        rafId = requestAnimationFrame(flushGhosts);
      }
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  // Paste a YouTube URL onto the canvas background to create a video artifact.
  // Editable fields (textareas/inputs/contentEditable) keep native paste so the
  // text-component conversion and the question composer are not hijacked here.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.isContentEditable)
      ) {
        return;
      }
      const text = e.clipboardData?.getData("text/plain") ?? "";
      const url = text.trim();
      if (!isYoutubeUrl(url)) return;

      e.preventDefault();

      const cursor = cursorRef.current;
      const world = cursor
        ? computeWorldFromClient(cursor.x, cursor.y)
        : null;
      const center = useCanvasStore.getState().viewport;
      void (async () => {
        const meta = await fetchYoutubeMeta(url);
        const position = world
          ? {
              x: world.x - CANVAS_ARTIFACT_WIDTH / 2,
              y: world.y - 140,
            }
          : {
              x: -center.x / center.scale,
              y: -center.y / center.scale,
            };
        createVideoArtifactFromUrl(url, {
          title: meta.title,
          thumb: meta.thumb,
          position,
        });
      })();
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [createVideoArtifactFromUrl]);

  // Q (enter placement) / Esc (cancel placement). Capture phase so Q works as a
  // canvas tool shortcut even when an empty question field is focused.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // A text label being edited owns its keys: Escape closes the editor
      // (keeping the label selected) and Cmd/Ctrl+C copies the selected text.
      if (
        (e.target as HTMLElement | null)?.closest?.(
          `[${CANVAS_TEXT_EDITOR_ATTR}]`,
        )
      ) {
        return;
      }
      if (e.key === "Escape") {
        // Closing the pie consumes the press — it must not also clear the
        // canvas selection in the same keystroke.
        if (pieStateRef.current) {
          e.preventDefault();
          closePie();
          return;
        }
        if (placementRef.current) {
          e.preventDefault();
          setPlacement(null);
        }
        if (textPlacementRef.current) {
          e.preventDefault();
          setTextPlacement(null);
        }
        if (imagePlacementRef.current) {
          e.preventDefault();
          setImagePlacement(null);
        }
        if (gifPlacementRef.current) {
          e.preventDefault();
          setGifPlacement(null);
        }
        if (threeDPlacementRef.current) {
          e.preventDefault();
          setThreeDPlacement(null);
        }
        if (artifactPlacementRef.current) {
          e.preventDefault();
          setArtifactPlacement(null);
          setPlacementScreen(null);
        }
        setContextMenu(null);
        useCanvasStore.getState().clearSelection();
        useCanvasStore.getState().selectCanvasTextLabel(null);
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
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
        const st = useCanvasStore.getState();
        if (canRemoveCanvasSelection(st)) {
          e.preventDefault();
          st.removeSelectedFromCanvas();
        }
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.code === "KeyC" && !e.altKey && !e.shiftKey) {
        // A focused field copies its own text selection, never the canvas
        // nodes that happen to be selected around it.
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
        const st = useCanvasStore.getState();
        if (canCopyCanvasSelection(st)) {
          e.preventDefault();
          void st.copySelectedCanvasItems();
        }
        return;
      }

      if (e.code !== "KeyQ" || e.repeat || e.ctrlKey || e.metaKey || e.altKey)
        return;

      if (useCanvasStore.getState().canvasReadOnly) return;

      // Pie accelerator — Q while the pie is held open fires the north
      // sector through this same code path; just dismiss the pie first.
      if (pieStateRef.current) closePie();

      const target = e.target as HTMLElement | null;
      if (isCanvasHotkeyBlockedByTarget(target)) return;

      if (
        placementRef.current ||
        textPlacementRef.current ||
        imagePlacementRef.current ||
        gifPlacementRef.current ||
        threeDPlacementRef.current ||
        artifactPlacementRef.current
      ) {
        return;
      }

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
      setImagePlacement(null);
      setGifPlacement(null);
      setArtifactPlacement(null);
      target?.blur();
      setPlacement(placementWorld(world));
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [closePie, pieStateRef, removeSelectedFromCanvas, activeCanvasId]);

  // T (enter text placement) — same rules as Q for focused inputs.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "KeyT" || e.repeat || e.ctrlKey || e.metaKey || e.altKey)
        return;

      if (useCanvasStore.getState().canvasReadOnly) return;

      // Pie accelerator — T fires the west sector via this same path.
      if (pieStateRef.current) closePie();

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if (target.isContentEditable) return;
      }

      if (
        placementRef.current ||
        textPlacementRef.current ||
        imagePlacementRef.current ||
        gifPlacementRef.current ||
        threeDPlacementRef.current ||
        artifactPlacementRef.current
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      setContextMenu(null);
      setPlacement(null);
      setArtifactPlacement(null);
      target?.blur();
      beginPlacementAtCursor("text");
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [closePie, pieStateRef]);

  // S — pie-menu accelerator only (east / sticky note). No global shortcut.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "KeyS" || e.repeat || e.ctrlKey || e.metaKey || e.altKey)
        return;
      if (!pieStateRef.current) return;

      closePie();

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if (target.isContentEditable) return;
      }

      if (
        placementRef.current ||
        textPlacementRef.current ||
        imagePlacementRef.current ||
        gifPlacementRef.current ||
        threeDPlacementRef.current ||
        artifactPlacementRef.current
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      setContextMenu(null);
      setPlacement(null);
      setTextPlacement(null);
      setImagePlacement(null);
      setGifPlacement(null);
      setArtifactPlacement(null);
      target?.blur();
      beginArtifactPlacementAtCursor("stickynote");
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [closePie, pieStateRef]);

  // Window-level click handler that finalises placement and consumes the event
  // so it doesn't focus inputs or trigger pan on the underlying surface.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;

      const threeDPos = threeDPlacementRef.current;
      if (threeDPos) {
        e.preventDefault();
        e.stopPropagation();
        const w = DEFAULT_3D_WIDTH;
        spawnCanvas3D(
          {
            modelUrl: threeDPos.modelUrl,
            format: threeDPos.format,
            title: threeDPos.title,
            sourceId: threeDPos.sourceId,
          },
          {
            position: { x: threeDPos.x - w / 2, y: threeDPos.y - w / 2 },
            focus: true,
          },
        );
        setThreeDPlacement(null);
        return;
      }

      const gifPos = gifPlacementRef.current;
      if (gifPos) {
        e.preventDefault();
        e.stopPropagation();
        const aspect = gifPos.aspectRatio > 0 ? gifPos.aspectRatio : 1;
        const w = DEFAULT_GIF_WIDTH;
        spawnCanvasGif(
          {
            url: gifPos.url,
            previewUrl: gifPos.previewUrl,
            title: gifPos.title,
            category: gifPos.category,
            aspectRatio: aspect,
            sourceId: gifPos.sourceId,
          },
          {
            position: { x: gifPos.x - w / 2, y: gifPos.y - w / aspect / 2 },
            focus: true,
          },
        );
        setGifPlacement(null);
        return;
      }

      const imagePos = imagePlacementRef.current;
      if (imagePos) {
        e.preventDefault();
        e.stopPropagation();
        const asset = useCanvasStore.getState().canvasAssets[imagePos.assetId];
        if (asset) {
          const bounds = getCanvasAssetBounds({}, asset);
          spawnCanvasAsset(imagePos.assetId, {
            position: {
              x: imagePos.x - bounds.w / 2,
              y: imagePos.y - bounds.h / 2,
            },
            focus: true,
          });
        }
        setImagePlacement(null);
        return;
      }

      const artifactPos = artifactPlacementRef.current;
      if (artifactPos) {
        e.preventDefault();
        e.stopPropagation();
        const payload = createManualArtifactPayload(artifactPos.artifactType);
        const kind = payloadToArtifactKind(payload);
        const { w, h } = getDropArtifactSize(kind, payload);
        const world =
          computeWorldFromClient(e.clientX, e.clientY) ?? artifactPos;
        createManualArtifact(artifactPos.artifactType, {
          position: { x: world.x - w / 2, y: world.y - h / 2 },
        });
        setArtifactPlacement(null);
        setPlacementScreen(null);
        return;
      }

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
      if (useCanvasStore.getState().canvasReadOnly) return;
      e.preventDefault();
      e.stopPropagation();
      const world =
        computeWorldFromClient(e.clientX, e.clientY) ?? placementRef.current;
      const cardId = createRootCard(
        rootCardPositionAtPointer(world.x, world.y),
      );
      maybeFocusNewCard(cardId);
      setPlacement(null);
    };
    // Capture phase so we run before any element's own listeners (including
    // textareas trying to receive focus on click).
    window.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      window.removeEventListener("pointerdown", onPointerDown, true);
  }, [createRootCard, createManualArtifact, spawnCanvasAsset, spawnCanvasGif, spawnCanvas3D, spawnCanvasTextLabel]);

  const placeCanvasAsset = (
    assetId: string,
    world: { x: number; y: number },
    index = 0,
  ) => {
    const asset = useCanvasStore.getState().canvasAssets[assetId];
    if (!asset) return;
    const bounds = getCanvasAssetBounds({}, asset);
    const offset = index * 28;
    spawnCanvasAsset(assetId, {
      position: {
        x: world.x - bounds.w / 2 + offset,
        y: world.y - bounds.h / 2 + offset,
      },
      focus: true,
    });
  };

  const importImagesAtWorld = async (
    files: File[],
    world: { x: number; y: number },
  ) => {
    if (!files.length) return false;
    const result = await uploadAssetFiles(
      files,
      user && activeCanvasId
        ? { userId: user.id, canvasId: activeCanvasId }
        : null,
    );
    result.assets.forEach((asset, index) => {
      addCanvasAsset(asset);
      placeCanvasAsset(asset.id, world, index);
    });
    if (result.errors.length > 0) {
      showUploadErrorsToast(result.errors);
    }
    return result.assets.length > 0;
  };

  const importAudioAtWorld = async (
    files: File[],
    world: { x: number; y: number },
  ) => {
    if (!files.length) return false;
    const uploadContext =
      user && activeCanvasId
        ? { userId: user.id, canvasId: activeCanvasId }
        : null;
    const errors: AssetUploadError[] = [];
    let created = 0;

    for (let index = 0; index < files.length; index++) {
      const result = await createAudioArtifactFromFile(files[index]!, {
        uploadContext,
        position: world,
        index,
        recordUndo: index === 0,
      });
      if ("error" in result) {
        errors.push(result.error);
      } else {
        created++;
      }
    }

    if (errors.length > 0) {
      showUploadErrorsToast(errors);
    }
    return created > 0;
  };

  const importThreeDAtWorld = async (
    files: File[],
    world: { x: number; y: number },
  ) => {
    if (!files.length) return false;
    const uploadContext =
      user && activeCanvasId
        ? { userId: user.id, canvasId: activeCanvasId }
        : null;
    const errors: AssetUploadError[] = [];
    let created = 0;

    for (let index = 0; index < files.length; index++) {
      const result = await createThreeDArtifactFromFile(files[index]!, {
        uploadContext,
        position: world,
        index,
        recordUndo: index === 0,
      });
      if ("error" in result) {
        errors.push(result.error);
      } else {
        created++;
      }
    }

    if (errors.length > 0) {
      showUploadErrorsToast(errors);
    }
    return created > 0;
  };

  // Paste images or URLs on canvas at cursor.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if (target.isContentEditable) return;
      }

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

      const internalPayload = readCanvasClipboardFromDataTransfer(e.clipboardData);
      if (internalPayload && !useCanvasStore.getState().canvasReadOnly) {
        const pasted = useCanvasStore.getState().pasteCanvasClipboardAt(
          world,
          internalPayload,
          { canvasId: activeCanvasId ?? undefined },
        );
        if (pasted) {
          e.preventDefault();
          e.stopPropagation();
          setContextMenu(null);
          setPlacement(null);
          setImagePlacement(null);
          setGifPlacement(null);
          return;
        }
      }

      const imageFiles = getImageFilesFromDataTransfer(e.clipboardData);
      if (imageFiles.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu(null);
        setPlacement(null);
        setImagePlacement(null);
        setGifPlacement(null);
        void importImagesAtWorld(imageFiles, world);
        return;
      }

      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!text.trim()) return;

      const trimmedText = text.trim();
      if (isImageUrl(trimmedText)) {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu(null);
        setPlacement(null);
        setImagePlacement(null);
        setGifPlacement(null);
        void fetchImageUrlAsFile(trimmedText).then((file) => {
          if (file) void importImagesAtWorld([file], world);
        });
        return;
      }

      if (!createUrlArtifactFromText(text, world)) return;

      e.preventDefault();
      e.stopPropagation();
      setContextMenu(null);
      setPlacement(null);
      setImagePlacement(null);
      setGifPlacement(null);
    };

    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  }, [user, activeCanvasId]);

  const handleNativeFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const world = computeWorldFromClient(e.clientX, e.clientY);
    if (!world) return;

    const imageFiles = getImageFilesFromDataTransfer(e.dataTransfer);
    if (imageFiles.length > 0) {
      await importImagesAtWorld(imageFiles, world);
      return;
    }

    const draggedImage = await resolveImageFileFromDataTransfer(e.dataTransfer);
    if (draggedImage) {
      const ok = await importImagesAtWorld([draggedImage], world);
      if (ok) return;
      showUploadErrorsToast([
        {
          code: "upload-failed",
          message:
            "Could not import that image. Try saving it locally, then drag the file onto the canvas.",
        },
      ]);
      return;
    }

    const audioFiles = getAudioFilesFromDataTransfer(e.dataTransfer);
    if (audioFiles.length > 0) {
      await importAudioAtWorld(audioFiles, world);
      return;
    }

    const threeDFiles = getThreeDFilesFromDataTransfer(e.dataTransfer);
    if (threeDFiles.length > 0) {
      await importThreeDAtWorld(threeDFiles, world);
      return;
    }

    const otherFiles = Array.from(e.dataTransfer.files).filter(
      (file) =>
        !isAudioFile(file) &&
        !isImageMime(file.type) &&
        !isThreeDModelFile(file),
    );
    if (otherFiles.length > 0) {
      const result = await uploadAssetFiles(
        otherFiles,
        user && activeCanvasId
          ? { userId: user.id, canvasId: activeCanvasId }
          : null,
      );
      result.assets.forEach((asset, index) => {
        addCanvasAsset(asset);
        placeCanvasAsset(asset.id, world, index);
      });
      if (result.errors.length > 0) {
        showUploadErrorsToast(result.errors);
      }
      return;
    }

    if (audioFiles.length > 0) {
      return;
    }
  };

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
      const { w: artWidth, h: artHeight } = getArtifactBounds({}, art);
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

    if (payload.kind === "asset") {
      const world = computeWorldFromClient(e.clientX, e.clientY);
      if (!world) return;
      placeCanvasAsset(payload.assetId, world);
      return;
    }

    if (payload.kind === "skill") {
      const world = computeWorldFromClient(e.clientX, e.clientY);
      if (!world) return;
      spawnCanvasSkill(payload.skillId, {
        position: {
          x: world.x - CANVAS_SKILL_SIZE / 2,
          y: world.y - CANVAS_SKILL_SIZE / 2,
        },
        focus: true,
      });
      return;
    }

    if (payload.kind === "3d") {
      const world = computeWorldFromClient(e.clientX, e.clientY);
      if (!world) return;
      const w = DEFAULT_3D_WIDTH;
      spawnCanvas3D(
        {
          modelUrl: payload.modelUrl,
          format: payload.format,
          title: payload.title,
          sourceId: payload.sourceId,
        },
        {
          position: { x: world.x - w / 2, y: world.y - w / 2 },
          focus: true,
        },
      );
      setGifPickerOpen(false);
      return;
    }

    if (payload.kind === "gif") {
      const world = computeWorldFromClient(e.clientX, e.clientY);
      if (!world) return;
      const aspect = payload.aspectRatio > 0 ? payload.aspectRatio : 1;
      const w = DEFAULT_GIF_WIDTH;
      spawnCanvasGif(
        {
          url: payload.url,
          previewUrl: payload.previewUrl,
          title: payload.title,
          category: payload.category,
          aspectRatio: aspect,
          sourceId: payload.sourceId,
        },
        {
          position: { x: world.x - w / 2, y: world.y - w / aspect / 2 },
          focus: true,
        },
      );
      setGifPickerOpen(false);
      return;
    }

    const world = computeWorldFromClient(e.clientX, e.clientY);
    if (!world) return;
    const att = uploadedAttachments.find((a) => a.id === payload.attachmentId);
    if (!att) return;
    const pos = rootCardPositionAtPointer(world.x, world.y);
    const cardId = createRootCard(pos);
    updateCard(cardId, {
      pendingFiles: [uploadedToPending(att)],
    });
    maybeFocusNewCard(cardId);
  };

  const handleCanvasDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes("application/x-flowstate-item")) {
      allowSidebarDrop(e);
      return;
    }
    if (isExternalImageDrag(e.dataTransfer.types)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      return;
    }
    allowSidebarDrop(e);
  };

  const handleCanvasDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes("application/x-flowstate-item")) {
      handleSidebarDrop(e);
      return;
    }
    if (
      e.dataTransfer.files.length > 0 ||
      isExternalImageDrag(e.dataTransfer.types)
    ) {
      await handleNativeFileDrop(e);
      return;
    }
    handleSidebarDrop(e);
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (
      pieStateRef.current ||
      placementRef.current ||
      textPlacementRef.current ||
      imagePlacementRef.current ||
      gifPlacementRef.current ||
      threeDPlacementRef.current ||
      artifactPlacementRef.current
    ) {
      return;
    }

    const target = e.target as HTMLElement;
    const hit = resolveCanvasContextHit(target);
    const st = useCanvasStore.getState();

    if (hit) {
      if (!isContextHitInSelection(st, hit)) {
        applyContextMenuSelection(st, hit);
      }
      const next = useCanvasStore.getState();
      // Offer "Set as thumbnail" when the right-clicked node is an image asset.
      let thumbnailImageUrl: string | undefined;
      let isCurrentThumbnail = false;
      if (hit.kind === "asset") {
        const assetNode = next.canvasAssetNodes[hit.id];
        const asset = assetNode
          ? next.canvasAssets[assetNode.assetId]
          : undefined;
        if (asset?.kind === "image" && asset.publicUrl) {
          thumbnailImageUrl = asset.publicUrl;
          const currentThumbnail = canvases.find(
            (c) => c.id === activeCanvasId,
          )?.thumbnailUrl;
          isCurrentThumbnail = currentThumbnail === asset.publicUrl;
        }
      }
      setContextMenu({
        screenX: e.clientX,
        screenY: e.clientY,
        showDelete: canRemoveCanvasSelection(next),
        showCopy: canCopyCanvasSelection(next),
        thumbnailImageUrl,
        isCurrentThumbnail,
      });
      return;
    }

    setContextMenu({
      screenX: e.clientX,
      screenY: e.clientY,
      showDelete: canRemoveCanvasSelection(st),
      showCopy: canCopyCanvasSelection(st),
    });
  };

  const handleCopyAtContextMenu = () => {
    void useCanvasStore.getState().copySelectedCanvasItems();
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

    const state = useCanvasStore.getState();
    const rectSelection = collectCanvasItemsInWorldRect(state, {
      x1: Math.min(w1.x, w2.x),
      y1: Math.min(w1.y, w2.y),
      x2: Math.max(w1.x, w2.x),
      y2: Math.max(w1.y, w2.y),
    });
    const next = ms.baseSelection
      ? mergeCanvasSelections(ms.baseSelection, rectSelection)
      : rectSelection;
    // Most marquee frames don't change what's inside the rect — skip the
    // store write (and the re-renders it fans out) when the selection is
    // identical to the last applied one.
    const key =
      next.familyRootIds.join("|") +
      "::" +
      next.items.map((i) => `${i.kind}:${i.id}`).join("|");
    if (key === lastMarqueeSelectionRef.current) return;
    lastMarqueeSelectionRef.current = key;
    state.setCanvasSelection(next);
  };

  /** rAF-coalesced marquee: one spatial query + selection write per frame. */
  const queueMarqueeAt = (clientX: number, clientY: number) => {
    marqueePendingRef.current = { x: clientX, y: clientY };
    if (marqueeRafRef.current) return;
    marqueeRafRef.current = requestAnimationFrame(() => {
      marqueeRafRef.current = 0;
      const p = marqueePendingRef.current;
      marqueePendingRef.current = null;
      if (p) applyMarqueeAt(p.x, p.y);
    });
  };

  /** Imperative rubber-band rect — no React work per pointermove. */
  const setMarqueeOverlayRect = (
    rect: { x: number; y: number; w: number; h: number } | null,
  ) => {
    const el = marqueeOverlayRef.current;
    if (!el) return;
    if (!rect || (rect.w < 2 && rect.h < 2)) {
      el.style.display = "none";
      return;
    }
    el.style.display = "block";
    el.style.left = `${rect.x}px`;
    el.style.top = `${rect.y}px`;
    el.style.width = `${rect.w}px`;
    el.style.height = `${rect.h}px`;
  };

  const isCanvasBackgroundTarget = (target: HTMLElement) =>
    !target.closest("[data-canvas-card]") &&
    !target.closest("[data-canvas-artifact]") &&
    !target.closest("[data-canvas-asset]") &&
    !target.closest("[data-canvas-gif]") &&
    !target.closest("[data-canvas-text-label]") &&
    !target.closest("[data-canvas-landing]") &&
    !target.closest("[data-group-summary-icon]") &&
    !target.closest("[data-selection-toolbar]");

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // While the pie is held open the gesture owns the pointer — no pan,
    // marquee, or selection clearing underneath.
    if (pieStateRef.current) return;
    if (
      placementRef.current ||
      textPlacementRef.current ||
      imagePlacementRef.current ||
      gifPlacementRef.current ||
      threeDPlacementRef.current ||
      artifactPlacementRef.current
    ) {
      return;
    }
    if (useCanvasStore.getState().plugDrag) return;
    const target = e.target as HTMLElement;
    if (!isCanvasBackgroundTarget(target)) return;
    setContextMenu(null);
    if (e.button !== 0) return;

    const el = e.currentTarget as HTMLDivElement;
    el.setPointerCapture(e.pointerId);

    const store = useCanvasStore.getState();
    if (store.pencilToolActive && !store.canvasReadOnly) {
      const world = computeWorldFromClient(e.clientX, e.clientY);
      if (!world) return;
      const strokeId = store.beginCanvasStroke(world);
      drawingState.current = { pointerId: e.pointerId, strokeId };
      return;
    }

    if (spaceHeldRef.current) {
      panState.current = {
        pointerId: e.pointerId,
        lastX: e.clientX,
        lastY: e.clientY,
      };
      return;
    }

    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    marqueeState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseSelection: additive
        ? {
            familyRootIds: [
              ...useCanvasStore.getState().selectedFamilyRootIds,
            ],
            items: [...useCanvasStore.getState().canvasSelection],
          }
        : null,
    };
    lastMarqueeSelectionRef.current = "";
    setMarqueeActive(true);
    setMarqueeSelecting(true);
    setMarqueeOverlayRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
    if (!additive) clearSelection();
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    canvasPointerRef.current = { x: e.clientX, y: e.clientY };

    const ds = drawingState.current;
    if (ds && ds.pointerId === e.pointerId) {
      const world = computeWorldFromClient(e.clientX, e.clientY);
      if (world) appendCanvasStrokePoint(ds.strokeId, world);
      return;
    }

    const ms = marqueeState.current;
    if (ms && ms.pointerId === e.pointerId) {
      const x = Math.min(ms.startX, e.clientX);
      const y = Math.min(ms.startY, e.clientY);
      const w = Math.abs(e.clientX - ms.startX);
      const h = Math.abs(e.clientY - ms.startY);
      setMarqueeOverlayRect({ x, y, w, h });
      if (w >= MARQUEE_MIN_DRAG_PX || h >= MARQUEE_MIN_DRAG_PX) {
        queueMarqueeAt(e.clientX, e.clientY);
      }
      return;
    }

    const ps = panState.current;
    if (!ps || ps.pointerId !== e.pointerId) return;
    const dx = e.clientX - ps.lastX;
    const dy = e.clientY - ps.lastY;
    ps.lastX = e.clientX;
    ps.lastY = e.clientY;
    queuePan(dx, dy);
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const ds = drawingState.current;
    if (ds && ds.pointerId === e.pointerId) {
      finishCanvasStroke(ds.strokeId);
      drawingState.current = null;
      try {
        (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      return;
    }

    const ms = marqueeState.current;
    if (ms && ms.pointerId === e.pointerId) {
      const w = Math.abs(e.clientX - ms.startX);
      const h = Math.abs(e.clientY - ms.startY);
      if (marqueeRafRef.current) {
        cancelAnimationFrame(marqueeRafRef.current);
        marqueeRafRef.current = 0;
        marqueePendingRef.current = null;
      }
      // Flag off BEFORE the final selection apply so the culling hook's
      // "selected nodes always render" union runs for the settled selection.
      setMarqueeSelecting(false);
      if (w >= MARQUEE_MIN_DRAG_PX || h >= MARQUEE_MIN_DRAG_PX) {
        // Final position applied synchronously so release is exact; force
        // the store write even if the id set matches the last mid-sweep
        // apply, so culling re-evaluates with the union enabled.
        lastMarqueeSelectionRef.current = "";
        applyMarqueeAt(e.clientX, e.clientY);
      } else if (!ms.baseSelection) {
        clearSelection();
      }
      marqueeState.current = null;
      setMarqueeActive(false);
      setMarqueeOverlayRect(null);
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

  // overflow-clip, not overflow-hidden: a hidden box is still a scroll
  // container, so focusing an off-screen input inside a node (or clicking a
  // half-visible one) scrolled it. Every layer then sat shifted under a
  // viewport transform that assumed scroll 0 — culling dropped nodes that
  // were on screen and zoom pivoted away from the cursor.
  return (
    <div
      ref={setContainerRef}
      data-canvas-container
      style={fontPreviewStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={handleContextMenu}
      onDragOver={handleCanvasDragOver}
      onDrop={handleCanvasDrop}
      className={`absolute inset-0 overflow-clip font-sans select-none touch-none ${
        canvasBackgroundStyle === "static-image" ? "bg-transparent" : "bg-canvas-bg"
      } ${
        placement ||
        textPlacement ||
        imagePlacement ||
        gifPlacement ||
        artifactPlacement
          ? "cursor-add"
          : pencilToolActive
            ? "canvas-pencil-cursor"
            : spaceHeld
              ? "cursor-grab active:cursor-grabbing"
              : "cursor-default"
      }`}
    >
      <CanvasBackgroundLayer />
      {/* Connections render on a screen-space canvas2d layer (one rAF redraw,
          zero React work per frame). NEXT_PUBLIC_SVG_CONNECTIONS=1 restores
          the legacy SVG renderer for one release as a kill-switch. */}
      {/* Group wells and headings sit on their own world layer UNDER the
          connector lines, so a group (Frost's opaque well included) never
          covers an edge; cards stay above the lines on the main layer. */}
      <CanvasViewport layer="groups">
        {groupList.map((group) => (
          <GroupBounds key={group.id} group={group} />
        ))}
      </CanvasViewport>
      {!SVG_CONNECTIONS && connectionsBehindCards && (
        <ConnectionsCanvas containerRef={containerRef} layer="lines" />
      )}
      <CanvasViewport>
        <PlugConnectorLayer />
        <ArtifactPlugConnections />
        <AssetPlugConnections />
        <SkillPlugConnections />
        <GroupPlugConnections />
        {SVG_CONNECTIONS && connectionsBehindCards && <Connections />}
        <CanvasNodeLayer
          containerRef={containerRef}
          landingCardId={showLanding ? landingCardId : null}
          autoEditLabelId={autoEditLabelId}
        />
        {!chatsGloballyHidden &&
          groupList.map((group) =>
            group.summaryMarkdown ? (
              <GroupSummaryIcon key={`summary-icon-${group.id}`} group={group} />
            ) : null,
          )}
        {SVG_CONNECTIONS && !connectionsBehindCards && <Connections />}
        <CanvasDrawingLayer
          strokes={canvasStrokes}
          strokeOrder={canvasStrokeOrder}
          activeStrokeId={activeCanvasStrokeId}
        />
        {placement && <GhostCard world={placement} />}
        {textPlacement && <GhostTextLabel world={textPlacement} />}
        {imagePlacement && <GhostImage world={imagePlacement} />}
        {gifPlacement && <GhostGif world={gifPlacement} />}
        {threeDPlacement && <Ghost3D world={threeDPlacement} />}
      </CanvasViewport>
      {/* Plug rings straddle card edges, so even when the lines sit behind
          the cards the rings draw above them — otherwise each card hides
          half of its own plug. */}
      {!SVG_CONNECTIONS && (
        <ConnectionsCanvas
          containerRef={containerRef}
          layer={connectionsBehindCards ? "markers" : "all"}
        />
      )}
      {showLanding &&
        !chatsGloballyHidden &&
        !placement &&
        !textPlacement &&
        !imagePlacement &&
        !gifPlacement &&
        !threeDPlacement &&
        !artifactPlacement &&
        landingCardId && <CanvasLandingOverlay cardId={landingCardId} />}
      {/* Marquee rubber-band — positioned imperatively per frame (no React
          re-render per pointermove; matches SelectionOverlay's styling). */}
      <div
        ref={marqueeOverlayRef}
        aria-hidden
        style={{ display: "none" }}
        className="canvas-marquee pointer-events-none fixed z-30 border-2 border-dashed border-canvas-ink/40 bg-canvas-ink/5"
      />
      {/* Hidden while a marquee drag is in progress — the bar only appears on mouse release. */}
      {!marqueeActive && <SelectionToolbar />}
      {contextMenu && (
        <CanvasContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onAddText={handleAddTextAtContextMenu}
          onCopy={handleCopyAtContextMenu}
          onDelete={() => removeSelectedFromCanvas()}
          onSetThumbnail={(url) => {
            if (activeCanvasId) void setCanvasThumbnail(activeCanvasId, url);
          }}
          onRemoveThumbnail={() => {
            if (activeCanvasId) void setCanvasThumbnail(activeCanvasId, null);
          }}
        />
      )}
      <CollaboratorCursors
        containerRef={containerRef}
        channelRef={presenceChannelRef}
        channelReady={presenceChannelReady}
        onlineUserIds={onlineUserIds}
        currentUserId={user?.id}
        displayName={
          user?.user_metadata?.full_name ??
          user?.user_metadata?.name ??
          user?.email ??
          undefined
        }
        avatarUrl={user?.user_metadata?.avatar_url as string | undefined}
      />
      <CanvasPieMenu state={pieState} />
      {artifactPlacement &&
        placementScreen &&
        typeof document !== "undefined" &&
        createPortal(
          <ArtifactCursorGhost
            artifactType={artifactPlacement.artifactType}
            screen={placementScreen}
          />,
          document.body,
        )}
    </div>
  );
}

function GhostTextLabel({ world }: { world: PlacementState }) {
  return (
    <div
      aria-hidden
      className="canvas-placement-ghost-text pointer-events-none absolute font-medium leading-tight text-canvas-ink/50"
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

function GhostImage({ world }: { world: ImagePlacementState }) {
  const w = DEFAULT_ASSET_IMAGE_WIDTH;
  const h = w / (world.aspectRatio > 0 ? world.aspectRatio : 1);
  return (
    <div
      aria-hidden
      className="canvas-placement-ghost pointer-events-none absolute overflow-hidden rounded-canvas opacity-50 ring-1 ring-dashed ring-canvas-border"
      style={{
        left: world.x - w / 2,
        top: world.y - h / 2,
        width: w,
        height: h,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={world.previewUrl}
        alt=""
        draggable={false}
        className="h-full w-full object-contain"
      />
    </div>
  );
}

function Ghost3D({ world }: { world: ThreeDPlacementState }) {
  const w = DEFAULT_3D_WIDTH;
  return (
    <div
      aria-hidden
      className="canvas-placement-ghost pointer-events-none absolute overflow-hidden rounded-canvas opacity-60 ring-1 ring-dashed ring-canvas-border"
      style={{
        left: world.x - w / 2,
        top: world.y - w / 2,
        width: w,
        height: w,
      }}
    >
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-canvas-bg via-canvas-card to-canvas-bg p-2 text-center">
        <span className="text-canvas-caption font-medium text-canvas-muted">3D</span>
        <span className="line-clamp-2 text-canvas-caption text-canvas-ink">{world.title}</span>
      </div>
    </div>
  );
}

function GhostGif({ world }: { world: GifPlacementState }) {
  const w = DEFAULT_GIF_WIDTH;
  const h = w / (world.aspectRatio > 0 ? world.aspectRatio : 1);
  return (
    <div
      aria-hidden
      className="canvas-placement-ghost pointer-events-none absolute overflow-hidden rounded-canvas opacity-60 ring-1 ring-dashed ring-canvas-border"
      style={{
        left: world.x - w / 2,
        top: world.y - h / 2,
        width: w,
        height: h,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={world.previewUrl}
        alt=""
        draggable={false}
        className="h-full w-full object-contain"
      />
    </div>
  );
}

function ArtifactCursorGhost({
  artifactType,
  screen,
}: {
  artifactType: ManualArtifactType;
  screen: { x: number; y: number };
}) {
  const payload = createManualArtifactPayload(artifactType);
  const kind = payloadToArtifactKind(payload);
  // Portaled to <body>: a Frost canvas marks it as a canvas portal so the
  // pack's tokens (frost-tokens.css) reach it. Other packs stay as they are.
  const frostPortal = useArtifactStyle().pack.bodyFamily === "frost";
  const label =
    MANUAL_ARTIFACT_MENU_ITEMS.find(
      (entry) =>
        entry.pick.kind === "artifact" &&
        entry.pick.artifactType === artifactType,
    )?.label ?? "Artefact";

  return (
    <div
      aria-hidden
      {...(frostPortal ? { "data-canvas-portal": "" } : {})}
      className="canvas-placement-ghost pointer-events-none fixed z-[200] rounded-canvas border border-dashed border-canvas-border bg-canvas-card/90 opacity-80 shadow-artifact"
      style={{
        left: screen.x,
        top: screen.y,
        transform: "translate(-50%, -50%)",
        width: 120,
        height: 88,
      }}
    >
      <div className="flex h-full flex-col items-center justify-center gap-1.5 p-2 text-canvas-muted">
        <ArtifactTypeIcon kind={kind} className="h-5 w-5" />
        <span className="text-center text-canvas-caption font-medium">{label}</span>
      </div>
    </div>
  );
}

function GhostCard({ world }: { world: PlacementState }) {
  const tuning = RESOLVED_CANVAS_TUNING;
  const pos = {
    x: world.x - tuning.cardWidth / 2,
    y: world.y - tuning.emptyCardHeight / 2,
  };
  return (
    <div
      aria-hidden
      className="canvas-placement-ghost canvas-placement-ghost-card pointer-events-none absolute rounded-canvas border border-dashed border-canvas-border bg-canvas-card/85 shadow-artifact"
      style={{
        left: pos.x,
        top: pos.y,
        width: tuning.cardWidth,
      }}
    >
      <div className="floating-chrome-padding">
        <div className="canvas-placement-ghost-composer flex items-center gap-0 rounded-canvas border border-dashed border-canvas-border/80 bg-canvas-card/90 px-2 py-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-canvas-bg text-canvas-heading font-light text-canvas-muted">
            +
          </span>
          <span className="mx-1 h-6 w-px shrink-0 bg-canvas-border" aria-hidden />
          <span className="min-w-0 flex-1 py-2 text-canvas-body text-canvas-muted/60">
            Ask anything
          </span>
          <SendIconPreview className="opacity-80" />
        </div>
        <p className="mt-2 text-center text-canvas-caption text-canvas-muted">
          Click to place, Esc to cancel
        </p>
      </div>
    </div>
  );
}
