"use client";

import { raiseGuestWallIfLimited } from "@/lib/billing/guestWall";

export interface QuickExplainCallbacks {
  onToken: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export interface QuickExplainHandle {
  cancel: () => void;
}

export function quickExplain(
  text: string,
  cb: QuickExplainCallbacks,
): QuickExplainHandle {
  let cancelled = false;
  const controller = new AbortController();

  const run = async () => {
    try {
      const res = await fetch("/api/quick-explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      if (!res.ok) {
        // A spent guest allowance is a conversion moment, not an error. The
        // modal already explains itself, so report nothing here — "HTTP 402"
        // in the popover would be alarming and meaningless.
        if (await raiseGuestWallIfLimited(res)) {
          cb.onDone();
          return;
        }
        cb.onError(`HTTP ${res.status}`);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done || cancelled) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          if (raw === "[DONE]") continue;
          try {
            const parsed = JSON.parse(raw) as {
              text?: string;
              error?: string;
              done?: boolean;
            };
            if (parsed.error) {
              cb.onError(parsed.error);
              return;
            }
            if (parsed.text) {
              acc += parsed.text;
              cb.onToken(acc);
            }
            if (parsed.done) {
              cb.onDone();
              return;
            }
          } catch {
            // skip malformed chunk
          }
        }
      }
      if (!cancelled) cb.onDone();
    } catch (err) {
      if (!cancelled) {
        const msg = err instanceof Error ? err.message : String(err);
        cb.onError(msg);
      }
    }
  };

  run();

  return {
    cancel: () => {
      cancelled = true;
      controller.abort();
    },
  };
}
