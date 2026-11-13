"use client";

import { useRef } from "react";

/**
 * "Continue on Flowstate": upload a chat consolidated with the Flowstate
 * prompt (or any transcript) and it opens as a new canvas.
 */
export function ImportChatCard({
  disabled,
  busy,
  onFile,
}: {
  disabled: boolean;
  busy: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        className="hidden"
        data-home-chat-import-input
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        title="Upload a chat consolidated with the Flowstate prompt, or a transcript (.md / .txt)"
        className="group flex h-full w-full min-h-[13rem] flex-col items-center justify-center gap-2.5 rounded-canvas-lg border border-dashed border-canvas-border bg-canvas-card/50 text-canvas-muted transition-all duration-motion-standard ease-motion-medium hover:-translate-y-1 hover:border-canvas-accent hover:bg-canvas-accent/5 hover:text-canvas-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas-accent disabled:cursor-default disabled:opacity-60 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        {busy ? (
          <span
            className="h-7 w-7 animate-spin rounded-full border-2 border-canvas-border border-t-canvas-accent"
            aria-label="Importing chat"
          />
        ) : (
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-canvas-border bg-canvas-card text-canvas-ink shadow-card">
            <UploadIcon />
          </span>
        )}
        <span className="text-canvas-body font-medium">
          {busy ? "Building canvas…" : "Import a chat"}
        </span>
        <span className="px-6 text-center text-canvas-micro">
          Claude or ChatGPT export, or a transcript
        </span>
      </button>
    </>
  );
}

function UploadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path
        d="M12 16V4m0 0l-5 5m5-5l5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
