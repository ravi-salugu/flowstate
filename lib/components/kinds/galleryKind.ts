import type {
  GalleryImage,
  GalleryPayload,
  PayloadContextChunk,
} from "@/lib/types/component";
import {
  expectArray,
  expectObject,
  expectString,
  expectStringOpt,
  type KindSpec,
} from "@/lib/components/KindRegistry";

function validateImage(raw: unknown, i: number): GalleryImage {
  const obj = expectObject(raw, `gallery.images[${i}]`);
  return {
    url: expectString(obj.url, `gallery.images[${i}].url`),
    caption: expectStringOpt(obj.caption, `gallery.images[${i}].caption`),
    sourceUrl: expectStringOpt(obj.sourceUrl, `gallery.images[${i}].sourceUrl`),
    thumb: expectStringOpt(obj.thumb, `gallery.images[${i}].thumb`),
  };
}

export const galleryKindSpec: KindSpec<"gallery"> = {
  kind: "gallery",
  defaultSize: { w: 560, h: 420 },
  contextMimeTypes: ["image/*"],

  validate(raw: unknown): GalleryPayload {
    const obj = expectObject(raw, "gallery");
    return {
      kind: "gallery",
      images: expectArray(obj.images, "gallery.images", validateImage),
    };
  },

  serializeForContext(payload: GalleryPayload): PayloadContextChunk[] {
    // One image chunk per gallery item; downstream multimodal model receives
    // all images plus captions in order.
    return payload.images.map((img, i) => ({
      mimeType: "image/*",
      url: img.url,
      caption: img.caption ?? `Gallery image ${i + 1}`,
    }));
  },
};
