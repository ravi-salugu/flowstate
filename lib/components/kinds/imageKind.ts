import type {
  ImagePayload,
  PayloadContextChunk,
} from "@/lib/types/component";
import {
  expectNumberOpt,
  expectObject,
  expectString,
  expectStringOpt,
  type KindSpec,
} from "@/lib/components/KindRegistry";

export const imageKindSpec: KindSpec<"image"> = {
  kind: "image",
  defaultSize: { w: 520, h: 520 },
  contextMimeTypes: ["image/*", "text/plain"],

  validate(raw: unknown): ImagePayload {
    const obj = expectObject(raw, "image");
    return {
      kind: "image",
      url: expectString(obj.url, "image.url"),
      promptUsed: expectString(obj.promptUsed, "image.promptUsed"),
      width: expectNumberOpt(obj.width, "image.width"),
      height: expectNumberOpt(obj.height, "image.height"),
      alt: expectStringOpt(obj.alt, "image.alt"),
    };
  },

  serializeForContext(payload: ImagePayload): PayloadContextChunk[] {
    // Multimodal-friendly: visual + a textual hint at what the image represents.
    return [
      {
        mimeType: "image/*",
        url: payload.url,
        caption: payload.alt ?? payload.promptUsed,
      },
      {
        mimeType: "text/plain",
        text: `(Image generated from prompt: "${payload.promptUsed}")`,
      },
    ];
  },
};
