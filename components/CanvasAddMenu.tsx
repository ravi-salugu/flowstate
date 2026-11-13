"use client";

import { useCallback, useEffect, useRef } from "react";
import { GifIcon, ImageIcon, Model3DIcon, DocumentIcon, CodeFileIcon, ChatImportIcon } from "@/components/MenuIcons";
import { MotionOverlayPopover } from "@/components/motion/MotionOverlay";
import { useToolbarPopoverAnchor } from "@/hooks/useToolbarPopoverAnchor";

interface Props {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  containerRef: React.RefObject<HTMLElement | null>;
  onAddImage: () => void;
  onAdd3DModel: () => void;
  onAddDocument: () => void;
  onAddCodeFile: () => void;
  onAddGifs: () => void;
  /** Upload a consolidated chat / transcript; it lands beside the existing work. */
  onImportChat: () => void;
  disabled?: boolean;
}

const menuBtn =
  "flex w-full items-center gap-2.5 rounded-canvas px-2.5 py-2 text-left text-canvas-body-sm font-medium text-canvas-ink transition-colors hover:bg-canvas-bg disabled:cursor-not-allowed disabled:opacity-40";

export function CanvasAddMenu({
  open,
  onClose,
  anchorRef,
  containerRef,
  onAddImage,
  onAdd3DModel,
  onAddDocument,
  onAddCodeFile,
  onAddGifs,
  onImportChat,
  disabled,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const anchorStyle = useToolbarPopoverAnchor(
    anchorRef,
    containerRef,
    open,
    popoverRef,
  );

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    },
    [anchorRef, onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open, handlePointerDown]);

  return (
    <MotionOverlayPopover
      isOpen={open}
      className="pointer-events-auto absolute bottom-full z-[60] mb-2 min-w-[160px] rounded-canvas-wrap-5 border border-canvas-border bg-canvas-card p-1 shadow-card"
      style={{ transformOrigin: "bottom center", ...anchorStyle }}
    >
      <div ref={popoverRef} role="menu" aria-label="Add to canvas">
        <button
          type="button"
          role="menuitem"
          disabled={disabled}
          className={menuBtn}
          onClick={() => {
            onAddImage();
            onClose();
          }}
        >
          <span className="text-canvas-muted">
            <ImageIcon />
          </span>
          Image
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={disabled}
          className={menuBtn}
          onClick={() => {
            onAdd3DModel();
            onClose();
          }}
        >
          <span className="text-canvas-muted">
            <Model3DIcon />
          </span>
          3D model
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={disabled}
          className={menuBtn}
          onClick={() => {
            onAddDocument();
            onClose();
          }}
        >
          <span className="text-canvas-muted">
            <DocumentIcon />
          </span>
          Document
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={disabled}
          className={menuBtn}
          onClick={() => {
            onAddCodeFile();
            onClose();
          }}
        >
          <span className="text-canvas-muted">
            <CodeFileIcon />
          </span>
          Code file
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={disabled}
          className={menuBtn}
          onClick={() => {
            onAddGifs();
            onClose();
          }}
        >
          <span className="text-canvas-muted">
            <GifIcon />
          </span>
          GIFs
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={disabled}
          className={menuBtn}
          title="Upload a chat consolidated with the Flowstate prompt, or a transcript (.md / .txt)"
          onClick={() => {
            onImportChat();
            onClose();
          }}
        >
          <span className="text-canvas-muted">
            <ChatImportIcon />
          </span>
          Import a chat
        </button>
      </div>
    </MotionOverlayPopover>
  );
}
