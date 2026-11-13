import {
  computeCanvasContentBounds,
  type CanvasContentBoundsInput,
} from "@/lib/canvasContentBounds";
import { buildConversationImportCanvasSection } from "@/lib/conversationImport/buildConversationImportCanvasSection";
import type { ConversationImportSpec } from "@/lib/conversationImport/spec";
import type { TranscriptImportCanvasSection } from "@/lib/transcriptImport/playgroundLayout";
import type {
  BranchGroup,
  CanvasArtifactNode,
  Card,
  Connection,
  Thread,
  ThreadGist,
} from "@/lib/store";
import type { SessionArtifact } from "@/lib/sessionArtifacts";

/*
 * Importing into a canvas that already has work on it.
 *
 * The import gets its own section: it is laid out (by the same chapter engine)
 * starting to the RIGHT of everything already on the board, with a clear
 * gutter, and every id it creates carries a fresh prefix. So it can never sit
 * on top of an existing card or artifact, and never collide with one by id —
 * not even with an earlier import of the same file.
 */

/** Gutter between existing content and the imported section. */
export const IMPORT_SECTION_GAP_X = 640;
/** Room above the section for the chapter headings that ride above frames. */
export const IMPORT_SECTION_HEADING_ROOM = 120;

export interface CanvasImportState extends CanvasContentBoundsInput {
  connections: Connection[];
  threads: Record<string, Thread>;
  threadOrder: string[];
  threadGists: Record<string, ThreadGist>;
  groups: Record<string, BranchGroup>;
}

function hasContent(state: CanvasContentBoundsInput): boolean {
  return (
    state.cardOrder.length > 0 ||
    state.canvasArtifactOrder.length > 0 ||
    state.canvasAssetOrder.length > 0 ||
    state.canvasGifOrder.length > 0 ||
    state.canvas3DOrder.length > 0 ||
    state.canvasSkillOrder.length > 0 ||
    state.canvasTextLabelOrder.length > 0
  );
}

/** Top-left of the free region the import should start at. */
export function findImportOrigin(state: CanvasContentBoundsInput): {
  x: number;
  y: number;
} {
  if (!hasContent(state)) return { x: 0, y: 0 };
  const bounds = computeCanvasContentBounds(state, 0);
  return {
    x: Math.round(bounds.x + bounds.w + IMPORT_SECTION_GAP_X),
    y: Math.round(bounds.y + IMPORT_SECTION_HEADING_ROOM),
  };
}

/** A prefix no existing id on the canvas starts with. */
export function freshImportPrefix(
  state: Pick<CanvasContentBoundsInput, "cards">,
  groups: Record<string, BranchGroup>,
  random: () => string = () => Math.random().toString(36).slice(2, 8),
): string {
  for (;;) {
    const prefix = `ci${random()}`;
    const taken =
      Object.keys(state.cards).some((id) => id.startsWith(prefix)) ||
      Object.keys(groups).some((id) => id.startsWith(prefix));
    if (!taken) return prefix;
  }
}

/** Build the import for this canvas: fresh ids, placed in free space. */
export function buildImportForCanvas(
  spec: ConversationImportSpec,
  state: CanvasImportState,
): TranscriptImportCanvasSection {
  return buildConversationImportCanvasSection(spec, {
    idPrefix: freshImportPrefix(state, state.groups),
    origin: findImportOrigin(state),
  });
}

export interface ImportMergePatch {
  cards: Record<string, Card>;
  cardOrder: string[];
  connections: Connection[];
  threads: Record<string, Thread>;
  threadOrder: string[];
  threadGists: Record<string, ThreadGist>;
  groups: Record<string, BranchGroup>;
  sessionArtifacts: Record<string, SessionArtifact>;
  canvasArtifactNodes: Record<string, CanvasArtifactNode>;
  canvasArtifactOrder: string[];
}

/** Additive merge — nothing that is already on the canvas is touched. */
export function mergeImportIntoState(
  state: CanvasImportState,
  section: TranscriptImportCanvasSection,
): ImportMergePatch {
  return {
    cards: { ...state.cards, ...section.cards },
    cardOrder: [...state.cardOrder, ...section.cardOrder],
    connections: [...state.connections, ...section.connections],
    threads: { ...state.threads, ...section.threads },
    threadOrder: [...state.threadOrder, ...section.threadOrder],
    threadGists: { ...state.threadGists, ...section.threadGists },
    groups: { ...state.groups, ...section.groups },
    sessionArtifacts: { ...state.sessionArtifacts, ...section.sessionArtifacts },
    canvasArtifactNodes: {
      ...state.canvasArtifactNodes,
      ...section.canvasArtifactNodes,
    },
    canvasArtifactOrder: [
      ...state.canvasArtifactOrder,
      ...section.canvasArtifactOrder,
    ],
  };
}
