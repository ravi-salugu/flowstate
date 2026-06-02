"use client";

/**
 * R5a — ConnectionModeModal.
 *
 * Modal shown when the user drops a new connection between two components
 * (R5b wires the trigger; R5c calls onConfirm).
 *
 * Three modes:
 *   - visual     — line only, no data flow
 *   - context    — parent's payload serialized and appended to child's
 *                  generation context for the next prompt (no immediate run)
 *   - regenerate — context + immediately re-run the child generation (R6)
 *
 * Default selection: regenerate (per the design discussion in the original
 * planning conversation — context+regenerate is the strongest "linking
 * implies flow" semantic).
 *
 * "Remember my choice" persists the last selection in localStorage so the
 * modal can be skipped on future drops; loadRememberedMode() and
 * clearRememberedMode() are exported for use by R5c's drop handler and the
 * eventual settings UI.
 */

import { useEffect, useState } from "react";
import type { ConnectionMode } from "@/lib/types/component";

const STORAGE_KEY = "flowstate.r5.connectionMode";

export interface ConnectionModeChoice {
  mode: ConnectionMode;
  /** True if the user asked to remember this mode for next time. */
  remember: boolean;
}

export function loadRememberedMode(): ConnectionMode | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "visual" || v === "context" || v === "regenerate") return v;
  return null;
}

export function clearRememberedMode(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

interface ConnectionModeModalProps {
  open: boolean;
  /** Title of the component the connector is coming from, for the description. */
  fromTitle?: string;
  /** Title of the component the connector is going to. */
  toTitle?: string;
  onConfirm: (choice: ConnectionModeChoice) => void;
  onCancel: () => void;
}

const OPTIONS: Array<{
  value: ConnectionMode;
  label: string;
  description: string;
}> = [
  {
    value: "regenerate",
    label: "Add context + regenerate",
    description:
      "Pipe the parent's content into the child's prompt and immediately re-run generation. Creates a new version.",
  },
  {
    value: "context",
    label: "Add context only",
    description:
      "Append the parent's content to the child's context for the next prompt. Doesn't re-run anything now.",
  },
  {
    value: "visual",
    label: "Visual link only",
    description: "Draw the line — no data flow.",
  },
];

export function ConnectionModeModal({
  open,
  fromTitle,
  toTitle,
  onConfirm,
  onCancel,
}: ConnectionModeModalProps) {
  const [mode, setMode] = useState<ConnectionMode>("regenerate");
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (open) {
      // Reset to default each time the modal opens
      setMode(loadRememberedMode() ?? "regenerate");
      setRemember(false);
    }
  }, [open]);

  if (!open) return null;

  const handleConfirm = () => {
    if (remember && typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, mode);
    }
    onConfirm({ mode, remember });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose connection mode"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      // Stop pointer events at the modal boundary so the underlying canvas
      // root (with its drag / pan / marquee handlers) doesn't eat the
      // click before it reaches the buttons inside the modal.
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-md rounded-2xl border border-canvas-border bg-canvas-card p-5 shadow-card">
        <h2 className="text-base font-semibold text-canvas-ink">
          Connect components
        </h2>
        {(fromTitle || toTitle) && (
          <p className="mt-1 text-xs text-canvas-muted">
            {fromTitle ?? "source"} → {toTitle ?? "target"}
          </p>
        )}

        <div className="mt-4 space-y-2">
          {OPTIONS.map((opt) => {
            const active = mode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                className={`flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  active
                    ? "border-canvas-ink/40 bg-canvas-bg/60"
                    : "border-canvas-border hover:bg-canvas-bg/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-canvas-ink">
                    {opt.label}
                  </span>
                  <span
                    aria-hidden
                    className={`h-3.5 w-3.5 rounded-full border ${
                      active
                        ? "border-canvas-ink bg-canvas-ink"
                        : "border-canvas-border"
                    }`}
                  />
                </div>
                <div className="text-[12px] leading-snug text-canvas-muted">
                  {opt.description}
                </div>
              </button>
            );
          })}
        </div>

        <label className="mt-4 flex items-center gap-2 text-xs text-canvas-muted">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Remember my choice (clearable later)
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm text-canvas-muted hover:bg-canvas-bg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-md bg-canvas-ink px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}
