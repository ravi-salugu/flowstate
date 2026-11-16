"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  FileText,
  LayoutGrid,
  Presentation,
  Sparkles,
  Ungroup,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { SelectionBoundsBox } from "@/components/SelectionBoundsBox";
import {
  toolbarScreenPosition,
  useSelectionWorldBounds,
  type ToolbarWorldAnchor,
} from "@/hooks/useSelectionToolbarAnchor";
import { subscribeViewportPaint } from "@/lib/viewportGesture";
import type { AlignMode } from "@/lib/canvasArrange";
import { deriveGroupLabel } from "@/lib/deriveGroupLabel";
import { summarizeGroup } from "@/lib/summarizeGroup";
import { isGroupableItem, useCanvasStore } from "@/lib/store";

const ALIGN_ACTIONS: { mode: AlignMode; label: string; icon: LucideIcon }[] = [
  { mode: "left", label: "Align left", icon: AlignStartVertical },
  {
    mode: "centerX",
    label: "Align horizontal centers",
    icon: AlignCenterVertical,
  },
  { mode: "right", label: "Align right", icon: AlignEndVertical },
  { mode: "top", label: "Align top", icon: AlignStartHorizontal },
  {
    mode: "centerY",
    label: "Align vertical centers",
    icon: AlignCenterHorizontal,
  },
  { mode: "bottom", label: "Align bottom", icon: AlignEndHorizontal },
];

/**
 * Wrapper positioned at a WORLD anchor, converted to screen space
 * imperatively on viewport writes + gesture paints — subscribing React to
 * the live viewport re-rendered the toolbar every pan/zoom frame.
 */
function AnchoredWrapper({
  anchor,
  className,
  children,
}: {
  anchor: ToolbarWorldAnchor;
  className: string;
  children: ReactNode;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const apply = (v: { x: number; y: number; scale: number }) => {
      const pos = toolbarScreenPosition(anchor, v);
      el.style.left = `${pos.left}px`;
      el.style.top = `${pos.top}px`;
    };
    apply(useCanvasStore.getState().viewport);
    const unsubStore = useCanvasStore.subscribe((state, prev) => {
      if (state.viewport !== prev.viewport) apply(state.viewport);
    });
    const unsubPaint = subscribeViewportPaint(apply);
    return () => {
      unsubStore();
      unsubPaint();
    };
  }, [anchor]);

  const initial = toolbarScreenPosition(
    anchor,
    useCanvasStore.getState().viewport,
  );
  return (
    <div
      ref={elRef}
      data-selection-toolbar
      className={className}
      style={{
        left: initial.left,
        top: initial.top,
        transform: "translate(-50%, -100%)",
      }}
      // The toolbar lives INSIDE the canvas container — without this, a
      // press on any toolbar button bubbles to the canvas pointerdown,
      // which starts a marquee, clears the selection, and unmounts the
      // toolbar before the click can fire.
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

function ToolbarIconButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="btn h-7 w-7 rounded-canvas text-canvas-muted hover:text-canvas-ink"
    >
      <Icon icon={icon} size="inline" />
    </button>
  );
}

