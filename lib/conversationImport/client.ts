"use client";

import { computeCanvasContentBounds } from "@/lib/canvasContentBounds";
import { buildCanvasSnapshot, type CanvasSnapshot } from "@/lib/canvasSnapshot";
import { buildConversationImportCanvasSection } from "@/lib/conversationImport/buildConversationImportCanvasSection";
import {
  buildImportForCanvas,
  mergeImportIntoState,
} from "@/lib/conversationImport/placeInCanvas";
import type { ConversationImportSpec } from "@/lib/conversationImport/spec";
import { raiseGuestWallIfLimited } from "@/lib/billing/guestWall";
import { NEW_CANVAS_ARTIFACT_STYLE_ID } from "@/lib/design/style/stylePacks";
import { DEFAULT_MODEL_ID } from "@/lib/models";
import { useCanvasStore } from "@/lib/store";
import type { TranscriptImportCanvasSection } from "@/lib/transcriptImport/playgroundLayout";
import { viewportFramedOnWorldRect } from "@/lib/viewport";

/** Files the import accepts: chat exports, transcripts, notes. */
export const CONVERSATION_IMPORT_ACCEPT =
  ".md,.markdown,.txt,text/markdown,text/plain";
const MAX_IMPORT_BYTES = 600_000;

export type ImportRequestResult =
  /** `truncated` — the file was long and the model stopped early. */
  | { ok: true; spec: ConversationImportSpec; truncated: boolean }
  /** `error: null` — the guest wall already took over the screen. */
  | { ok: false; error: string | null };

/** Upload a file to the metered import and get the canvas spec back. */
export async function requestConversationImport(
  file: File,
  endpoint = "/api/conversation-import",
): Promise<ImportRequestResult> {
  if (file.size > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      error: `${file.name} is too large (${Math.round(file.size / 1000)} KB). Consolidate the chat with the Flowstate prompt first.`,
    };
  }
  try {
    const text = await file.text();
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, fileName: file.name }),
    });
    if (res.status === 402 && (await raiseGuestWallIfLimited(res.clone()))) {
      return { ok: false, error: null };
    }
    const json = (await res.json().catch(() => ({}))) as {
      spec?: ConversationImportSpec;
      truncated?: boolean;
      error?: string;
      code?: string;
    };
    if (res.ok && json.spec) {
      return { ok: true, spec: json.spec, truncated: Boolean(json.truncated) };
    }
    if (json.code === "credit_limit_reached") {
      return {
        ok: false,
        error: "You're out of credits, so the import can't run right now.",
      };
    }
    return { ok: false, error: json.error ?? `Import failed (${res.status}).` };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Import failed.",
    };
  }
}

function sectionBounds(section: TranscriptImportCanvasSection) {
  return computeCanvasContentBounds({
    cards: section.cards,
    cardOrder: section.cardOrder,
    canvasArtifactNodes: section.canvasArtifactNodes,
    canvasArtifactOrder: section.canvasArtifactOrder,
    sessionArtifacts: section.sessionArtifacts,
    canvasAssets: {},
    canvasAssetNodes: {},
    canvasAssetOrder: [],
    canvasGifNodes: {},
    canvasGifOrder: [],
    canvas3DNodes: {},
    canvas3DOrder: [],
    canvasSkills: {},
    canvasSkillNodes: {},
    canvasSkillOrder: [],
    canvasTextLabels: {},
    canvasTextLabelOrder: [],
  });
}

/**
 * Add the import to the open canvas, in its own section to the right of the
 * existing work, then frame it. Undoable; nothing existing moves.
 */
export function importIntoActiveCanvas(
  spec: ConversationImportSpec,
  container?: { width: number; height: number },
): boolean {
  const store = useCanvasStore.getState();
  if (store.canvasReadOnly) return false;

  const section = buildImportForCanvas(spec, store);
  store.recordUndo();
  useCanvasStore.setState((state) => ({
    ...mergeImportIntoState(state, section),
    collaborationHasEdits: true,
  }));

  const width = container?.width ?? window.innerWidth;
  const height = container?.height ?? window.innerHeight;
  useCanvasStore
    .getState()
    .setViewport(
      viewportFramedOnWorldRect(sectionBounds(section), width, height, {
        maxScale: 0.6,
      }),
    );
  return true;
}

/** A complete canvas snapshot holding only the import — for "new canvas". */
export function snapshotForImport(spec: ConversationImportSpec): CanvasSnapshot {
  const section = buildConversationImportCanvasSection(spec);
  // Open framed on the import, at this window's size.
  const viewport =
    typeof window === "undefined"
      ? { x: 0, y: 0, scale: 0.55 }
      : viewportFramedOnWorldRect(
          sectionBounds(section),
          window.innerWidth,
          window.innerHeight,
          { maxScale: 0.6 },
        );
  return buildCanvasSnapshot({
    viewport,
    cards: section.cards,
    cardOrder: section.cardOrder,
    connections: section.connections,
    threads: section.threads,
    threadOrder: section.threadOrder,
    threadGists: section.threadGists,
    groups: section.groups,
    connectorStyle: "orthogonal",
    canvasBackgroundStyle: "grid",
    canvasTheme: "light",
    canvasArtifactStyle: NEW_CANVAS_ARTIFACT_STYLE_ID,
    selectedModel: DEFAULT_MODEL_ID,
    viewMode: "canvas",
    sessionArtifacts: section.sessionArtifacts,
    canvasArtifactNodes: section.canvasArtifactNodes,
    canvasArtifactOrder: section.canvasArtifactOrder,
    canvasTextLabels: {},
    canvasTextLabelOrder: [],
    canvasAssets: {},
    canvasAssetNodes: {},
    canvasAssetOrder: [],
    uploadedAttachments: [],
    collaborationHasEdits: false,
  });
}
