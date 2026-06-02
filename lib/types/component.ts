/**
 * Unified v2 Component model.
 *
 * Replaces the v1 split between Card (Q&A unit) and CanvasArtifactNode (rich
 * output) with one polymorphic entity. Each Component has a `kind`
 * discriminator that selects:
 *   - the payload shape (via the ComponentPayload discriminated union below)
 *   - the renderer, validator, generator, and context-serializer
 *     (registered per-kind in /lib/components/KindRegistry.ts)
 *
 * Re-exports the DB string-literal unions from /lib/supabase/database.types so
 * frontend code only needs to import from here.
 *
 * R2 status: types exist. Nothing reads or writes them yet — the v1 canvas
 * is unchanged. R3 wires the service layer that produces / consumes these.
 */

import type {
  ComponentKindDb,
  ComponentStatusDb,
  ComponentCreatedByRoleDb,
  ConnectorSideDb,
  ConnectionModeDb,
} from "@/lib/supabase/database.types";

// -- Shared enums (re-exported from DB types) -------------------------------

export type ComponentKind = ComponentKindDb;
export type ComponentStatus = ComponentStatusDb;
export type ComponentCreatedByRole = ComponentCreatedByRoleDb;
export type ConnectorSide = ConnectorSideDb;
export type ConnectionMode = ConnectionModeDb;

// -- Payload shape per kind --------------------------------------------------

export interface TableColumnDef {
  key: string;
  label: string;
}

export interface TableCellRich {
  value: string;
  badge?: string;
}

export type TableRow = Record<string, string | TableCellRich>;

export interface CodeFile {
  path: string;
  language: string;
  content: string;
}

export interface GalleryImage {
  url: string;
  caption?: string;
  sourceUrl?: string;
  thumb?: string;
}

export interface ChartSeries {
  label: string;
  values: number[];
}

export interface ChartData {
  labels: string[];
  series: ChartSeries[];
}

// -- The discriminated union -------------------------------------------------

export type ChatPayload = {
  kind: "chat";
  question: string;
  answer: string;
};

export type TextPayload = {
  kind: "text";
  markdown: string;
};

export type ImagePayload = {
  kind: "image";
  url: string;
  promptUsed: string;
  width?: number;
  height?: number;
  alt?: string;
};

export type GalleryPayload = {
  kind: "gallery";
  images: GalleryImage[];
};

export type TablePayload = {
  kind: "table";
  columns: TableColumnDef[];
  rows: TableRow[];
};

export type CodePayload = {
  kind: "code";
  files: CodeFile[];
};

export type ChartPayload = {
  kind: "chart";
  chartType: "line" | "bar" | "pie" | "scatter";
  data: ChartData;
};

export type BrowserPayload = {
  kind: "browser";
  url: string;
  embedType: "iframe" | "video";
  title?: string;
};

export type ThreeDPayload = {
  kind: "3d";
  modelUrl: string;
  format: "glb" | "gltf";
  previewImageUrl?: string;
};

export type UIPayload = {
  kind: "ui";
  html: string;
  css?: string;
  js?: string;
};

export type ComponentPayload =
  | ChatPayload
  | TextPayload
  | ImagePayload
  | GalleryPayload
  | TablePayload
  | CodePayload
  | ChartPayload
  | BrowserPayload
  | ThreeDPayload
  | UIPayload;

/**
 * Helper: extract the payload type for a specific kind.
 *   PayloadFor<"gallery">  →  GalleryPayload
 */
export type PayloadFor<K extends ComponentKind> = Extract<
  ComponentPayload,
  { kind: K }
>;

// -- The Component entity ----------------------------------------------------

export interface Component<K extends ComponentKind = ComponentKind> {
  id: string;
  canvasId: string;
  threadId: string;
  kind: K;

  position: { x: number; y: number };
  size: { w: number; h: number };

  title?: string;
  status: ComponentStatus;

  createdByRole: ComponentCreatedByRole;
  createdByUserId?: string;
  updatedByUserId?: string;

  prompt?: string;
  modelId?: string;

  /** Pointer to the active version row in component_versions. */
  currentVersionId: string;
  /** Materialised payload for the current version. */
  payload: PayloadFor<K>;

  createdAt: number;
  updatedAt: number;
}

// -- Context flow primitives -------------------------------------------------

/**
 * One unit of context contributed by a single component when its content
 * is fed into a downstream component's generation prompt.
 *
 * Kinds with multi-part content (e.g. a gallery) return multiple chunks.
 */
export interface PayloadContextChunk {
  /** MIME type of this fragment ("text/markdown", "image/png", "text/csv", etc.) */
  mimeType: string;
  /** Inline text content (for text-shaped chunks). */
  text?: string;
  /** Remote URL pointing at media (image, video, model). */
  url?: string;
  /** Inline base64 data URI (small media). */
  dataUri?: string;
  /** Optional human caption shown above this chunk in debugging UIs. */
  caption?: string;
}
