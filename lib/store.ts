"use client";

import type { ArtifactPayload, ResponseType } from "@/lib/artifactTypes";
import { payloadToArtifactKind } from "@/lib/artifactTypes";
import type {
  CanvasSnapshot,
  CanvasSnapshotSource,
} from "@/lib/canvasSnapshot";
import { computeAutoLayout } from "@/lib/autoLayout";
import {
  BRANCH_CARD_WIDTH,
  BRANCH_HORIZONTAL_GAP,
  childBandY,
  computeFollowUpPosition,
  relayoutVerticalChainOf,
  repairVerticalChainsOnly,
} from "@/lib/canvasLayout";
import {
  CANVAS_ARTIFACT_WIDTH,
  CANVAS_TABLE_ARTIFACT_WIDTH,
  DEFAULT_ARTIFACT_HEIGHT,
  TABLE_ARTIFACT_HEIGHT,
  emptyCardSize,
  getArtifactBounds,
  getCardBounds,
} from "@/lib/canvasNodeBounds";

export { CANVAS_ARTIFACT_WIDTH, CANVAS_TABLE_ARTIFACT_WIDTH } from "@/lib/canvasNodeBounds";
import { pickDefaultThreadId } from "@/lib/chatThreads";
import { buildSummaryContentFingerprint } from "@/lib/groupSummaryStaleness";
import {
  computeDefaultSpawnPosition,
  findCanvasNodeByArtifactId,
} from "@/lib/canvasArtifacts";
import {
  appendArtifactVersion,
  createSessionArtifactFromPayload,
  getLatestVersion,
  getVersionById,
  normalizePayloadForRegistry,
  resolveThreadArtifactId,
  type AttachedArtifactRef,
  type SessionArtifact,
} from "@/lib/sessionArtifacts";
import {
  captureGraphSnapshot,
  GraphSnapshot,
  MAX_UNDO_STACK,
} from "@/lib/undo";
import { create } from "zustand";

export type ClaudeModel =
  | "claude-opus-4-7"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5";

export type CardStatus = "empty" | "thinking" | "streaming" | "done";

export interface CardImage {
  url: string;
  thumb: string;
  alt: string;
}

export interface CardSize {
  w: number;
  h: number;
}

export type { ArtifactPayload, ResponseType };
export type { AttachedArtifactRef, SessionArtifact } from "@/lib/sessionArtifacts";

export interface PendingFileAttachment {
  name: string;
  mimeType: string;
  base64: string;
}

export interface UploadedAttachment {
  id: string;
  name: string;
  type: string;
  data: string;
  addedAt: number;
}

export interface Card {
  id: string;
  threadId: string;
  question: string;
  answer: string;
  status: CardStatus;
  thinkingLabel?: string;
  position: { x: number; y: number };
  parentCardId: string | null;
  parentConversationId: string | null;
  size?: CardSize;
  artifactId?: string;
  images?: CardImage[];
  responseType?: ResponseType;
  artifactPayload?: ArtifactPayload;
  outputArtifactId?: string;
  outputArtifactVersionId?: string;
  attachedArtifacts?: AttachedArtifactRef[];
  inheritedArtifactId?: string;
  pendingFiles?: PendingFileAttachment[];
}

export interface FollowUpOptions {
  attachedArtifacts?: AttachedArtifactRef[];
  pendingImages?: CardImage[];
  pendingFiles?: PendingFileAttachment[];
}

export type CardSide = "top" | "bottom" | "left" | "right";
export type PlugSide = "left" | "right";

export type PlugDragState =
  | {
      kind: "branch";
      sourceCardId: string;
      fromSide: PlugSide;
      pointerWorld: { x: number; y: number };
      didDrag: boolean;
    }
  | {
      kind: "artifact";
      artifactNodeId: string;
      artifactId: string;
      versionId: string;
      fromSide: PlugSide;
      pointerWorld: { x: number; y: number };
      didDrag: boolean;
      receiveTargetCardId: string | null;
      hoveredReceiveSide: PlugSide | null;
    };

export interface Connection {
  id: string;
  from: string;
  to: string;
  fromSide: CardSide;
  toSide: CardSide;
}

export interface Thread {
  id: string;
  accentColour: string;
}

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export type ConnectorStyle = "curvy" | "orthogonal";
export type AppViewMode = "canvas" | "chat";

export interface BranchGroup {
  id: string;
  label: string;
  familyRootThreadIds: string[];
  summaryMarkdown: string | null;
  summaryGeneratedAt?: number;
  summaryContentFingerprint?: string;
}

export interface CanvasArtifactNode {
  id: string;
  artifactId: string;
  versionId: string;
  sourceCardId: string;
  position: { x: number; y: number };
  size?: CardSize;
}

export const CANVAS_TEXT_LABEL_FONT_SIZE = 40;

export type CanvasPlacementTool = "question" | "text";

export interface CanvasTextLabel {
  id: string;
  text: string;
  position: { x: number; y: number };
  fontSize: number;
}

/** Horizontal gap between a source card's right edge and a spawned artifact. */
export const ARTIFACT_SPAWN_GAP_X = 24;

interface CanvasState {
  selectedModel: ClaudeModel;
  setModel: (model: ClaudeModel) => void;

  leftPanelCollapsed: boolean;
  setLeftPanelCollapsed: (collapsed: boolean) => void;
  toggleLeftPanel: () => void;

  uploadedAttachments: UploadedAttachment[];
  addUploadedAttachment: (attachment: UploadedAttachment) => void;
  removeUploadedAttachment: (id: string) => void;

