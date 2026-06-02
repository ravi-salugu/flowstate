"use client";

import {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  WheelEvent,
  useEffect,
  useRef,
} from "react";
import { CardAnswerBody } from "@/components/cards/CardAnswerBody";
import { ChatComposer } from "@/components/ChatComposer";
import { Plug } from "@/components/plugs/Plug";
import { CardQaMenu } from "@/components/CardQaMenu";
import {
  QaQuestionSection,
  QaTranslucentSurface,
} from "@/components/QaQuestionSection";
import { askClaude } from "@/lib/claudeClient";
import { useConnectDragHoverStore } from "@/lib/connectDragHoverStore";
import {
  handleArtifactOnDone,
  handleStreamArtifact,
} from "@/lib/artifactGeneration";
import {
  getLandingCardId,
  shouldShowCanvasLanding,
} from "@/lib/canvasLandingState";
import { CARD_WIDTH, getCardBounds } from "@/lib/canvasNodeBounds";
import { plugAnchorAt } from "@/lib/plugConnector";
import { isCardInSelectedFamilies } from "@/lib/chatThreads";
import {
  Card as CardType,
  FollowUpOptions,
  useCanvasStore,
} from "@/lib/store";
import {
  CARD_QA_MAX_HEIGHT,
  compactThinkingWord,
  compensatedStrokeWidth,
  isExpandedCardContent,
  isGodViewMode,
  lineClampStyle,
  shouldHideDivider,
  shouldHideFollowUp,
  shouldHideImages,
  shouldHideLabels,
  zoomLineClamp,
  zoomSectionInsets,
} from "@/lib/zoomDisplay";

interface CardProps {
  card: CardType;
}

function handleAnswerWheel(e: WheelEvent) {
  e.stopPropagation();
  if (e.deltaX !== 0) e.preventDefault();
}

