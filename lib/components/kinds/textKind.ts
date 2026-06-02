import type {
  PayloadContextChunk,
  TextPayload,
} from "@/lib/types/component";
import {
  expectObject,
  expectString,
  type KindSpec,
} from "@/lib/components/KindRegistry";

export const textKindSpec: KindSpec<"text"> = {
  kind: "text",
  defaultSize: { w: 360, h: 200 },
  contextMimeTypes: ["text/markdown"],

  validate(raw: unknown): TextPayload {
    const obj = expectObject(raw, "text");
    return {
      kind: "text",
      markdown: expectString(obj.markdown, "text.markdown"),
    };
  },

  serializeForContext(payload: TextPayload): PayloadContextChunk[] {
    return [
      {
        mimeType: "text/markdown",
        text: payload.markdown,
        caption: "Text note",
      },
    ];
  },
};