  viewMode: AppViewMode;
  activeThreadId: string | null;
  setViewMode: (mode: AppViewMode) => void;
  setActiveThreadId: (threadId: string) => void;

  canvasPlacementRequest: CanvasPlacementTool | null;
  activeCanvasPlacement: CanvasPlacementTool | null;
  requestCanvasPlacement: (tool: CanvasPlacementTool) => void;

  sessionUsage: { inputTokens: number; outputTokens: number };
  addUsage: (input: number, output: number) => void;

  viewport: Viewport;
  cards: Record<string, Card>;
  cardOrder: string[];
  connections: Connection[];
  threads: Record<string, Thread>;
  threadOrder: string[];
  openArtifactCardId: string | null;
  openGroupArtifactId: string | null;
  sessionArtifacts: Record<string, SessionArtifact>;
  openSessionArtifactId: string | null;
  openSessionArtifactVersionId: string | null;
  canvasArtifactNodes: Record<string, CanvasArtifactNode>;
  canvasArtifactOrder: string[];
  selectedCanvasArtifactId: string | null;
  canvasTextLabels: Record<string, CanvasTextLabel>;
  canvasTextLabelOrder: string[];
  selectedCanvasTextLabelId: string | null;
  connectorStyle: ConnectorStyle;
  undoPast: GraphSnapshot[];

  plugDrag: PlugDragState | null;
  plugComposerAttachments: Record<string, AttachedArtifactRef>;

  selectedFamilyRootIds: string[];
  groups: Record<string, BranchGroup>;
  activeGroupId: string | null;

  setSelectedFamilyRootIds: (rootThreadIds: string[]) => void;
  clearSelection: () => void;
  createGroupFromSelection: (label?: string) => string | null;
  setGroupSummary: (groupId: string, markdown: string) => void;
  openGroupArtifact: (groupId: string) => void;
  closeGroupArtifact: () => void;
  removeGroup: (groupId: string) => void;
  setActiveGroupId: (groupId: string | null) => void;

  recordUndo: () => void;
  undo: () => void;

  setViewport: (next: Partial<Viewport>) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (
    factor: number,
    pivotScreenX: number,
    pivotScreenY: number,
  ) => void;

  updateCard: (id: string, patch: Partial<Card>) => void;
  setCardSize: (id: string, size: CardSize) => void;
  setCanvasArtifactSize: (nodeId: string, size: CardSize) => void;
  moveSubtree: (rootId: string, dx: number, dy: number) => void;
  syncFollowUpChildPosition: (parentId: string, childId: string) => void;

  createRootCard: (position: { x: number; y: number }) => string;
  createFollowUp: (
    parentId: string,
    question: string,
    options?: FollowUpOptions,
  ) => string | null;
  createBranch: (sourceId: string, side: "left" | "right") => string | null;
  createBranchAt: (
    sourceId: string,
    side: "left" | "right",
    position: { x: number; y: number },
  ) => string | null;
  createRootCardWithAttachment: (
    position: { x: number; y: number },
    ref: AttachedArtifactRef,
  ) => string;
  setCardComposerAttachment: (
    cardId: string,
    ref: AttachedArtifactRef,
  ) => void;
  startPlugDrag: (drag: PlugDragState) => void;
  updatePlugDrag: (patch: Partial<Pick<PlugDragState, "pointerWorld">> & {
    receiveTargetCardId?: string | null;
    hoveredReceiveSide?: PlugSide | null;
    didDrag?: boolean;
  }) => void;
  endPlugDrag: () => void;
  cancelPlugDrag: () => void;
  deleteFromCard: (cardId: string) => void;

  createArtifactVersion: (
    artifactId: string | null,
    payload: ArtifactPayload,
    cardId: string,
  ) => { artifactId: string; versionId: string };
  openSessionArtifact: (artifactId: string, versionId?: string) => void;
  setArtifactPanelVersion: (versionId: string) => void;
  listSessionArtifacts: () => SessionArtifact[];

  spawnCanvasArtifact: (
    artifactId: string,
    versionId: string,
    opts?: { position?: { x: number; y: number }; focus?: boolean },
  ) => string | null;
  ensureCanvasArtifactAt: (
    artifactId: string,
    versionId: string,
    position: { x: number; y: number },
  ) => string | null;
  moveCanvasArtifact: (nodeId: string, dx: number, dy: number) => void;
  selectCanvasArtifact: (nodeId: string | null) => void;
  setCanvasArtifactVersion: (nodeId: string, versionId: string) => void;
  removeCanvasArtifact: (nodeId: string) => void;

  spawnCanvasTextLabel: (
    position: { x: number; y: number },
    text?: string,
  ) => string;
  moveCanvasTextLabel: (nodeId: string, dx: number, dy: number) => void;
  updateCanvasTextLabel: (nodeId: string, text: string) => void;
  removeCanvasTextLabel: (nodeId: string) => void;
  selectCanvasTextLabel: (nodeId: string | null) => void;

  openArtifact: (cardId: string) => void;
  closeArtifact: () => void;
  setConnectorStyle: (style: ConnectorStyle) => void;
  autoLayoutCanvas: () => void;