export function Card({ card }: CardProps) {
  const updateCard = useCanvasStore((s) => s.updateCard);
  const recordUndo = useCanvasStore((s) => s.recordUndo);
  const setCardSize = useCanvasStore((s) => s.setCardSize);
  const createFollowUp = useCanvasStore((s) => s.createFollowUp);
  const startPlugDrag = useCanvasStore((s) => s.startPlugDrag);
  const plugDrag = useCanvasStore((s) => s.plugDrag);
  // R7+ — true when a plug is being dragged AND this card is the current
  // hover target. Used to render a connect-mode ring so the user can see
  // which card will receive the connection BEFORE releasing the pointer.
  const isDropTarget = useConnectDragHoverStore(
    (s) => s.hoverComponentId === card.id,
  );
  const moveSubtree = useCanvasStore((s) => s.moveSubtree);
  const selectedModel = useCanvasStore((s) => s.selectedModel);
  const isSelected = useCanvasStore((s) =>
    isCardInSelectedFamilies(s, card.id, s.selectedFamilyRootIds),
  );
  const hasChildren = useCanvasStore((s) =>
    s.connections.some(
      (c) => c.from === card.id && c.fromSide === "bottom",
    ),
  );
  const scale = useCanvasStore((s) => s.viewport.scale);
  const godView = isGodViewMode(scale);
  const lineClamp = zoomLineClamp(scale);
  const expandedContent = isExpandedCardContent(scale);
  const insets = zoomSectionInsets(scale);
  const hideLabels = shouldHideLabels(scale);
  const hideDivider = shouldHideDivider(scale);
  const hideFollowUp = shouldHideFollowUp(scale);
  const hideImages = shouldHideImages(scale);
  const cardBorderWidth = compensatedStrokeWidth(1, scale, 1);
  const clampStyle = lineClampStyle(lineClamp);

  const accent = useCanvasStore(
    (s) => s.threads[card.threadId]?.accentColour,
  );
  const isBranchRoot = useCanvasStore(
    (s) =>
      card.parentCardId === null &&
      s.connections.some((c) => c.to === card.id),
  );
  const isLanding = useCanvasStore(
    (s) =>
      shouldShowCanvasLanding(s.cards, s.cardOrder) &&
      getLandingCardId(s.cards, s.cardOrder) === card.id,
  );
  const emptyPlaceholder = isBranchRoot ? "Pull a new thread" : "Ask anything";
  const hideForLanding = isLanding;
  const plugAccent = accent ?? "#7C9EFF";
  const showBranchPlugs = card.status === "done" && !godView;
  const receivePlugsActive =
    plugDrag?.kind === "artifact" &&
    plugDrag.receiveTargetCardId === card.id;
  const receiveHighlightSide =
    receivePlugsActive && plugDrag.kind === "artifact"
      ? plugDrag.hoveredReceiveSide
      : null;

  const isDraggable = card.parentCardId === null;

  const branchPlugWorld = (side: "left" | "right") => {
    const { w, h } = getCardBounds(card);
    const anchor = plugAnchorAt(
      card.position.x,
      card.position.y,
      w,
      h,
      side,
    );
    return { x: anchor.px, y: anchor.py };
  };

  const handleBranchPlugPointerDown =
    (side: "left" | "right") => (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      e.preventDefault();
      startPlugDrag({
        kind: "branch",
        sourceCardId: card.id,
        fromSide: side,
        pointerWorld: branchPlugWorld(side),
        didDrag: false,
      });
    };

  const dragStateRef = useRef<{
    pointerId: number;
    lastX: number;
    lastY: number;
    didMove: boolean;
  } | null>(null);
  const DRAG_THRESHOLD_PX = 5;

  const startedFor = useRef<string | null>(null);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const layoutKeyRef = useRef("");
  const lastScaleRef = useRef(1);

  const displayBucket = godView
    ? "god"
    : hideFollowUp
      ? "compact"
      : expandedContent
        ? "expanded"
        : "summary";
  const layoutKey = [
    card.status,
    card.question,
    card.answer.length,
    card.outputArtifactId ?? "",
    hasChildren ? "1" : "0",
    card.images?.length ?? 0,
    card.responseType ?? "text",
    displayBucket,
    lineClamp ?? "full",
  ].join("|");

  const TEXT_SELECTABLE =
    'textarea, button, input, select, [contenteditable="true"], [data-selectable-text]';

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const update = () => {
      const currentScale = useCanvasStore.getState().viewport.scale;
      const layoutChanged = layoutKey !== layoutKeyRef.current;
      const scaleChanged = currentScale !== lastScaleRef.current;
      if (scaleChanged && !layoutChanged) return;
      layoutKeyRef.current = layoutKey;
      lastScaleRef.current = currentScale;
      const next = { w: el.offsetWidth, h: el.offsetHeight };
      setCardSize(card.id, next);
    };
    update();
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(update);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [card.id, setCardSize, layoutKey]);

  useEffect(() => {
    if (card.status !== "thinking") return;
    if (startedFor.current === card.question) return;
    startedFor.current = card.question;
    askClaude(card.id, card.parentConversationId ?? null, card.question, selectedModel, {
      onThinking: (label) =>
        updateCard(card.id, {
          status: "thinking",
          thinkingLabel: label,
        }),
      onToken: (next) =>
        updateCard(card.id, {
          status: "streaming",
          answer: next,
          thinkingLabel: undefined,
        }),
      onImages: (images) =>
        updateCard(card.id, {
          images,
          responseType: "image",
        }),
      onResponseType: (responseType) =>
        updateCard(card.id, { responseType }),
      onArtifact: (artifact) => handleStreamArtifact(card.id, artifact),
      onDone: ({ responseType }) => {
        updateCard(card.id, {
          status: "done",
          thinkingLabel: undefined,
          responseType: responseType ?? card.responseType ?? "text",
          pendingFiles: undefined,
        });
        handleArtifactOnDone(card.id);
      },
    });
  }, [card.status, card.question, card.id, updateCard, selectedModel]);

  const isPending =
    card.status === "thinking" || card.status === "streaming";

  const submitQuestion = (question: string, options?: FollowUpOptions) => {
    const q = question.trim();
    if (!q || isPending) return;
    recordUndo();
    updateCard(card.id, {
      question: q,
      answer: "",
      status: "thinking",
      responseType: "text",
      artifactPayload: undefined,
      images: options?.pendingImages,
      outputArtifactId: undefined,
      outputArtifactVersionId: undefined,
      attachedArtifacts: options?.attachedArtifacts,
      pendingFiles: options?.pendingFiles,
    });
  };

  const submitFollowUp = (question: string, options?: FollowUpOptions) => {
    createFollowUp(card.id, question, options);
  };

  const handleCardPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (useCanvasStore.getState().plugDrag) return;
    const target = e.target as HTMLElement;
    if (target.closest(TEXT_SELECTABLE)) return;
    if (target.closest("[data-plug]")) return;

    e.stopPropagation();
    if (!isDraggable) return;

    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragStateRef.current = {
      pointerId: e.pointerId,
      lastX: e.clientX,
      lastY: e.clientY,
      didMove: false,
    };
  };

  const handleDragPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const ds = dragStateRef.current;
    if (!ds || ds.pointerId !== e.pointerId) return;

    const screenDx = e.clientX - ds.lastX;
    const screenDy = e.clientY - ds.lastY;
    const dist = Math.hypot(screenDx, screenDy);
    if (!ds.didMove && dist < DRAG_THRESHOLD_PX) return;

    ds.didMove = true;
    ds.lastX = e.clientX;
    ds.lastY = e.clientY;
    const vpScale = useCanvasStore.getState().viewport.scale;
    moveSubtree(card.id, screenDx / vpScale, screenDy / vpScale);
  };

  const handleDragPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const ds = dragStateRef.current;
    if (!ds || ds.pointerId !== e.pointerId) return;
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragStateRef.current = null;
  };

  return (
    <div
      ref={cardRef}
      data-canvas-card={card.id}
      onPointerDown={handleCardPointerDown}
      onPointerMove={handleDragPointerMove}
      onPointerUp={handleDragPointerUp}
      onPointerCancel={handleDragPointerUp}
      className={`group/card relative absolute overflow-visible select-text ${
        isDraggable ? "cursor-grab active:cursor-grabbing" : ""
      } ${hideForLanding ? "pointer-events-none invisible" : ""}`}
      style={{
        left: card.position.x,
        top: card.position.y,
        width: CARD_WIDTH,
      }}
      aria-hidden={hideForLanding || undefined}
    >
      {showBranchPlugs && (
        <>
          <div
            className={`pointer-events-none absolute inset-y-0 left-0 z-30 transition-opacity [&_button]:pointer-events-auto ${
              plugDrag
                ? "opacity-100"
                : "opacity-0 group-hover/card:opacity-100"
            }`}
          >
            <Plug
              side="left"
              accentColour={plugAccent}
              visible
              ariaLabel="Pull a new thread to the left"
              onPointerDown={handleBranchPlugPointerDown("left")}
            />
          </div>
          <div
            className={`pointer-events-none absolute inset-y-0 right-0 z-30 transition-opacity [&_button]:pointer-events-auto ${
              plugDrag
                ? "opacity-100"
                : "opacity-0 group-hover/card:opacity-100"
            }`}
          >
            <Plug
              side="right"
              accentColour={plugAccent}
              visible
              ariaLabel="Pull a new thread to the right"
              onPointerDown={handleBranchPlugPointerDown("right")}
            />
          </div>
        </>
      )}
      <div
        className={`group/inner relative flex flex-col overflow-hidden rounded-2xl border bg-transparent shadow-card transition-shadow hover:shadow-cardHover ${
          isDropTarget
            ? "border-emerald-500 ring-4 ring-emerald-400/40"
            : isSelected
              ? "border-canvas-ink ring-2 ring-canvas-ink/25"
              : "border-canvas-border"
        }`}
        style={{
          borderWidth: cardBorderWidth,
          ...(isSelected && accent && !isDropTarget
            ? { boxShadow: `0 0 0 2px ${accent}40` }
            : {}),
        }}
      >
        <CardQaMenu cardId={card.id} viewportScale={scale} />
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${
            expandedContent ? "max-h-[var(--card-qa-max-height)]" : ""
          }`}
          style={
            expandedContent
              ? ({
                  "--card-qa-max-height": `${CARD_QA_MAX_HEIGHT}px`,
                } as CSSProperties)
              : undefined
          }
        >
          {card.status === "empty" && !isLanding ? (
            <div className="px-3 py-2.5">
              <ChatComposer
                variant="canvas"
                cardId={card.id}
                accentColour={plugAccent}
                receivePlugsActive={receivePlugsActive}
                receiveHighlightSide={receiveHighlightSide}
                placeholder={emptyPlaceholder}
                autoFocus
                disabled={isPending}
                onSubmit={submitQuestion}
              />
            </div>
          ) : card.status !== "empty" ? (
            <QaTranslucentSurface className="group/body flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <QaQuestionSection
                accentColour={accent}
                accentWidth={compensatedStrokeWidth(3, scale, 3)}
                style={{
                  paddingTop: insets.question.paddingTop,
                  paddingBottom: insets.question.paddingBottom,
                  paddingLeft: insets.question.paddingLeft,
                  paddingRight: insets.question.paddingRight,
                }}
              >
                {!hideLabels && (
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-canvas-muted">
                    Question
                  </div>
                )}
                <div
                  data-selectable-text
                  className="w-full min-w-0 cursor-text break-words whitespace-pre-wrap text-[18px] font-bold leading-snug text-canvas-ink"
                  style={clampStyle}
                >
                  {card.question}
                </div>
              </QaQuestionSection>

              {!hideDivider && (
                <div className="mx-5 shrink-0 h-px bg-canvas-border" />
              )}
              <div
                data-card-answer
                onWheel={handleAnswerWheel}
                className={`min-h-0 min-w-0 ${
                  expandedContent
                    ? "flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
                    : "overflow-hidden"
                }`}
                style={{
                  paddingTop: insets.answer.paddingTop,
                  paddingBottom: insets.answer.paddingBottom,
                  paddingLeft: insets.answer.paddingLeft,
                  paddingRight: insets.answer.paddingRight,
                }}
              >
                {!hideLabels && (
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-canvas-muted">
                    Answer
                  </div>
                )}
                {card.status === "thinking" ? (
                  <SummaryLoading label={card.thinkingLabel ?? "Thinking"} />
                ) : (
                  <>
                    {(card.answer ||
                      card.images?.length ||
                      card.artifactPayload ||
                      card.responseType !== "text") &&
                      (lineClamp !== null ? (
                        <ClampedAnswer
                          card={card}
                          clampStyle={clampStyle}
                          isStreaming={card.status === "streaming"}
                          hideImages={hideImages}
                        />
                      ) : (
                        <CardAnswerBody
                          card={card}
                          isStreaming={card.status === "streaming"}
                          hideImages={hideImages}
                        />
                      ))}
                  </>
                )}
              </div>
            </QaTranslucentSurface>
          ) : null}

          {card.status === "done" && !hasChildren && !hideFollowUp && (
            <div className="relative z-20 shrink-0 border-t border-canvas-border bg-canvas-card px-3 py-2.5">
              <ChatComposer
                variant="canvas"
                cardId={card.id}
                accentColour={plugAccent}
                receivePlugsActive={receivePlugsActive}
                receiveHighlightSide={receiveHighlightSide}
                placeholder="Follow up"
                onSubmit={submitFollowUp}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryLoading({ label }: { label: string }) {
  const word = compactThinkingWord(label);
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-canvas-border bg-canvas-bg/80 px-3 py-2.5"
      style={{ animation: "summary-pulse-stroke 2s ease-in-out infinite" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div
          className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/70 to-transparent"
          style={{ animation: "summary-shimmer 1.8s ease-in-out infinite" }}
        />
      </div>
      <span className="relative text-sm font-medium capitalize text-canvas-muted">
        {word}
      </span>
    </div>
  );
}

function ClampedAnswer({
  card,
  clampStyle,
  isStreaming,
  hideImages,
}: {
  card: CardType;
  clampStyle?: ReturnType<typeof lineClampStyle>;
  isStreaming: boolean;
  hideImages?: boolean;
}) {
  if (
    (card.responseType ?? "text") === "text" &&
    !card.artifactPayload
  ) {
    return (
      <CardAnswerBody
        card={card}
        isStreaming={isStreaming}
        clampStyle={clampStyle}
        plainClamp
        hideImages={hideImages}
      />
    );
  }

  return (
    <div
      data-selectable-text
      className="min-w-0 cursor-text select-text"
      style={clampStyle}
    >
      <CardAnswerBody
        card={card}
        isStreaming={isStreaming}
        hideImages={hideImages}
      />
    </div>
  );
}

