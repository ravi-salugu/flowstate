"use client";

import { useEffect, useRef, useState } from "react";
import {
  BranchForkIcon,
  ContextMenuItem,
  TrashIcon,
} from "@/components/MenuIcons";
import { useCanvasStore } from "@/lib/store";
import { counterScaleFactor } from "@/lib/zoomDisplay";

interface CardQaMenuProps {
  cardId: string;
  /** Counter-scale the trigger on zoomed canvas cards. Omit in chat view. */
  viewportScale?: number;
}

function DotsIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="currentColor"
    >
      <circle cx="8" cy="3.25" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="8" cy="12.75" r="1.25" />
    </svg>
  );
}

export function CardQaMenu({ cardId, viewportScale }: CardQaMenuProps) {
  const card = useCanvasStore((s) => s.cards[cardId]);
  const createBranch = useCanvasStore((s) => s.createBranch);
  const deleteFromCard = useCanvasStore((s) => s.deleteFromCard);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      const el = rootRef.current;
      if (el && el.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open]);

  if (!card) return null;

  const canBranch = card.status === "done";
  const isEmpty = card.status === "empty";
  const counterScale =
    viewportScale != null ? counterScaleFactor(viewportScale) : 1;

  return (
    <div
      ref={rootRef}
      className="absolute right-2 top-2 z-30"
      style={
        counterScale !== 1
          ? {
              transform: `scale(${counterScale})`,
              transformOrigin: "top right",
            }
          : undefined
      }
    >
      <button
        type="button"
        aria-label="Card actions"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={`flex h-7 w-7 items-center justify-center rounded-md text-canvas-muted transition-colors hover:bg-canvas-bg hover:text-canvas-ink ${
          open ? "bg-canvas-bg text-canvas-ink" : ""
        }`}
      >
        <DotsIcon />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[200px] overflow-hidden rounded-lg border border-canvas-border bg-canvas-card py-1 shadow-card"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {!isEmpty && (
            <ContextMenuItem
              icon={<BranchForkIcon />}
              label="Pull branch"
              disabled={!canBranch}
              onClick={() => {
                if (!canBranch) return;
                createBranch(cardId, "left");
                setOpen(false);
              }}
            />
          )}
          <ContextMenuItem
            icon={<TrashIcon />}
            label={isEmpty ? "Delete card" : "Delete from below"}
            onClick={() => {
              deleteFromCard(cardId);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