/** Icon + label action in the horizontal group bar. */
function GroupActionButton({
  icon,
  label,
  onClick,
  disabled = false,
  accent = false,
  title,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  accent?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title ?? label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`btn flex h-7 items-center gap-1.5 rounded-canvas px-2 text-canvas-compact font-medium ${
        accent
          ? "bg-canvas-accent text-canvas-onAccent"
          : "text-canvas-muted hover:text-canvas-ink"
      } ${disabled && !accent ? "opacity-60" : ""}`}
    >
      <Icon icon={icon} size="inline" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

export function SelectionToolbar() {
  // One bounds computation feeds both the box and the toolbar anchor — each
  // hook call subscribes to every canvas node collection, so calling it twice
  // would double the re-render churn on any node mutation.
  const worldBounds = useSelectionWorldBounds();
  const anchor: ToolbarWorldAnchor | null = useMemo(
    () =>
      worldBounds
        ? { worldX: worldBounds.x + worldBounds.w / 2, worldY: worldBounds.y }
        : null,
    [worldBounds],
  );
  const selectedFamilyRootIds = useCanvasStore(
    (s) => s.selectedFamilyRootIds,
  );
  const canvasSelection = useCanvasStore((s) => s.canvasSelection);
  const activeGroupId = useCanvasStore((s) => s.activeGroupId);
  const selectedGroupIds = useCanvasStore((s) => s.selectedGroupIds);
  const arrangeGroupsInGrid = useCanvasStore((s) => s.arrangeGroupsInGrid);
  const canvasReadOnly = useCanvasStore((s) => s.canvasReadOnly);
  const groups = useCanvasStore((s) => s.groups);
  const selectedModel = useCanvasStore((s) => s.selectedModel);
  const createGroupFromSelection = useCanvasStore(
    (s) => s.createGroupFromSelection,
  );
  const removeGroup = useCanvasStore((s) => s.removeGroup);
  const alignSelectedCanvasItems = useCanvasStore(
    (s) => s.alignSelectedCanvasItems,
  );

  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeGroup = activeGroupId ? groups[activeGroupId] : null;
  const unitCount = selectedFamilyRootIds.length + canvasSelection.length;
  const hasSelection = unitCount > 0;
  // Anything on the canvas can join a group except skills.
  const groupableUnits =
    selectedFamilyRootIds.length +
    canvasSelection.filter(isGroupableItem).length;
  const canGroup = groupableUnits >= 2;
  const showAlignBar = unitCount >= 2;
  const showGroupPanel = Boolean(activeGroup) && !hasSelection;
  const multiGroupCount = hasSelection ? 0 : selectedGroupIds.length;

  if ((!showAlignBar && !showGroupPanel && multiGroupCount < 2) || !anchor) {
    return null;
  }

  const handleGroup = () => {
    setError(null);
    const state = useCanvasStore.getState();
    const label = deriveGroupLabel(state, state.selectedFamilyRootIds);
    createGroupFromSelection(label);
  };

  const handleSummarize = async () => {
    if (!activeGroupId) return;
    setError(null);
    setSummarizing(true);
    const result = await summarizeGroup(activeGroupId, selectedModel);
    setSummarizing(false);
    if (!result.ok) setError(result.error);
  };

  if (multiGroupCount >= 2) {
    return (
      <>
        {worldBounds && <SelectionBoundsBox bounds={worldBounds} />}
        <AnchoredWrapper
          anchor={anchor}
          className="pointer-events-auto absolute z-40"
        >
          <div
            data-canvas-toolbar
            data-multi-group-toolbar
            className="flex items-center gap-0.5 rounded-canvas-wrap-5 border border-canvas-border/90 bg-canvas-card/95 p-1 backdrop-blur-sm"
          >
            <span className="whitespace-nowrap px-2 text-canvas-compact font-medium text-canvas-muted">
              {multiGroupCount} chapters
            </span>
            {!canvasReadOnly && (
              <>
                <div className="mx-1 h-5 w-px bg-canvas-border" />
                <GroupActionButton
                  icon={LayoutGrid}
                  label="Arrange in 3 rows"
                  accent
                  onClick={() => arrangeGroupsInGrid(selectedGroupIds, 3)}
                />
              </>
            )}
          </div>
        </AnchoredWrapper>
      </>
    );
  }

  if (showAlignBar) {
    return (
      <>
        {worldBounds && <SelectionBoundsBox bounds={worldBounds} />}
        <AnchoredWrapper
          anchor={anchor}
          className="pointer-events-auto absolute z-40"
        >
          <div data-canvas-toolbar className="flex items-center gap-0.5 rounded-canvas-wrap-5 border border-canvas-border/90 bg-canvas-card/95 p-1 backdrop-blur-sm">
            {ALIGN_ACTIONS.map((a) => (
              <ToolbarIconButton
                key={a.mode}
                label={a.label}
                icon={a.icon}
                onClick={() => alignSelectedCanvasItems(a.mode)}
              />
            ))}
            {canGroup && (
              <>
                <div className="mx-1 h-5 w-px bg-canvas-border" />
                <button
                  type="button"
                  onClick={handleGroup}
                  className="btn rounded-canvas bg-canvas-accent px-2.5 py-1 text-canvas-compact font-medium text-canvas-onAccent"
                >
                  Group
                </button>
              </>
            )}
          </div>
        </AnchoredWrapper>
      </>
    );
  }

  return (
    <AnchoredWrapper
      anchor={anchor}
      className="pointer-events-auto absolute z-40"
    >
      <div className="flex flex-col items-center gap-1">
        <div data-canvas-toolbar className="flex items-center gap-0.5 rounded-canvas-wrap-5 border border-canvas-border/90 bg-canvas-card/95 p-1 backdrop-blur-sm">
          {activeGroup && (
            <>
              <GroupActionButton
                icon={Sparkles}
                label={
                  summarizing
                    ? "Summarizing…"
                    : activeGroup.summaryMarkdown
                      ? "Summarized"
                      : "Summarize"
                }
                accent={!summarizing && !activeGroup.summaryMarkdown}
                disabled={summarizing || Boolean(activeGroup.summaryMarkdown)}
                onClick={handleSummarize}
              />
              <GroupActionButton
                icon={Ungroup}
                label="Ungroup"
                onClick={() => removeGroup(activeGroup.id)}
              />
              <div className="mx-1 h-5 w-px bg-canvas-border" />
              <GroupActionButton
                icon={FileText}
                label="Create PDF"
                disabled
                title="Coming soon"
              />
              <GroupActionButton
                icon={Presentation}
                label="Create Slide"
                disabled
                title="Coming soon"
              />
            </>
          )}
        </div>
        {error && (
          <p data-canvas-toolbar-error className="rounded-canvas border border-canvas-border/90 bg-canvas-card/95 px-2 py-0.5 text-canvas-caption leading-snug text-canvas-danger backdrop-blur-sm">
            {error}
          </p>
        )}
      </div>
    </AnchoredWrapper>
  );
}
