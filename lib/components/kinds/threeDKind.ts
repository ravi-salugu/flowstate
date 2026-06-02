import type {
  PayloadContextChunk,
  ThreeDPayload,
} from "@/lib/types/component";
import {
  expectLiteral,
  expectObject,
  expectString,
  expectStringOpt,
  type KindSpec,
} from "@/lib/components/KindRegistry";

const FORMATS = ["glb", "gltf"] as const;

export const threeDKindSpec: KindSpec<"3d"> = {
  kind: "3d",
  defaultSize: { w: 520, h: 480 },
  contextMimeTypes: ["text/plain", "image/*"],

  validate(raw: unknown): ThreeDPayload {
    const obj = expectObject(raw, "3d");
    return {
      kind: "3d",
      modelUrl: expectString(obj.modelUrl, "3d.modelUrl"),
      format: expectLiteral(obj.format, FORMATS, "3d.format"),
      previewImageUrl: expectStringOpt(
        obj.previewImageUrl,
        "3d.previewImageUrl",
      ),
    };
  },

  serializeForContext(payload: ThreeDPayload): PayloadContextChunk[] {
    const chunks: PayloadContextChunk[] = [
      {
        mimeType: "text/plain",
        text: `3D model (${payload.format}): ${payload.modelUrl}`,
      },
    ];
    if (payload.previewImageUrl) {
      chunks.push({
        mimeType: "image/*",
        url: payload.previewImageUrl,
        caption: "3D model preview",
      });
    }
    return chunks;
  },
};