  getCanvasSnapshotSource: () => CanvasSnapshotSource;
  hydrateFromSnapshot: (snapshot: CanvasSnapshot) => void;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 3;

// Placeholder palette for thread accents until OQ-01 is resolved.
// Cycles after 8 threads.
const PALETTE = [
  "#7C9EFF", // blue
  "#FF8FA3", // pink
  "#6FCF97", // green
  "#F2C94C", // amber
  "#BB6BD9", // purple
  "#56CCF2", // cyan
  "#F2994A", // orange
  "#9B51E0", // violet
];

const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;

function newCanvasArtifactNodeId() {
  return newId("cano");
}

function newCanvasTextLabelId() {
  return newId("ctxt");
}

function collectSubtreeIds(
  connections: Connection[],
  rootId: string,
): Set<string> {
  const subtree = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const cid = queue.shift()!;
    if (subtree.has(cid)) continue;
    subtree.add(cid);
    for (const conn of connections) {
      if (conn.from === cid) queue.push(conn.to);
    }
  }
  return subtree;
}

export const newCardId = () => newId("card");
const newThreadId = () => newId("thread");
const newGroupId = () => newId("group");

function layoutStateFrom(state: CanvasState): {
  cards: Record<string, Card>;
  connections: Connection[];
  cardOrder: string[];
  canvasArtifactNodes: Record<string, CanvasArtifactNode>;
} {
  return {
    cards: state.cards,
    connections: state.connections,
    cardOrder: state.cardOrder,
    canvasArtifactNodes: state.canvasArtifactNodes,
  };
}

function normalizeLoadedCards(cards: Record<string, Card>): Record<string, Card> {
  const next = { ...cards };
  for (const [id, card] of Object.entries(next)) {
    if (card.status === "empty" && !card.size) {
      next[id] = { ...card, size: emptyCardSize() };
    }
  }
  return next;
}

