import type {
  PayloadContextChunk,
  UIPayload,
} from "@/lib/types/component";
import {
  expectObject,
  expectString,
  expectStringOpt,
  type KindSpec,
} from "@/lib/components/KindRegistry";

const MAX_UI_BYTES = 64 * 1024; // 64 KB cap on inline HTML/CSS/JS

export const uiKindSpec: KindSpec<"ui"> = {
  kind: "ui",
  defaultSize: { w: 560, h: 400 },
  contextMimeTypes: ["text/plain"],

  validate(raw: unknown): UIPayload {
    const obj = expectObject(raw, "ui");
    const html = expectString(obj.html, "ui.html");
    const css = expectStringOpt(obj.css, "ui.css");
    const js = expectStringOpt(obj.js, "ui.js");
    const totalBytes = html.length + (css?.length ?? 0) + (js?.length ?? 0);
    if (totalBytes > MAX_UI_BYTES) {
      throw new Error(
        `[validate ui] payload too large: ${totalBytes} bytes (cap ${MAX_UI_BYTES})`,
      );
    }
    return { kind: "ui", html, css, js };
  },

  serializeForContext(payload: UIPayload): PayloadContextChunk[] {
    // Describe the widget structurally rather than dumping raw code into context.
    const desc = [
      "Interactive UI widget (sandboxed HTML/CSS/JS):",
      "```html",
      payload.html.slice(0, 500) +
        (payload.html.length > 500 ? "\n…(truncated)" : ""),
      "```",
    ].join("\n");
    return [
      {
        mimeType: "text/plain",
        text: desc,
        caption: "Custom UI widget",
      },
    ];
  },
};