function normalizeLoadedArtifactNodes(
  nodes: Record<string, CanvasArtifactNode>,
  sessionArtifacts: Record<string, SessionArtifact>,
): Record<string, CanvasArtifactNode> {
  const next = { ...nodes };
  for (const [id, node] of Object.entries(next)) {
    const art = sessionArtifacts[node.artifactId];
    const bounds = getArtifactBounds(node, art);
    next[id] = { ...node, size: { w: bounds.w, h: bounds.h } };
  }
  return next;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  selectedModel: "claude-sonnet-4-6",
  sessionUsage: { inputTokens: 0, outputTokens: 0 },
  addUsage: (input, output) =>
    set((s) => ({
      sessionUsage: {
        inputTokens: s.sessionUsage.inputTokens + input,
        outputTokens: s.sessionUsage.outputTokens + output,
      },
    })),
  setModel: (model) => set({ selectedModel: model }),

  leftPanelCollapsed: true,
  setLeftPanelCollapsed: (collapsed) => set({ leftPanelCollapsed: collapsed }),
  toggleLeftPanel: () =>
    set((s) => ({ leftPanelCollapsed: !s.leftPanelCollapsed })),

  uploadedAttachments: [],
  addUploadedAttachment: (attachment) =>
    set((s) => ({
      uploadedAttachments: [...s.uploadedAttachments, attachment],
    })),
  removeUploadedAttachment: (id) =>
    set((s) => ({
      uploadedAttachments: s.uploadedAttachments.filter((a) => a.id !== id),
    })),

  viewMode: "canvas",
  activeThreadId: null,
  canvasPlacementRequest: null,
  activeCanvasPlacement: null,
  requestCanvasPlacement: (tool) =>
    set({ canvasPlacementRequest: tool, viewMode: "canvas" }),
  setViewMode: (mode) =>
    set((state) => {
      if (mode === "chat" && !state.activeThreadId && state.threadOrder[0]) {
        return { viewMode: mode, activeThreadId: state.threadOrder[0] };
      }
      return { viewMode: mode };
    }),
  setActiveThreadId: (threadId) => set({ activeThreadId: threadId }),

  viewport: { x: 0, y: 0, scale: 1 },
  cards: {},
  cardOrder: [],
  connections: [],
  threads: {},
  threadOrder: [],
  openArtifactCardId: null,
  openGroupArtifactId: null,
  sessionArtifacts: {},
  openSessionArtifactId: null,
  openSessionArtifactVersionId: null,
  canvasArtifactNodes: {},
  canvasArtifactOrder: [],
  selectedCanvasArtifactId: null,
  canvasTextLabels: {},
  canvasTextLabelOrder: [],
  selectedCanvasTextLabelId: null,
  connectorStyle: "orthogonal",
  undoPast: [],

  plugDrag: null,
  plugComposerAttachments: {},

  selectedFamilyRootIds: [],
  groups: {},
  activeGroupId: null,

  setSelectedFamilyRootIds: (rootThreadIds) =>
    set({ selectedFamilyRootIds: rootThreadIds }),

  clearSelection: () => set({ selectedFamilyRootIds: [] }),

  createGroupFromSelection: (label) => {
    const safeLabel =
      typeof label === "string" && label.trim().length > 0
        ? label.trim()
        : undefined;
    let groupId: string | null = null;
    set((state) => {
      if (state.selectedFamilyRootIds.length === 0) return state;
      const id = newGroupId();
      groupId = id;
      const groupCount = Object.keys(state.groups).length;
      const group: BranchGroup = {
        id,
        label: safeLabel ?? `Group ${groupCount + 1}`,
        familyRootThreadIds: [...state.selectedFamilyRootIds],
        summaryMarkdown: null,
      };
      return {
        groups: { ...state.groups, [id]: group },
        activeGroupId: id,
        selectedFamilyRootIds: [],
      };
    });
    return groupId;
  },

  setGroupSummary: (groupId, markdown) =>
    set((state) => {
      const group = state.groups[groupId];
      if (!group) return state;
      const nextGroup: BranchGroup = {
        ...group,
        summaryMarkdown: markdown,
        summaryGeneratedAt: Date.now(),
        summaryContentFingerprint: buildSummaryContentFingerprint(
          state,
          group,
        ),
      };
      return {
        groups: {
          ...state.groups,
          [groupId]: nextGroup,
        },
      };
    }),

  openGroupArtifact: (groupId) =>
    set((state) => {
      const group = state.groups[groupId];
      if (!group?.summaryMarkdown) return state;
      const fingerprint =
        group.summaryContentFingerprint ??
        buildSummaryContentFingerprint(state, group);
      return {
        openGroupArtifactId: groupId,
        openArtifactCardId: null,
        openSessionArtifactId: null,
        openSessionArtifactVersionId: null,
        groups: {
          ...state.groups,
          [groupId]: { ...group, summaryContentFingerprint: fingerprint },
        },
      };
    }),

  closeGroupArtifact: () => set({ openGroupArtifactId: null }),

  removeGroup: (groupId) =>
    set((state) => {
      if (!state.groups[groupId]) return state;
      const next = { ...state.groups };
      delete next[groupId];
      return {
        groups: next,
        activeGroupId:
          state.activeGroupId === groupId ? null : state.activeGroupId,
        openGroupArtifactId:
          state.openGroupArtifactId === groupId
            ? null
            : state.openGroupArtifactId,
      };
    }),

  setActiveGroupId: (groupId) => set({ activeGroupId: groupId }),

  recordUndo: () =>
    set((state) => {
      const snap = captureGraphSnapshot(state);
      const next = [...state.undoPast, snap];
      if (next.length > MAX_UNDO_STACK) next.shift();
      return { undoPast: next };
    }),

  undo: () =>
    set((state) => {
      if (state.undoPast.length === 0) return state;
      const snap = state.undoPast[state.undoPast.length - 1];
      return {
        ...snap,
        undoPast: state.undoPast.slice(0, -1),
      };
    }),

  setConnectorStyle: (style) => set({ connectorStyle: style }),

  setViewport: (next) =>
    set((state) => ({ viewport: { ...state.viewport, ...next } })),

  panBy: (dx, dy) =>
    set((state) => ({
      viewport: {
        ...state.viewport,
        x: state.viewport.x + dx,
        y: state.viewport.y + dy,
      },
    })),

  zoomAt: (factor, pivotScreenX, pivotScreenY) =>
    set((state) => {
      const { x, y, scale } = state.viewport;
      const nextScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, scale * factor),
      );
      const k = nextScale / scale;
      // Keep the world point under the cursor fixed while scaling.
      const nx = pivotScreenX - k * (pivotScreenX - x);
      const ny = pivotScreenY - k * (pivotScreenY - y);
      return { viewport: { x: nx, y: ny, scale: nextScale } };
    }),

  updateCard: (id, patch) =>
    set((state) => {
      const existing = state.cards[id];
      if (!existing) return state;
      return {
        cards: { ...state.cards, [id]: { ...existing, ...patch } },
      };
    }),

  /**
   * Updates the measured size of a card and re-snaps its bottom-attached
   * follow-up chain so descendants stay glued to the parent's plug at
   * `parent.bottom + FOLLOW_UP_GAP`. Lateral branches and canvas artifact
   * nodes are never moved by this — only the same-chat vertical chain.
   *
   * Using a full chain relayout (rather than just a delta shift) is robust to
   * stale positions from older snapshots and to any race where a previous
   * measurement was missed: every new measurement reconciles the chain to the
   * canonical gap.
   */
  setCardSize: (id, size) =>
    set((state) => {
      const existing = state.cards[id];
      if (!existing) return state;
      const prev = existing.size;
      if (prev && prev.w === size.w && prev.h === size.h) return state;

      const cardsWithSize = {
        ...state.cards,
        [id]: { ...existing, size },
      };

      const cards = relayoutVerticalChainOf(
        { ...layoutStateFrom(state), cards: cardsWithSize },
        id,
      );

      return { cards };
    }),

  /** Snap one new follow-up under its parent (placement only, not a chain relayout). */
  syncFollowUpChildPosition: (parentId, childId) =>
    set((state) => {
      const parent = state.cards[parentId];
      const child = state.cards[childId];
      if (!parent || !child) return state;
      const pos = computeFollowUpPosition(
        layoutStateFrom(state),
        parentId,
        parent,
      );
      if (
        child.position.x === pos.x &&
        child.position.y === pos.y
      ) {
        return state;
      }
      return {
        cards: {
          ...state.cards,
          [childId]: { ...child, position: pos },
        },
      };
    }),

  setCanvasArtifactSize: (nodeId, size) =>
    set((state) => {
      const node = state.canvasArtifactNodes[nodeId];
      if (!node) return state;
      const prev = node.size;
      if (prev && prev.w === size.w && prev.h === size.h) return state;
      return {
        canvasArtifactNodes: {
          ...state.canvasArtifactNodes,
          [nodeId]: { ...node, size },
        },
      };
    }),

  moveSubtree: (rootId, dx, dy) =>
    set((state) => {
      if (dx === 0 && dy === 0) return state;
      if (!state.cards[rootId]) return state;

      // BFS over connections to collect the root and all its descendants.
      const subtree = new Set<string>();
      const queue: string[] = [rootId];
      while (queue.length > 0) {
        const id = queue.shift()!;
        if (subtree.has(id)) continue;
        subtree.add(id);
        for (const conn of state.connections) {
          if (conn.from === id && !subtree.has(conn.to)) queue.push(conn.to);
        }
      }

      const nextCards = { ...state.cards };
      subtree.forEach((id) => {
        const c = nextCards[id];
        if (!c) return;
        nextCards[id] = {
          ...c,
          position: { x: c.position.x + dx, y: c.position.y + dy },
        };
      });
      return { cards: nextCards };
    }),

  createRootCard: (position) => {
    const cardId = newCardId();
    set((state) => {
      const undoPast = pushUndoSnapshot(state);
      const threadId = newThreadId();
      const accent = PALETTE[state.threadOrder.length % PALETTE.length];
      const thread: Thread = { id: threadId, accentColour: accent };
      const card: Card = {
        id: cardId,
        threadId,
        question: "",
        answer: "",
        status: "empty",
        position,
        size: emptyCardSize(),
        parentCardId: null,
        parentConversationId: null,
      };
      return {
        undoPast,
        threads: { ...state.threads, [threadId]: thread },
        threadOrder: [...state.threadOrder, threadId],
        cards: { ...state.cards, [cardId]: card },
        cardOrder: [...state.cardOrder, cardId],
      };
    });
    return cardId;
  },

  createArtifactVersion: (artifactId, payload, cardId) => {
    let result = { artifactId: "", versionId: "" };
    set((state) => {
      const normalized = normalizePayloadForRegistry(payload);
      const newKind = payloadToArtifactKind(normalized);
      if (artifactId && state.sessionArtifacts[artifactId]) {
        const existing = state.sessionArtifacts[artifactId];
        if (existing.kind === newKind) {
          const { artifact, versionId } = appendArtifactVersion(
            existing,
            payload,
            cardId,
          );
          result = { artifactId: artifact.id, versionId };
          return {
            sessionArtifacts: {
              ...state.sessionArtifacts,
              [artifact.id]: artifact,
            },
          };
        }
      }
      const created = createSessionArtifactFromPayload(payload, cardId);
      result = {
        artifactId: created.id,
        versionId: created.latestVersionId,
      };
      return {
        sessionArtifacts: {
          ...state.sessionArtifacts,
          [created.id]: created,
        },
      };
    });
    return result;
  },

  openSessionArtifact: (artifactId, versionId) =>
    set((state) => {
      const art = state.sessionArtifacts[artifactId];
      if (!art) return state;
      const vid = versionId ?? art.latestVersionId;
      return {
        openSessionArtifactId: artifactId,
        openSessionArtifactVersionId: vid,
        openArtifactCardId: null,
        openGroupArtifactId: null,
      };
    }),

  setArtifactPanelVersion: (versionId) =>
    set({ openSessionArtifactVersionId: versionId }),

  spawnCanvasArtifact: (artifactId, versionId, opts) => {
    let nodeId: string | null = null;
    set((state) => {
      const art = state.sessionArtifacts[artifactId];
      if (!art) return state;
      const ver = getVersionById(art, versionId) ?? getLatestVersion(art);
      if (!ver) return state;

      const existing = findCanvasNodeByArtifactId(
        state.canvasArtifactNodes,
        artifactId,
      );
      if (existing) {
        nodeId = existing.id;
        const nextNode: CanvasArtifactNode = {
          ...existing,
          versionId: ver.id,
          sourceCardId: ver.sourceCardId,
          ...(opts?.position ? { position: opts.position } : {}),
        };
        return {
          canvasArtifactNodes: {
            ...state.canvasArtifactNodes,
            [existing.id]: nextNode,
          },
          selectedCanvasArtifactId: opts?.focus
            ? existing.id
            : state.selectedCanvasArtifactId,
        };
      }

      const id = newCanvasArtifactNodeId();
      nodeId = id;
      // Determine the artifact's bounds first so the placer can do real
      // AABB collision checks with the actual size (tables are wider).
      const artifactSize =
        art.kind === "table"
          ? { w: CANVAS_TABLE_ARTIFACT_WIDTH, h: TABLE_ARTIFACT_HEIGHT }
          : { w: CANVAS_ARTIFACT_WIDTH, h: DEFAULT_ARTIFACT_HEIGHT };
      const position =
        opts?.position ??
        computeDefaultSpawnPosition(
          ver.sourceCardId,
          state.canvasArtifactNodes,
          state.cards,
          artifactSize,
        );
      const node: CanvasArtifactNode = {
        id,
        artifactId,
        versionId: ver.id,
        sourceCardId: ver.sourceCardId,
        position,
        size: artifactSize,
      };
      return {
        canvasArtifactNodes: { ...state.canvasArtifactNodes, [id]: node },
        canvasArtifactOrder: [...state.canvasArtifactOrder, id],
        selectedCanvasArtifactId: opts?.focus ? id : state.selectedCanvasArtifactId,
      };
    });
    return nodeId;
  },

  ensureCanvasArtifactAt: (artifactId, versionId, position) => {
    return get().spawnCanvasArtifact(artifactId, versionId, { position });
  },

  moveCanvasArtifact: (nodeId, dx, dy) =>
    set((state) => {
      if (dx === 0 && dy === 0) return state;
      const node = state.canvasArtifactNodes[nodeId];
      if (!node) return state;
      return {
        canvasArtifactNodes: {
          ...state.canvasArtifactNodes,
          [nodeId]: {
            ...node,
            position: {
              x: node.position.x + dx,
              y: node.position.y + dy,
            },
          },
        },
      };
    }),

  selectCanvasArtifact: (nodeId) =>
    set({
      selectedCanvasArtifactId: nodeId,
      selectedCanvasTextLabelId: null,
    }),

  setCanvasArtifactVersion: (nodeId, versionId) =>
    set((state) => {
      const node = state.canvasArtifactNodes[nodeId];
      if (!node) return state;
      return {
        canvasArtifactNodes: {
          ...state.canvasArtifactNodes,
          [nodeId]: { ...node, versionId },
        },
      };
    }),

  removeCanvasArtifact: (nodeId) =>
    set((state) => {
      if (!state.canvasArtifactNodes[nodeId]) return state;
      const next = { ...state.canvasArtifactNodes };
      delete next[nodeId];
      return {
        canvasArtifactNodes: next,
        canvasArtifactOrder: state.canvasArtifactOrder.filter(
          (id) => id !== nodeId,
        ),
        selectedCanvasArtifactId:
          state.selectedCanvasArtifactId === nodeId
            ? null
            : state.selectedCanvasArtifactId,
      };
    }),

  spawnCanvasTextLabel: (position, text = "Text") => {
    const id = newCanvasTextLabelId();
    const label: CanvasTextLabel = {
      id,
      text,
      position: { ...position },
      fontSize: CANVAS_TEXT_LABEL_FONT_SIZE,
    };
    set((state) => ({
      canvasTextLabels: { ...state.canvasTextLabels, [id]: label },
      canvasTextLabelOrder: [...state.canvasTextLabelOrder, id],
      selectedCanvasTextLabelId: id,
      selectedCanvasArtifactId: null,
      selectedFamilyRootIds: [],
    }));
    return id;
  },

  moveCanvasTextLabel: (nodeId, dx, dy) =>
    set((state) => {
      if (dx === 0 && dy === 0) return state;
      const label = state.canvasTextLabels[nodeId];
      if (!label) return state;
      return {
        canvasTextLabels: {
          ...state.canvasTextLabels,
          [nodeId]: {
            ...label,
            position: {
              x: label.position.x + dx,
              y: label.position.y + dy,
            },
          },
        },
      };
    }),

  updateCanvasTextLabel: (nodeId, text) =>
    set((state) => {
      const label = state.canvasTextLabels[nodeId];
      if (!label) return state;
      return {
        canvasTextLabels: {
          ...state.canvasTextLabels,
          [nodeId]: { ...label, text },
        },
      };
    }),

  removeCanvasTextLabel: (nodeId) =>
    set((state) => {
      if (!state.canvasTextLabels[nodeId]) return state;
      const next = { ...state.canvasTextLabels };
      delete next[nodeId];
      return {
        canvasTextLabels: next,
        canvasTextLabelOrder: state.canvasTextLabelOrder.filter(
          (id) => id !== nodeId,
        ),
        selectedCanvasTextLabelId:
          state.selectedCanvasTextLabelId === nodeId
            ? null
            : state.selectedCanvasTextLabelId,
      };
    }),

  selectCanvasTextLabel: (nodeId) =>
    set({
      selectedCanvasTextLabelId: nodeId,
      selectedCanvasArtifactId: null,
    }),

  listSessionArtifacts: (): SessionArtifact[] => {
    const state = get();
    return Object.values(state.sessionArtifacts).sort((a, b) => {
      const av =
        a.versions.find((v) => v.id === a.latestVersionId)?.createdAt ?? 0;
      const bv =
        b.versions.find((v) => v.id === b.latestVersionId)?.createdAt ?? 0;
      return bv - av;
    });
  },

  createFollowUp: (parentId, question, options) => {
    let childId: string | null = null;
    set((state) => {
      const parent = state.cards[parentId];
      if (!parent) return state;
      const undoPast = pushUndoSnapshot(state);
      const id = newCardId();
      childId = id;
      const pos = computeFollowUpPosition(layoutStateFrom(state), parentId, parent);
      const inheritedArtifactId =
        options?.attachedArtifacts?.[0]?.artifactId ??
        parent.outputArtifactId ??
        resolveThreadArtifactId(
          state.cards,
          state.connections,
          state.cardOrder,
          parent.threadId,
        ) ??
        undefined;
      const child: Card = {
        id,
        threadId: parent.threadId,
        question,
        answer: "",
        status: "thinking",
        position: pos,
        parentCardId: parentId,
        parentConversationId: parentId,
        attachedArtifacts: options?.attachedArtifacts,
        inheritedArtifactId,
        images: options?.pendingImages,
        pendingFiles: options?.pendingFiles,
      };
      const conn: Connection = {
        id: `conn_${parentId}_${id}`,
        from: parentId,
        to: id,
        fromSide: "bottom",
        toSide: "top",
      };
      return {
        undoPast,
        cards: { ...state.cards, [id]: child },
        cardOrder: [...state.cardOrder, id],
        connections: [...state.connections, conn],
      };
    });
    if (childId) {
      const pid = parentId;
      const cid = childId;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          get().syncFollowUpChildPosition(pid, cid);
        });
      });
    }
    return childId;
  },

  startPlugDrag: (drag) => set({ plugDrag: drag }),

  updatePlugDrag: (patch) =>
    set((state) => {
      if (!state.plugDrag) return state;
      const next = { ...state.plugDrag, ...patch } as PlugDragState;
      return { plugDrag: next };
    }),

  endPlugDrag: () => set({ plugDrag: null }),

  cancelPlugDrag: () => set({ plugDrag: null }),

  setCardComposerAttachment: (cardId, ref) =>
    set((state) => ({
      plugComposerAttachments: {
        ...state.plugComposerAttachments,
        [cardId]: ref,
      },
    })),

  createRootCardWithAttachment: (position, ref) => {
    let cardId = "";
    set((state) => {
      const undoPast = pushUndoSnapshot(state);
      const id = newCardId();
      cardId = id;
      const threadId = newThreadId();
      const accent = PALETTE[state.threadOrder.length % PALETTE.length];
      const thread: Thread = { id: threadId, accentColour: accent };
      const card: Card = {
        id,
        threadId,
        question: "",
        answer: "",
        status: "empty",
        position,
        size: emptyCardSize(),
        parentCardId: null,
        parentConversationId: null,
        attachedArtifacts: [ref],
      };
      return {
        undoPast,
        threads: { ...state.threads, [threadId]: thread },
        threadOrder: [...state.threadOrder, threadId],
        cards: { ...state.cards, [id]: card },
        cardOrder: [...state.cardOrder, id],
        plugComposerAttachments: {
          ...state.plugComposerAttachments,
          [id]: ref,
        },
      };
    });
    return cardId;
  },

  createBranchAt: (sourceId, side, position) => {
    let branchId: string | null = null;
    set((state) => {
      const source = state.cards[sourceId];
      if (!source) return state;
      const undoPast = pushUndoSnapshot(state);

      const newThreadIdStr = newThreadId();
      const accent =
        PALETTE[state.threadOrder.length % PALETTE.length];
      const thread: Thread = {
        id: newThreadIdStr,
        accentColour: accent,
      };

      const id = newCardId();
      branchId = id;
      const y = childBandY(layoutStateFrom(state), sourceId, source);
      const card: Card = {
        id,
        threadId: newThreadIdStr,
        question: "",
        answer: "",
        status: "empty",
        position: {
          x: position.x - BRANCH_CARD_WIDTH / 2,
          y,
        },
        size: emptyCardSize(),
        parentCardId: null,
        parentConversationId: sourceId,
      };

      const conn: Connection = {
        id: `conn_${sourceId}_${id}`,
        from: sourceId,
        to: id,
        fromSide: side,
        toSide: side === "right" ? "left" : "right",
      };

      return {
        undoPast,
        threads: { ...state.threads, [newThreadIdStr]: thread },
        threadOrder: [...state.threadOrder, newThreadIdStr],
        cards: { ...state.cards, [id]: card },
        cardOrder: [...state.cardOrder, id],
        connections: [...state.connections, conn],
      };
    });
    return branchId;
  },

  createBranch: (sourceId, side) => {
    let branchId: string | null = null;
    set((state) => {
      const source = state.cards[sourceId];
      if (!source) return state;
      const undoPast = pushUndoSnapshot(state);

      const existingOnSide = state.connections.filter(
        (c) => c.from === sourceId && c.fromSide === side,
      ).length;

      const slot = existingOnSide; // 0 for the first branch on this side
      const lateralStep = BRANCH_CARD_WIDTH + BRANCH_HORIZONTAL_GAP;

      const x =
        side === "right"
          ? source.position.x +
            BRANCH_CARD_WIDTH +
            BRANCH_HORIZONTAL_GAP +
            lateralStep * slot
          : source.position.x -
            BRANCH_CARD_WIDTH -
            BRANCH_HORIZONTAL_GAP -
            lateralStep * slot;
      const y = childBandY(layoutStateFrom(state), sourceId, source);

      const newThreadIdStr = newThreadId();
      const accent =
        PALETTE[state.threadOrder.length % PALETTE.length];
      const thread: Thread = {
        id: newThreadIdStr,
        accentColour: accent,
      };

      const id = newCardId();
      branchId = id;
      const card: Card = {
        id,
        threadId: newThreadIdStr,
        question: "",
        answer: "",
        status: "empty",
        position: { x, y },
        size: emptyCardSize(),
        parentCardId: null,
        parentConversationId: sourceId,
      };

      const conn: Connection = {
        id: `conn_${sourceId}_${id}`,
        from: sourceId,
        to: id,
        fromSide: side,
        toSide: side === "right" ? "left" : "right",
      };

      return {
        undoPast,
        threads: { ...state.threads, [newThreadIdStr]: thread },
        threadOrder: [...state.threadOrder, newThreadIdStr],
        cards: { ...state.cards, [id]: card },
        cardOrder: [...state.cardOrder, id],
        connections: [...state.connections, conn],
      };
    });
    return branchId;
  },

  deleteFromCard: (cardId) =>
    set((state) => {
      if (!state.cards[cardId]) return state;
      const undoPast = pushUndoSnapshot(state);

      const toDelete = collectSubtreeIds(state.connections, cardId);
      const nextCards = { ...state.cards };
      for (const id of toDelete) {
        delete nextCards[id];
      }

      const nextConnections = state.connections.filter(
        (c) => !toDelete.has(c.from) && !toDelete.has(c.to),
      );
      const nextCardOrder = state.cardOrder.filter((id) => !toDelete.has(id));

      const remainingThreadIds = new Set(
        Object.values(nextCards).map((c) => c.threadId),
      );
      const nextThreads = { ...state.threads };
      for (const tid of Object.keys(nextThreads)) {
        if (!remainingThreadIds.has(tid)) delete nextThreads[tid];
      }
      const nextThreadOrder = state.threadOrder.filter((tid) =>
        remainingThreadIds.has(tid),
      );

      let activeThreadId = state.activeThreadId;
      if (activeThreadId && !remainingThreadIds.has(activeThreadId)) {
        activeThreadId = pickDefaultThreadId({
          cards: nextCards,
          connections: nextConnections,
          cardOrder: nextCardOrder,
          threads: nextThreads,
          threadOrder: nextThreadOrder,
        });
      }

      let openArtifactCardId = state.openArtifactCardId;
      if (openArtifactCardId && toDelete.has(openArtifactCardId)) {
        openArtifactCardId = null;
      }

      return {
        undoPast,
        cards: nextCards,
        cardOrder: nextCardOrder,
        connections: nextConnections,
        threads: nextThreads,
        threadOrder: nextThreadOrder,
        activeThreadId,
        openArtifactCardId,
      };
    }),

  openArtifact: (cardId) =>
    set((state) => {
      if (!state.cards[cardId]) return state;
      return { openArtifactCardId: cardId, openGroupArtifactId: null };
    }),

  closeArtifact: () =>
    set({
      openArtifactCardId: null,
      openGroupArtifactId: null,
      openSessionArtifactId: null,
      openSessionArtifactVersionId: null,
    }),

  autoLayoutCanvas: () =>
    set((state) => {
      if (state.cardOrder.length === 0) return state;
      const undoPast = pushUndoSnapshot(state);
      const positions = computeAutoLayout({
        cards: state.cards,
        cardOrder: state.cardOrder,
        connections: state.connections,
      });
      if (positions.size === 0) return state;

      const nextCards = { ...state.cards };
      for (const [id, pos] of positions) {
        const existing = nextCards[id];
        if (!existing) continue;
        nextCards[id] = { ...existing, position: pos };
      }
      return { undoPast, cards: nextCards };
    }),

  getCanvasSnapshotSource: (): CanvasSnapshotSource => {
    const state = get();
    return {
      viewport: state.viewport,
      cards: state.cards,
      cardOrder: state.cardOrder,
      connections: state.connections,
      threads: state.threads,
      threadOrder: state.threadOrder,
      groups: state.groups,
      connectorStyle: state.connectorStyle,
      selectedModel: state.selectedModel,
      viewMode: state.viewMode,
      sessionArtifacts: state.sessionArtifacts,
      canvasArtifactNodes: state.canvasArtifactNodes,
      canvasArtifactOrder: state.canvasArtifactOrder,
      canvasTextLabels: state.canvasTextLabels,
      canvasTextLabelOrder: state.canvasTextLabelOrder,
    };
  },

  hydrateFromSnapshot: (snapshot: CanvasSnapshot) =>
    set(() => {
      const sessionArtifacts = JSON.parse(
        JSON.stringify(snapshot.sessionArtifacts),
      ) as Record<string, SessionArtifact>;
      const normalized = normalizeLoadedCards({ ...snapshot.cards });
      const connections = Array.isArray(snapshot.connections)
        ? snapshot.connections.map((c) => ({ ...c }))
        : [];
      const cardOrder = Array.isArray(snapshot.cardOrder)
        ? [...snapshot.cardOrder]
        : Object.keys(normalized);
      // Re-snap vertical chains so any stale gap from older snapshots
      // collapses back to the canonical FOLLOW_UP_GAP. Lateral branches are
      // not touched (absolute-positions policy).
      const cards = repairVerticalChainsOnly(
        normalized,
        connections,
        cardOrder,
      );
      const canvasArtifactNodes = snapshot.canvasArtifactNodes
        ? normalizeLoadedArtifactNodes(
            { ...snapshot.canvasArtifactNodes },
            sessionArtifacts,
          )
        : {};
      return {
        viewport: { ...snapshot.viewport },
        cards,
        cardOrder,
        connections,
        threads: { ...snapshot.threads },
        threadOrder: [...snapshot.threadOrder],
        groups: { ...snapshot.groups },
        connectorStyle: snapshot.connectorStyle,
        selectedModel: snapshot.selectedModel,
        viewMode: snapshot.viewMode,
        sessionArtifacts,
        canvasArtifactNodes,
        canvasArtifactOrder: snapshot.canvasArtifactOrder
          ? [...snapshot.canvasArtifactOrder]
          : [],
        activeThreadId: snapshot.threadOrder[0] ?? null,
        openArtifactCardId: null,
        openGroupArtifactId: null,
        openSessionArtifactId: null,
        openSessionArtifactVersionId: null,
        selectedCanvasArtifactId: null,
        canvasTextLabels: snapshot.canvasTextLabels
          ? { ...snapshot.canvasTextLabels }
          : {},
        canvasTextLabelOrder: snapshot.canvasTextLabelOrder
          ? [...snapshot.canvasTextLabelOrder]
          : [],
        selectedCanvasTextLabelId: null,
        selectedFamilyRootIds: [],
        activeGroupId: null,
        undoPast: [],
      };
    }),
}));

function pushUndoSnapshot(state: CanvasState): GraphSnapshot[] {
  const snap = captureGraphSnapshot(state);
  const next = [...state.undoPast, snap];
  if (next.length > MAX_UNDO_STACK) next.shift();
  return next;
}

// Selector helpers.
export const selectAccentForCard = (cardId: string) =>
  (state: CanvasState): string | undefined => {
    const card = state.cards[cardId];
    if (!card) return undefined;
    return state.threads[card.threadId]?.accentColour;
  };
