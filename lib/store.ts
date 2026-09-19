"use client";

import type {
  ArtifactPayload,
  EmittedArtifact,
  ResponseType,
} from "@/lib/artifactTypes";
import { payloadToArtifactKind } from "@/lib/artifactTypes";
import type { SkillCardData } from "@/lib/skillMetadata";
import { getPermissionCopy } from "@/lib/artifactSpawnPriority";
import { SPAWN_ANIMATION_MS } from "@/lib/motion/variants";
import type {
  CanvasSnapshot,
  CanvasSnapshotSource,
} from "@/lib/canvasSnapshot";
import { normalizeCanvasSnapshot } from "@/lib/canvasSnapshot";
import type { CanvasStroke } from "@/lib/canvasStroke";
import {
  PENCIL_COLORS,
  PENCIL_STROKE_WIDTH,
} from "@/lib/canvasStroke";
import { resolveBackgroundForTheme } from "@/lib/canvasBackgroundTheme";
import {
  cycleCanvasBackgroundImageId,
  DEFAULT_CANVAS_BACKGROUND_IMAGE_ID,
  normalizeCanvasBackgroundImageId,
} from "@/lib/canvasBackgroundImages";
import { repairLoadedArtifactState } from "@/lib/materializeCardArtifact";
import {
  isCardSourcedArtifactBuild,
  pushArtifactReadyUpdate,
} from "@/lib/artifactUpdateNotify";
import { collectSubtreeIds } from "@/lib/canvasSubtree";
import { cancelCardAsks } from "@/lib/cardAskRegistry";
import { seedCustomUiTurnState } from "@/lib/customUiTurnSeed";
import {
  resolveBranchDropPosition,
  getFollowUpChild,
  relayoutVerticalChainOf,
  repairCanvasLayout,
  repairVerticalChainsOnly,
  shiftBottomAttachedSubtrees,
  childBandY,
  defaultBranchSlotX,
  computeFollowUpPositionFromDom,
} from "@/lib/canvasLayout";
import { DEFAULT_BODY_FONT_ID } from "@/lib/canvasFonts/registry";
import type { CustomUiSourceData } from "@/lib/customUiSource";
import { THREAD_ACCENT_PALETTE } from "@/lib/design/tokens";
import type { ModelId } from "@/lib/models";
import {
  DEFAULT_ARTIFACT_STYLE_ID,
  getArtifactStylePack,
} from "@/lib/design/style/stylePacks";
import type { ArtifactStyleId } from "@/lib/design/style/types";
import { buildCanvasLoadRevealPlan } from "@/lib/motion/canvasLoadReveal";
import type { CanvasLoadReveal, SpawnMeta } from "@/lib/motion/types";
import { isCardPending } from "@/lib/cardLayoutPolicy";
import { getCanvasAssetBounds } from "@/lib/canvasAssetBounds";
import {
  CANVAS_ARTIFACT_WIDTH,
  clampArtifactSize,
  emptyCardSize,
  getArtifactBounds,
  getDefaultArtifactSize,
} from "@/lib/canvasNodeBounds";
import {
  clampTextLabelFontSize,
  clampTextLabelWidth,
} from "@/lib/canvasTextLabelBounds";
import {
  DEFAULT_CANVAS_TUNING,
  RESOLVED_CANVAS_TUNING,
  type ResolvedCanvasTuning,
} from "@/lib/canvasTuning";

export { CANVAS_ARTIFACT_WIDTH, CANVAS_TABLE_ARTIFACT_WIDTH } from "@/lib/canvasNodeBounds";
import {
  CANVAS_ORIGIN,
  isOriginCardPinned,
  type GlobalOrigin,
} from "@/lib/canvasOrigin";
import {
  getLandingCardId,
  pickCanvasLandingInput,
} from "@/lib/canvasLandingState";
import { resetViewportBootstrap } from "@/lib/canvasViewportBootstrap";
import {
  getFamilyCardIds,
  getThreadRootCard,
  getThreadTailCardId,
  pickDefaultThreadId,
} from "@/lib/chatThreads";
import {
  computeFocusRootCardPosition,
  getLatestArtifactIdForThread,
  getLatestThreadIdForArtifact,
} from "@/lib/focusView";
import { turnMetricsOnSubmit } from "@/lib/qaTurnMetrics";
import { runSilentAutoCollapse } from "@/lib/collapseSoundSuppress";
import {
  registerThreadInactivityHandlers,
  resetThreadActivity,
  touchThreadActivity,
  type ThreadInactivityState,
} from "@/lib/threadInactivity";
import {
  buildCanvasClipboardPayload,
  canCopyCanvasSelection,
  cloneSessionArtifactDeep,
  computePastePosition,
  writeCanvasClipboard,
  CANVAS_PASTE_SOURCE_CARD_ID,
  type CanvasClipboardPayload,
} from "@/lib/canvasClipboard";
import { showAppErrorToast, showAppToast } from "@/lib/appToastStore";
import { copySuccessMessage } from "@/lib/copyToastMessage";
import {
  getSelectionUnits,
  isCanvasItemSelected,
  mergeCanvasSelections,
  type CanvasSelection,
  type CanvasSelectionItem,
} from "@/lib/canvasSelection";
import {
  computeAlignDeltas,
  computeArrangeDeltas,
  type AlignMode,
  type ArrangeMode,
  type SelectionUnitDelta,
} from "@/lib/canvasArrange";
import { syncAllCardDomSizes } from "@/lib/canvasMeasure";
import { buildSummaryContentFingerprint } from "@/lib/groupSummaryStaleness";
import {
  computeArtifactSpawnPosition,
  findCanvasNodeByArtifactId,
  findGeneratingPreviewNode,
  findPermissionPreviewNode,
  pickAlternateSpawnSide,
  scheduleCanvasArtifactFocus,
  type ArtifactSpawnSide,
} from "@/lib/canvasArtifacts";
import {
  appendArtifactVersion,
  createSessionArtifactFromPayload,
  getLatestVersion,
  getVersionById,
  normalizePayloadForRegistry,
  patchArtifactPayloadTitle,
  resolveArtifactTargetId,
  resolveEditingArtifactId,
  resolveInheritedArtifactIdForParent,
  resolveThreadArtifactId,
  type AttachedArtifactRef,
  type SessionArtifact,
} from "@/lib/sessionArtifacts";
import { MANUAL_CALENDAR_SOURCE_CARD_ID } from "@/lib/calendarArtifact";
import { MANUAL_MAP_SOURCE_CARD_ID } from "@/lib/mapArtifact";
import { MANUAL_TIMELINE_SOURCE_CARD_ID } from "@/lib/timelineArtifact";
import { MANUAL_STICKY_NOTE_SOURCE_CARD_ID } from "@/lib/stickyNoteArtifact";
import {
  createManualArtifactPayload,
  manualArtifactSourceCardId,
  type ManualArtifactType,
} from "@/lib/manualArtifactDefaults";
import type { ManualArtifactMenuPick } from "@/lib/manualArtifactMenu";
import { resolveCardAttachedArtifactRefs } from "@/lib/attachedArtifactRefs";
import {
  createEmptyTodoPayload,
  MANUAL_TODO_SOURCE_CARD_ID,
} from "@/lib/todoArtifact";
import {
  createRepoPayload,
  MANUAL_REPO_SOURCE_CARD_ID,
  mergeRepoExplorer,
} from "@/lib/repoArtifact";
import {
  createWebsitePayload,
  MANUAL_WEBSITE_SOURCE_CARD_ID,
} from "@/lib/websiteArtifact";
import {
  createGoogleWorkspacePayload,
  MANUAL_GOOGLE_DOC_SOURCE_CARD_ID,
} from "@/lib/googleWorkspaceArtifact";
import { parseGoogleDriveUrl } from "@/lib/google/parseDriveUrl";
import {
  createEmbedPayload,
  EMBED_LOADING_HEIGHT,
  EMBED_LOADING_WIDTH,
  MANUAL_EMBED_SOURCE_CARD_ID,
} from "@/lib/embedArtifact";
import { matchEmbedProviderId } from "@/lib/embed/registry";
import type { EmbedResolveResult } from "@/lib/embed/types";
import type { RepoExplorerData } from "@/lib/github/types";
import { domainDisplayLabel } from "@/lib/urlDetection";
import {
  createAudioPayload,
  getDefaultAudioArtifactSize,
  MANUAL_AUDIO_SOURCE_CARD_ID,
} from "@/lib/audioArtifact";
import { extractWaveformPeaks } from "@/lib/audioWaveform";
import {
  uploadAudioFile,
  uploadThreeDModelFile,
  type AssetUploadContext,
  type AssetUploadError,
} from "@/lib/attachments";
import {
  createThreeDPayload,
  MANUAL_3D_SOURCE_CARD_ID,
  threeDFormatFromFile,
} from "@/lib/threeDArtifact";
import {
  graphSnapshotFromState,
  GraphSnapshot,
  MAX_UNDO_STACK,
} from "@/lib/undo";
import { create } from "zustand";

// Kept as an alias for backwards compatibility; model ids now span providers
// (Claude + OpenRouter). See lib/models.ts for the registry.
export type ClaudeModel = ModelId;

const MANUAL_VIDEO_SOURCE_CARD_ID = "manual-video";

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

export type CanvasAssetKind =
  | "image"
  | "document"
  | "code"
  | "spreadsheet"
  | "word"
  | "presentation";

export interface CanvasAsset {
  id: string;
  canvasId: string;
  ownerId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  publicUrl: string;
  kind: CanvasAssetKind;
  width?: number;
  height?: number;
  aspectRatio?: number;
  createdAt: number;
}

export interface AttachedAssetRef {
  assetId: string;
}

export interface CanvasSkill {
  id: string;
  canvasId: string;
  ownerId: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  publicUrl: string;
  createdAt: number;
  /** Derived from the file's own frontmatter/body at upload time (instant fallback); upgraded by the LLM analysis pass. */
  metadata?: SkillCardData;
  /** LLM analysis lifecycle — keyed per skill, not per canvas node, so it only ever runs once. */
  metadataStatus?: "pending" | "analyzing" | "ready" | "unavailable";
}

export interface CanvasSkillNode {
  id: string;
  skillId: string;
  position: { x: number; y: number };
  size?: CardSize;
}

export interface AttachedSkillRef {
  skillId: string;
}

export interface AnswerExplain {
  id: string;
  selectedText: string;
  /** 0-based occurrence among identical substrings in rendered plain text */
  occurrenceIndex: number;
  explanation: string;
  status: "loading" | "done" | "error";
}

export interface BranchOptions {
  quotedSelection?: string;
}

export interface Card {
  id: string;
  threadId: string;
  /** Admin playground only — conversation import cards (not in design system yet). */
  cardKind?: "qa" | "conversation";
  question: string;
  answer: string;
  status: CardStatus;
  thinkingLabel?: string;
  position: { x: number; y: number };
  parentCardId: string | null;
  parentConversationId: string | null;
  size?: CardSize;
  artifactId?: string;
  /** User-attached reference images sent with the question. */
  attachedImages?: CardImage[];
  /** Model output / search result images for the answer. */
  images?: CardImage[];
  responseType?: ResponseType;
  artifactPayload?: ArtifactPayload;
  outputArtifactId?: string;
  outputArtifactVersionId?: string;
  attachedArtifacts?: AttachedArtifactRef[];
  attachedAssets?: AttachedAssetRef[];
  attachedSkills?: AttachedSkillRef[];
  attachedGroups?: AttachedGroupRef[];
  inheritedArtifactId?: string;
  pendingFiles?: PendingFileAttachment[];
  /** MCP output handed to the custom-UI builder; transient, never persisted. */
  customUiSource?: CustomUiSourceData;
  /** Set on build_custom_ui follow-ups: this card builds a NEW artifact from
   *  customUiSource, so the usual parent-chain artifact inheritance (which
   *  would turn it into an edit of the parent's artifact) must not apply. */
  suppressArtifactInheritance?: boolean;
  contributorIds?: string[];
  answerExplains?: AnswerExplain[];
  quotedSelection?: string;
  /** Artifacts emitted during the current chat turn (processed on done). */
  pendingEmittedArtifacts?: EmittedArtifact[];
  /** Wall-clock start when the current question was submitted. */
  askStartedAt?: number;
  /** Token usage accumulated for the current question turn. */
  turnUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
  };
  /** Cursor SDK custom UI pipeline stages (live build progress). */
  sdkBuildStages?: import("@/lib/cursorSdk/buildProgressTypes").SdkBuildStage[];
}

export interface FollowUpOptions {
  attachedArtifacts?: AttachedArtifactRef[];
  attachedAssets?: AttachedAssetRef[];
  attachedSkills?: AttachedSkillRef[];
  attachedGroups?: AttachedGroupRef[];
  pendingImages?: CardImage[];
  pendingFiles?: PendingFileAttachment[];
  customUiSource?: CustomUiSourceData;
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
    }
  | {
      kind: "asset";
      assetNodeId: string;
      assetId: string;
      fromSide: PlugSide;
      pointerWorld: { x: number; y: number };
      didDrag: boolean;
      receiveTargetCardId: string | null;
      hoveredReceiveSide: PlugSide | null;
    }
  | {
      kind: "skill";
      skillNodeId: string;
      skillId: string;
      fromSide: PlugSide;
      pointerWorld: { x: number; y: number };
      didDrag: boolean;
      receiveTargetCardId: string | null;
      hoveredReceiveSide: PlugSide | null;
    }
  | {
      kind: "group";
      groupId: string;
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

/** Dashed plug link from a canvas artefact node to a question card composer. */
export interface ArtifactPlugConnection {
  id: string;
  artifactNodeId: string;
  cardId: string;
  fromSide: PlugSide;
  toSide: PlugSide;
}

/** Dashed plug link from a canvas skill node to a question card composer. */
export interface SkillPlugConnection {
  id: string;
  skillNodeId: string;
  cardId: string;
  fromSide: PlugSide;
  toSide: PlugSide;
}

/** Dashed plug link from a group container edge to a question card composer. */
export interface GroupPlugConnection {
  id: string;
  groupId: string;
  cardId: string;
  fromSide: PlugSide;
  toSide: PlugSide;
}

/** A whole group attached to a question as joint context. */
export interface AttachedGroupRef {
  groupId: string;
}

export interface Thread {
  id: string;
  accentColour: string;
}

/**
 * Rolling one-to-two sentence summary of a thread, refreshed after each
 * exchange. Injected as faint "canvas memory" into sibling branches without
 * sharing their full context.
 */
export interface ThreadGist {
  gist: string;
  updatedAt: number;
  turnCount: number;
}

/** A pending MCP tool-call approval shown next to the card's composer. */
export interface PendingMcpApproval {
  requestId: string;
  cardId: string;
  serverId: string;
  serverName: string;
  toolName: string;
  description: string;
  inputPreview: Record<string, unknown>;
}

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export type ConnectorStyle = "curvy" | "orthogonal" | "straight";
export type AppViewMode = "canvas" | "chat" | "focus";

export type CanvasBackgroundStyle = "grid" | "ambient-gradient" | "static-image";

export const CANVAS_BACKGROUND_STYLES: readonly CanvasBackgroundStyle[] = [
  "grid",
  "ambient-gradient",
  "static-image",
] as const;

export type CanvasTheme = "light" | "dark";

export const CANVAS_THEMES: readonly CanvasTheme[] = ["light", "dark"] as const;

export interface BranchGroup {
  id: string;
  label: string;
  familyRootThreadIds: string[];
  /** Non-card members (artifacts, assets, gifs, 3d, labels — never skills). Absent on legacy groups. */
  items?: CanvasSelectionItem[];
  /**
   * Cards named individually rather than by thread family — the way a code-
   * built group (a transcript chapter) holds one node off a shared thread.
   * Absent on groups made from a selection, which group whole families.
   */
  cardIds?: string[];
  /**
   * Display heading rendered in world space above the group frame — the
   * chapter's own title, while `label` stays the short ordinal chip. Absent on
   * groups made from a selection, which have no title beyond their name.
   */
  headingText?: string;
  /** Subtle identifying hue (hex). Absent leaves the neutral frame. */
  accentColour?: string;
  /**
   * World Y of a hairline rule drawn across the group — a transcript chapter
   * uses it to separate its conversation cards from the artifacts below them.
   * Absent draws nothing.
   */
  dividerY?: number;
  summaryMarkdown: string | null;
  summaryGeneratedAt?: number;
  summaryContentFingerprint?: string;
}

/** Non-card node kinds a group may contain (skills are deliberately excluded). */
export const GROUPABLE_ITEM_KINDS: readonly CanvasSelectionItem["kind"][] = [
  "artifact",
  "asset",
  "gif",
  "3d",
  "label",
];

export function isGroupableItem(item: CanvasSelectionItem): boolean {
  return GROUPABLE_ITEM_KINDS.includes(item.kind);
}

export interface ArtifactPermissionPreview {
  payload: ArtifactPayload;
  copy: string;
  status: "pending" | "declining";
  kind: import("@/lib/artifactTypes").ArtifactKind;
  title: string;
}

export interface ArtifactGeneratingPreview {
  kind: import("@/lib/artifactTypes").ArtifactKind;
  title: string;
}

export interface CanvasArtifactNode {
  id: string;
  artifactId: string;
  versionId: string;
  sourceCardId: string;
  position: { x: number; y: number };
  size?: CardSize;
  /** Set when the user manually resizes — auto content sizing only grows from here. */
  userSetSize?: boolean;
  /**
   * Set when a layout engine authored this size deliberately (transcript-import
   * chapter bento). Like userSetSize it opts the node out of auto content
   * sizing, which otherwise floors every node at its kind default and would
   * silently undo a grid cell that is narrower or shorter than that default.
   * Distinct from userSetSize so a node the user never touched is not reported
   * as manually resized.
   */
  layoutSetSize?: boolean;
  /** Permission gate — artifact not materialized until user approves. */
  permissionPreview?: ArtifactPermissionPreview;
  /** Canvas placeholder while a version is still generating. */
  generatingPreview?: ArtifactGeneratingPreview;
  /** Play exit animation before removing the node. */
  isExiting?: boolean;
}

export interface CanvasAssetNode {
  id: string;
  assetId: string;
  position: { x: number; y: number };
  size?: CardSize;
}

export const CANVAS_TEXT_LABEL_FONT_SIZE = 40;

export type CanvasPlacementTool = "question" | "text" | "artifact";

export interface CanvasTextLabel {
  id: string;
  text: string;
  position: { x: number; y: number };
  fontSize: number;
  /** When set, text wraps inside this width (canvas px). */
  width?: number;
}

export type { CanvasStroke } from "@/lib/canvasStroke";

export type CanvasGifCategory = "gif" | "sticker";

export interface CanvasGifNode {
  id: string;
  url: string;
  previewUrl: string;
  title: string;
  category: CanvasGifCategory;
  aspectRatio: number;
  sourceId: string;
  position: { x: number; y: number };
  size?: CardSize;
}

export type SpawnCanvasGifInput = Pick<
  CanvasGifNode,
  "url" | "previewUrl" | "title" | "category" | "aspectRatio" | "sourceId"
>;

export interface Canvas3DNode {
  id: string;
  modelUrl: string;
  format: "glb" | "gltf";
  title: string;
  sourceId: string;
  position: { x: number; y: number };
  size?: CardSize;
}

export type SpawnCanvas3DInput = Pick<
  Canvas3DNode,
  "modelUrl" | "format" | "title" | "sourceId"
>;

/** Horizontal gap between a source card's right edge and a spawned artifact. */
export const ARTIFACT_SPAWN_GAP_X = 24;

interface CanvasState {
  selectedModel: ClaudeModel;
  setModel: (model: ClaudeModel) => void;

  leftPanelCollapsed: boolean;
  setLeftPanelCollapsed: (collapsed: boolean) => void;
  toggleLeftPanel: () => void;

  rightPanelCollapsed: boolean;
  setRightPanelCollapsed: (collapsed: boolean) => void;
  toggleRightPanel: () => void;

  uploadedAttachments: UploadedAttachment[];
  addUploadedAttachment: (attachment: UploadedAttachment) => void;
  removeUploadedAttachment: (id: string) => void;
  addCanvasAsset: (asset: CanvasAsset) => void;
  patchCanvasAssetPublicUrl: (assetId: string, publicUrl: string) => void;
  removeCanvasAsset: (assetId: string) => void;
  spawnCanvasAsset: (
    assetId: string,
    opts?: { position?: { x: number; y: number }; focus?: boolean },
  ) => string | null;
  moveCanvasAsset: (nodeId: string, dx: number, dy: number) => void;
  setCanvasAssetSize: (nodeId: string, size: CardSize) => void;
  selectCanvasAsset: (nodeId: string | null) => void;
  removeCanvasAssetNode: (nodeId: string) => void;
  canvasGifNodes: Record<string, CanvasGifNode>;
  canvasGifOrder: string[];
  selectedCanvasGifId: string | null;
  gifPickerOpen: boolean;
  setGifPickerOpen: (open: boolean) => void;
  imagePlacementAssetId: string | null;
  requestImagePlacement: (assetId: string) => void;
  gifPlacementRequest: SpawnCanvasGifInput | null;
  requestGifPlacement: (input: SpawnCanvasGifInput) => void;
  spawnCanvasGif: (
    input: SpawnCanvasGifInput,
    opts?: { position?: { x: number; y: number }; focus?: boolean },
  ) => string | null;
  moveCanvasGif: (nodeId: string, dx: number, dy: number) => void;
  setCanvasGifSize: (nodeId: string, size: CardSize) => void;
  selectCanvasGif: (nodeId: string | null) => void;
  removeCanvasGifNode: (nodeId: string) => void;
  canvas3DNodes: Record<string, Canvas3DNode>;
  canvas3DOrder: string[];
  selectedCanvas3DId: string | null;
  canvas3dPlacementRequest: SpawnCanvas3DInput | null;
  requestCanvas3DPlacement: (input: SpawnCanvas3DInput) => void;
  spawnCanvas3D: (
    input: SpawnCanvas3DInput,
    opts?: { position?: { x: number; y: number }; focus?: boolean },
  ) => string | null;
  moveCanvas3D: (nodeId: string, dx: number, dy: number) => void;
  setCanvas3DSize: (nodeId: string, size: CardSize) => void;
  selectCanvas3D: (nodeId: string | null) => void;
  removeCanvas3DNode: (nodeId: string) => void;
  duplicateCanvas3DNode: (nodeId: string) => string | null;
  addCanvasSkill: (skill: CanvasSkill) => void;
  removeCanvasSkill: (skillId: string) => void;
  setCanvasSkillMetadataStatus: (
    skillId: string,
    status: CanvasSkill["metadataStatus"],
  ) => void;
  setCanvasSkillAiMetadata: (skillId: string, metadata: SkillCardData) => void;
  spawnCanvasSkill: (
    skillId: string,
    opts?: { position?: { x: number; y: number }; focus?: boolean },
  ) => string | null;
  moveCanvasSkill: (nodeId: string, dx: number, dy: number) => void;
  setCanvasSkillNodeSize: (nodeId: string, size: CardSize) => void;
  selectCanvasSkill: (nodeId: string | null) => void;
  removeCanvasSkillNode: (nodeId: string) => void;

  viewMode: AppViewMode;
  activeThreadId: string | null;
  setViewMode: (mode: AppViewMode) => void;
  setActiveThreadId: (threadId: string) => void;

  /** Focus view — artifact shown in the middle panel (session-only). */
  focusArtifactId: string | null;
  /** Focus view — "New chat" pressed; thread is created on first submit (session-only). */
  focusDraftChat: { artifactRef: AttachedArtifactRef | null } | null;
  setFocusArtifactId: (artifactId: string | null) => void;
  focusSelectChat: (threadId: string) => void;
  focusSelectArtifact: (artifactId: string) => void;
  focusStartNewChat: (artifactRef: AttachedArtifactRef | null) => void;
  /** Submit a question into an existing (empty/root) card — shared by Card and focus view. */
  submitCardQuestion: (
    cardId: string,
    question: string,
    options?: FollowUpOptions,
  ) => void;
  /** Focus view composer submit — routes to draft root, empty tail, or follow-up. */
  submitFocusMessage: (
    question: string,
    options?: FollowUpOptions,
  ) => string | null;

  canvasPlacementRequest: CanvasPlacementTool | null;
  activeCanvasPlacement: CanvasPlacementTool | null;
  requestCanvasPlacement: (tool: CanvasPlacementTool) => void;
  artifactPlacementRequest: ManualArtifactMenuPick | null;
  requestArtifactPlacement: (pick: ManualArtifactMenuPick) => void;
  createManualArtifact: (
    artifactType: ManualArtifactType,
    opts?: { position?: { x: number; y: number } },
  ) => { artifactId: string; versionId: string };

  /** Set when a signed-out visitor exhausts their guest allowance. Session
   *  state, never persisted — the server is the authority and re-blocks the
   *  next request regardless of what the client thinks. */
  guestWall: { open: boolean; questionsAsked: number | null };
  openGuestWall: (questionsAsked: number | null) => void;
  dismissGuestWall: () => void;

  /** Set while viewing a published canvas (/c/<slug>).
   *
   *  `forked` flips the first time the visitor does anything generative. It is
   *  bookkeeping and UI only: there is nothing to copy, because the store
   *  already holds their fork and they have no write path to the original. It
   *  drives the "(copy)" title suffix and the banner, and carries the lineage
   *  recorded on the canvas they adopt when they sign in. */
  publishedOrigin: {
    slug: string;
    publishedCanvasId: string;
    version: number;
    title: string;
    ownerName: string | null;
    forked: boolean;
  } | null;
  setPublishedOrigin: (
    origin: CanvasState["publishedOrigin"],
  ) => void;
  markPublishedCanvasForked: () => void;

  sessionUsage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
  addUsage: (
    input: number,
    output: number,
    cacheRead?: number,
    cacheCreation?: number,
  ) => void;
  addCardTurnUsage: (
    cardId: string,
    input: number,
    output: number,
    cacheRead?: number,
    cacheCreation?: number,
  ) => void;

  viewport: Viewport;
  /** Scale used for stroke/chrome compensation; lags during active zoom gestures. */
  viewportSettledScale: number;
  cards: Record<string, Card>;
  cardOrder: string[];
  connections: Connection[];
  threads: Record<string, Thread>;
  threadOrder: string[];
  threadGists: Record<string, ThreadGist>;
  setThreadGist: (threadId: string, gist: ThreadGist) => void;
  /** Mid-turn MCP tool-call approvals awaiting a user decision. */
  pendingMcpApprovals: PendingMcpApproval[];
  addMcpApproval: (approval: PendingMcpApproval) => void;
  resolveMcpApproval: (requestId: string) => void;
  clearMcpApprovalsForCard: (cardId: string) => void;
  openArtifactCardId: string | null;
  openGroupArtifactId: string | null;
  sessionArtifacts: Record<string, SessionArtifact>;
  canvasAssets: Record<string, CanvasAsset>;
  openSessionArtifactId: string | null;
  openSessionArtifactVersionId: string | null;
  canvasArtifactNodes: Record<string, CanvasArtifactNode>;
  canvasArtifactOrder: string[];
  selectedCanvasArtifactId: string | null;
  canvasAssetNodes: Record<string, CanvasAssetNode>;
  canvasAssetOrder: string[];
  selectedCanvasAssetId: string | null;
  canvasSkills: Record<string, CanvasSkill>;
  canvasSkillNodes: Record<string, CanvasSkillNode>;
  canvasSkillOrder: string[];
  selectedCanvasSkillId: string | null;
  canvasTextLabels: Record<string, CanvasTextLabel>;
  canvasTextLabelOrder: string[];
  selectedCanvasTextLabelId: string | null;
  canvasStrokes: Record<string, CanvasStroke>;
  canvasStrokeOrder: string[];
  pencilToolActive: boolean;
  pencilColor: string;
  activeCanvasStrokeId: string | null;
  setPencilToolActive: (active: boolean) => void;
  setPencilColor: (color: string) => void;
  beginCanvasStroke: (point: { x: number; y: number }) => string;
  appendCanvasStrokePoint: (
    strokeId: string,
    point: { x: number; y: number },
  ) => void;
  finishCanvasStroke: (strokeId: string) => void;
  connectorStyle: ConnectorStyle;
  canvasBackgroundStyle: CanvasBackgroundStyle;
  canvasBackgroundImageId: string;
  canvasTheme: CanvasTheme;
  /** Artifact style pack applied to this canvas (structural look). */
  canvasArtifactStyle: ArtifactStyleId;
  /** UI sound effects enabled for this session. */
  soundEnabled: boolean;
  /** Master UI sound volume (0..1). */
  soundVolume: number;
  /** Session-only font preview — body layer (not persisted). */
  canvasPreviewBodyFontId: string;
  /** Session-only font preview — display layer (not persisted). */
  canvasPreviewDisplayFontId: string;
  /** First seeded card — world origin anchor (top-left at 0,0). Set once per canvas session. */
  globalOrigin: GlobalOrigin | null;
  undoPast: GraphSnapshot[];

  /** Active spawn animation target (single concurrent spawn). */
  spawnMeta: SpawnMeta | null;
  setSpawnMeta: (meta: SpawnMeta) => void;
  clearSpawnMeta: () => void;
  clearRecentConnection: () => void;
  /** Connection id to play draw-in animation (cleared after draw). */
  recentConnectionId: string | null;
  /** Artifact plug connection id to play draw-in animation. */
  recentArtifactPlugId: string | null;
  clearRecentArtifactPlug: () => void;

  /** Staggered slide-in after canvas hydrate (login / reload / switch). */
  canvasLoadReveal: CanvasLoadReveal | null;
  startCanvasLoadReveal: () => void;
  clearCanvasLoadReveal: () => void;

  plugDrag: PlugDragState | null;
  plugComposerAttachments: Record<string, AttachedArtifactRef>;
  plugComposerAssetAttachments: Record<string, AttachedAssetRef>;
  plugComposerSkillAttachments: Record<string, AttachedSkillRef>;
  plugComposerGroupAttachments: Record<string, AttachedGroupRef>;
  /** Unsubmitted composer text per card — session-only, not persisted. */
  composerDraftsByCardId: Record<string, string>;
  setComposerDraft: (cardId: string, draft: string) => void;
  clearComposerDraft: (cardId: string) => void;
  artifactPlugConnections: ArtifactPlugConnection[];
  skillPlugConnections: SkillPlugConnection[];
  groupPlugConnections: GroupPlugConnection[];

  selectedFamilyRootIds: string[];
  /** Unified multi-selection of non-card canvas nodes (cards select via families). */
  canvasSelection: CanvasSelectionItem[];
  /** Branch thread ids collapsed on the canvas (session UI only, not persisted). */
  collapsedBranchThreadIds: string[];
  /** Card ids with answer + descendant subtree collapsed on canvas (session UI only). */
  collapsedCardIds: string[];
  /** Session-only: hide every chat card on the canvas. */
  chatsGloballyHidden: boolean;
  groups: Record<string, BranchGroup>;
  activeGroupId: string | null;

  setSelectedFamilyRootIds: (rootThreadIds: string[]) => void;
  /** Replace the unified selection (marquee result). */
  setCanvasSelection: (selection: CanvasSelection) => void;
  /** Union the unified selection (Shift/Ctrl additive marquee). */
  addCanvasSelection: (selection: CanvasSelection) => void;
  /** Toggle one node in/out of the unified selection (Shift/Ctrl click). */
  toggleCanvasSelectionItem: (item: CanvasSelectionItem) => void;
  /** Move every selected unit (families + nodes) by a world-space delta. */
  moveSelectedCanvasItems: (dx: number, dy: number) => void;
  alignSelectedCanvasItems: (mode: AlignMode) => void;
  arrangeSelectedCanvasItems: (mode: ArrangeMode) => void;
  duplicateCanvasTextLabel: (nodeId: string) => string | null;
  duplicateCanvasAssetNode: (nodeId: string) => string | null;
  duplicateCanvasGifNode: (nodeId: string) => string | null;
  duplicateCanvasArtifactNode: (nodeId: string) => string | null;
  duplicateCanvasSkillNode: (nodeId: string) => string | null;
  canCopyCanvasSelection: () => boolean;
  copySelectedCanvasItems: () => Promise<boolean>;
  pasteCanvasClipboardAt: (
    world: { x: number; y: number },
    payload?: CanvasClipboardPayload,
    options?: { canvasId?: string },
  ) => boolean;
  toggleBranchThreadCollapsed: (branchThreadId: string) => void;
  toggleCardCollapsed: (cardId: string) => void;
  toggleChatsGloballyHidden: () => void;
  autoCollapseInactiveThreads: (threadIds: string[]) => void;
  clearSelection: () => void;
  /** Remove the current canvas selection from the canvas (sidebar data is kept). */
  removeSelectedFromCanvas: () => void;
  createGroupFromSelection: (label?: string) => string | null;
  setGroupSummary: (groupId: string, markdown: string) => void;
  openGroupArtifact: (groupId: string) => void;
  closeGroupArtifact: () => void;
  removeGroup: (groupId: string) => void;
  setActiveGroupId: (groupId: string | null) => void;
  renameGroup: (groupId: string, label: string) => void;
  /** Move every member of a group (families + nodes) by a world-space delta. */
  moveGroupBy: (groupId: string, dx: number, dy: number) => void;

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
  setCanvasArtifactSize: (
    nodeId: string,
    size: CardSize,
    options?: { userSet?: boolean },
  ) => void;
  moveSubtree: (rootId: string, dx: number, dy: number) => void;

  createRootCard: (position: { x: number; y: number }) => string;
  createFollowUp: (
    parentId: string,
    question: string,
    options?: FollowUpOptions,
  ) => string | null;
  createBranch: (
    sourceId: string,
    side: "left" | "right",
    options?: BranchOptions,
  ) => string | null;
  createBranchAt: (
    sourceId: string,
    side: "left" | "right",
    position: { x: number; y: number },
    options?: BranchOptions,
  ) => string | null;
  createBranchFromSelection: (
    sourceId: string,
    selectedText: string,
    side?: "left" | "right",
  ) => string | null;
  addAnswerExplain: (cardId: string, explain: AnswerExplain) => void;
  updateAnswerExplain: (
    cardId: string,
    explainId: string,
    patch: Partial<AnswerExplain>,
  ) => void;
  createRootCardWithAttachment: (
    position: { x: number; y: number },
    ref: AttachedArtifactRef,
  ) => string;
  createRootCardWithAssetAttachment: (
    position: { x: number; y: number },
    ref: AttachedAssetRef,
  ) => string;
  createRootCardWithSkillAttachment: (
    position: { x: number; y: number },
    ref: AttachedSkillRef,
  ) => string;
  createRootCardWithGroupAttachment: (
    position: { x: number; y: number },
    ref: AttachedGroupRef,
  ) => string;
  setCardComposerAttachment: (
    cardId: string,
    ref: AttachedArtifactRef,
  ) => void;
  setCardComposerAssetAttachment: (
    cardId: string,
    ref: AttachedAssetRef,
  ) => void;
  setCardComposerSkillAttachment: (
    cardId: string,
    ref: AttachedSkillRef,
  ) => void;
  setCardComposerGroupAttachment: (
    cardId: string,
    ref: AttachedGroupRef,
  ) => void;
  addArtifactPlugConnection: (conn: {
    artifactNodeId: string;
    cardId: string;
    fromSide: PlugSide;
    toSide: PlugSide;
  }) => void;
  addSkillPlugConnection: (conn: {
    skillNodeId: string;
    cardId: string;
    fromSide: PlugSide;
    toSide: PlugSide;
  }) => void;
  addGroupPlugConnection: (conn: {
    groupId: string;
    cardId: string;
    fromSide: PlugSide;
    toSide: PlugSide;
  }) => void;
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
  createBlankTodoArtifact: (
    title?: string,
  ) => { artifactId: string; versionId: string };
  createVideoArtifactFromUrl: (
    url: string,
    opts?: {
      title?: string;
      thumb?: string;
      position?: { x: number; y: number };
      recordUndo?: boolean;
    },
  ) => { artifactId: string; versionId: string };
  createAudioArtifactFromFile: (
    file: File,
    opts?: {
      uploadContext: AssetUploadContext | null;
      position?: { x: number; y: number };
      index?: number;
      recordUndo?: boolean;
    },
  ) => Promise<
    | { artifactId: string; versionId: string }
    | { error: AssetUploadError }
  >;
  createThreeDArtifactFromFile: (
    file: File,
    opts?: {
      uploadContext: AssetUploadContext | null;
      position?: { x: number; y: number };
      index?: number;
      recordUndo?: boolean;
    },
  ) => Promise<
    | { artifactId: string; versionId: string }
    | { error: AssetUploadError }
  >;
  createWebsiteArtifactFromUrl: (
    url: string,
    position?: { x: number; y: number },
    opts?: { recordUndo?: boolean },
  ) => { artifactId: string; versionId: string };
  createRepoArtifactFromUrl: (
    url: string,
    opts?: {
      position?: { x: number; y: number };
      recordUndo?: boolean;
    },
  ) => { artifactId: string; versionId: string };
  createEmbedArtifactFromUrl: (
    url: string,
    opts?: {
      position?: { x: number; y: number };
      size?: { w: number; h: number };
      recordUndo?: boolean;
    },
  ) => { artifactId: string; versionId: string };
  createGoogleWorkspaceArtifactFromUrl: (
    url: string,
    opts?: {
      position?: { x: number; y: number };
      recordUndo?: boolean;
    },
  ) => { artifactId: string; versionId: string };
  patchGoogleWorkspaceArtifact: (
    artifactId: string,
    patch: Partial<
      import("@/lib/artifactTypes").GoogleWorkspaceArtifactData
    > & { title?: string },
  ) => void;
  patchRepoArtifactExplorer: (
    artifactId: string,
    patch: Partial<RepoExplorerData>,
  ) => void;
  patchWebsiteArtifactTitle: (
    artifactId: string,
    patch: {
      title: string;
      faviconUrl?: string;
      previewImageUrl?: string;
      previewAssetId?: string;
      embeddable?: boolean;
    },
  ) => void;
  patchYoutubeArtifactTitle: (
    artifactId: string,
    versionId: string,
    patch: { title: string; thumb?: string },
  ) => void;
  renameSessionArtifactTitle: (artifactId: string, title: string) => void;
  patchEmbedArtifact: (
    artifactId: string,
    versionId: string,
    patch: EmbedResolveResult | { status: "loading" },
  ) => void;
  ensurePendingTableArtifact: (
    cardId: string,
  ) => { artifactId: string; versionId: string } | null;
  ensurePendingCustomArtifact: (
    cardId: string,
  ) => { artifactId: string; versionId: string } | null;
  spawnGeneratingArtifactPreview: (
    cardId: string,
    kind: import("@/lib/artifactTypes").ArtifactKind,
    title: string,
  ) => string | null;
  removeGeneratingArtifactPreview: (cardId: string) => void;
  saveTodoArtifactVersion: (
    artifactId: string,
    payload: Extract<ArtifactPayload, { type: "todo" }>,
  ) => { versionId: string };
  saveMapArtifactVersion: (
    artifactId: string,
    payload: Extract<ArtifactPayload, { type: "map" }>,
  ) => { versionId: string };
  saveCalendarArtifactVersion: (
    artifactId: string,
    payload: Extract<ArtifactPayload, { type: "calendar" }>,
  ) => { versionId: string };
  saveTimelineArtifactVersion: (
    artifactId: string,
    payload: Extract<ArtifactPayload, { type: "timeline" }>,
  ) => { versionId: string };
  saveStreetViewArtifactVersion: (
    artifactId: string,
    payload: Extract<ArtifactPayload, { type: "streetview" }>,
  ) => { versionId: string };
  saveStickyNoteArtifactVersion: (
    artifactId: string,
    payload: Extract<ArtifactPayload, { type: "stickynote" }>,
  ) => { versionId: string };
  openSessionArtifact: (artifactId: string, versionId?: string) => void;
  setArtifactPanelVersion: (versionId: string) => void;
  listSessionArtifacts: () => SessionArtifact[];

  spawnCanvasArtifact: (
    artifactId: string,
    versionId: string,
    opts?: {
      position?: { x: number; y: number };
      size?: { w: number; h: number };
      focus?: boolean;
      payload?: ArtifactPayload;
      side?: ArtifactSpawnSide;
    },
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
  wireArtifactToSourceCard: (
    artifactNodeId: string,
    cardId: string,
  ) => void;
  spawnPermissionPreview: (
    cardId: string,
    payload: ArtifactPayload,
    opts?: { copy?: string; position?: { x: number; y: number } },
  ) => string | null;
  approvePermissionPreview: (nodeId: string) => void;
  declinePermissionPreview: (nodeId: string) => void;

  spawnCanvasTextLabel: (
    position: { x: number; y: number },
    text?: string,
  ) => string;
  moveCanvasTextLabel: (nodeId: string, dx: number, dy: number) => void;
  updateCanvasTextLabel: (nodeId: string, text: string) => void;
  setCanvasTextLabelFontSize: (nodeId: string, fontSize: number) => void;
  setCanvasTextLabelWidth: (nodeId: string, width: number) => void;
  removeCanvasTextLabel: (nodeId: string) => void;
  selectCanvasTextLabel: (nodeId: string | null) => void;

  openArtifact: (cardId: string) => void;
  closeArtifact: () => void;
  setConnectorStyle: (style: ConnectorStyle) => void;
  setCanvasBackgroundStyle: (style: CanvasBackgroundStyle) => void;
  setCanvasBackgroundImageId: (id: string) => void;
  cycleCanvasBackgroundImage: (delta: -1 | 1) => void;
  setCanvasTheme: (theme: CanvasTheme) => void;
  setCanvasArtifactStyle: (styleId: ArtifactStyleId) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setSoundVolume: (volume: number) => void;
  setCanvasPreviewBodyFontId: (id: string) => void;
  setCanvasPreviewDisplayFontId: (id: string) => void;
  /** Re-measure cards from DOM at current zoom, then repair vertical chains. */
  relayoutCanvasFromDom: () => void;
  /** Re-snap the vertical chain under a parent after DOM height changes. */
  relayoutFollowUpChainFromParent: (parentId: string) => void;
  /** Snap the bottom follow-up to the parent after its composer footer unmounts. */
  snapFollowUpChildToParent: (parentId: string) => void;

  getCanvasSnapshotSource: () => CanvasSnapshotSource;
  hydrateFromSnapshot: (
    snapshot: CanvasSnapshot,
    options?: {
      applyViewport?: boolean;
      canvasReveal?: boolean;
      /** Keep selection, open panels, and composer drafts during collab sync. */
      preserveEphemeral?: boolean;
    },
  ) => void;
  canvasReadOnly: boolean;
  setCanvasReadOnly: (readOnly: boolean) => void;
  collaborationHasEdits: boolean;
  setCollaborationHasEdits: (value: boolean) => void;
  /** Signed-in user performing local edits — used to attribute new artifacts/versions. */
  collaborationActorUserId: string | null;
  setCollaborationActorUserId: (userId: string | null) => void;
  appendContributorToCard: (cardId: string, userId: string) => void;
  appendContributorToArtifact: (artifactId: string, userId: string) => void;
  stampContributorOnActiveEdits: (userId: string) => void;
  resetCanvasState: () => void;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 3;
const VIEWPORT_SETTLE_MS = 150;

let viewportSettleTimer: ReturnType<typeof setTimeout> | null = null;

function flushViewportSettledScale(scale: number): void {
  if (viewportSettleTimer) {
    clearTimeout(viewportSettleTimer);
    viewportSettleTimer = null;
  }
  useCanvasStore.setState({ viewportSettledScale: scale });
}

function scheduleViewportSettledScale(scale: number): void {
  if (viewportSettleTimer) clearTimeout(viewportSettleTimer);
  viewportSettleTimer = setTimeout(() => {
    useCanvasStore.setState({ viewportSettledScale: scale });
    viewportSettleTimer = null;
  }, VIEWPORT_SETTLE_MS);
}

// Placeholder palette for thread accents until OQ-01 is resolved.
// Cycles after 8 threads.
const PALETTE = [...THREAD_ACCENT_PALETTE];

const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;

function newCanvasArtifactNodeId() {
  return newId("cano");
}

function newCanvasAssetNodeId() {
  return newId("assetnode");
}

function newCanvasSkillNodeId() {
  return newId("skillnode");
}

function newCanvasSkillId() {
  return newId("skill");
}

function newCanvasTextLabelId() {
  return newId("ctxt");
}

function newCanvasStrokeId() {
  return newId("stroke");
}

function newCanvasGifNodeId() {
  return newId("gifnode");
}

function newCanvas3DNodeId() {
  return newId("3dnode");
}

export const newCardId = () => newId("card");
export const newExplainId = () => newId("explain");
const newThreadId = () => newId("thread");
const newGroupId = () => newId("group");

/** Empty home card at the global origin — shared by hydrate + first canvas seed. */
function createLandingSeedCard(tuning: ResolvedCanvasTuning, threadIndex: number) {
  const cardId = newCardId();
  const threadId = newThreadId();
  const accent = PALETTE[threadIndex % PALETTE.length];
  const thread: Thread = { id: threadId, accentColour: accent };
  const card: Card = {
    id: cardId,
    threadId,
    question: "",
    answer: "",
    status: "empty",
    position: { x: CANVAS_ORIGIN.x, y: CANVAS_ORIGIN.y },
    size: emptyCardSize(tuning),
    parentCardId: null,
    parentConversationId: null,
  };
  return { cardId, card, thread, threadId };
}

function layoutStateFrom(state: CanvasState): {
  cards: Record<string, Card>;
  connections: Connection[];
  cardOrder: string[];
} {
  return {
    cards: state.cards,
    connections: state.connections,
    cardOrder: state.cardOrder,
  };
}

const TUNING: ResolvedCanvasTuning = RESOLVED_CANVAS_TUNING;

function syncCardWidthsToTuning(
  cards: Record<string, Card>,
  cardWidth: number,
  emptyHeight: number,
): Record<string, Card> {
  const next = { ...cards };
  for (const id of Object.keys(next)) {
    const c = next[id];
    if (!c) continue;
    if (c.size?.w === cardWidth) continue;
    const h = c.size?.h ?? emptyHeight;
    next[id] = { ...c, size: { w: cardWidth, h } };
  }
  return next;
}

function applyTuningLayoutRepair(
  cards: Record<string, Card>,
  connections: Connection[],
  cardOrder: string[],
  tuning: ResolvedCanvasTuning,
  repairLateralBands: boolean,
): Record<string, Card> {
  if (repairLateralBands) {
    return repairCanvasLayout(cards, connections, cardOrder, tuning);
  }
  return repairVerticalChainsOnly(cards, connections, cardOrder, tuning);
}

function relayoutCardsAfterSizeChange(
  state: CanvasState,
  cardsWithSize: Record<string, Card>,
  cardId: string,
  prev: CardSize | undefined,
  normalized: CardSize,
): Record<string, Card> {
  const tuning = TUNING;

  if (prev?.h != null) {
    const dy = normalized.h - prev.h;
    if (dy === 0) return cardsWithSize;
    if (DEFAULT_CANVAS_TUNING.useDeltaShiftOnResize) {
      return shiftBottomAttachedSubtrees(
        cardsWithSize,
        state.connections,
        cardId,
        dy,
        (childId) => {
          const child = cardsWithSize[childId];
          return child != null && !isCardPending(child.status);
        },
      );
    }
    return relayoutVerticalChainOf(
      { ...layoutStateFrom(state), cards: cardsWithSize },
      cardId,
      tuning,
    );
  }

  return relayoutVerticalChainOf(
    { ...layoutStateFrom(state), cards: cardsWithSize },
    cardId,
    tuning,
  );
}

/** Sync DOM sizes and re-snap the vertical chain under `parentId`. */
function relayoutFollowUpChainFromDom(
  state: Pick<CanvasState, "cards" | "connections" | "cardOrder">,
  parentId: string,
): Record<string, Card> {
  const tuning = TUNING;
  let cards = syncAllCardDomSizes(state.cards, tuning.cardWidth);
  return relayoutVerticalChainOf(
    { ...layoutStateFrom(state as CanvasState), cards },
    parentId,
    tuning,
  );
}

function normalizeLoadedCards(
  cards: Record<string, Card>,
  tuning: ResolvedCanvasTuning = TUNING,
): Record<string, Card> {
  const next = { ...cards };
  for (const [id, card] of Object.entries(next)) {
    let normalized = card;
    if (card.status === "streaming" || card.status === "thinking") {
      normalized = {
        ...normalized,
        status: "done",
        thinkingLabel: undefined,
        pendingFiles: undefined,
      };
    }
    if (normalized.status === "empty" && !normalized.size) {
      normalized = { ...normalized, size: emptyCardSize(tuning) };
    }
    next[id] = normalized;
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

/**
 * Selection patch shared by every selection writer: keeps the legacy single
 * "focused" ids in sync with the unified multi-selection (single id is set
 * only when exactly one node and no families are selected).
 */
function unifiedSelectionPatch(selection: CanvasSelection) {
  const single =
    selection.familyRootIds.length === 0 && selection.items.length === 1
      ? selection.items[0]
      : null;
  const hasSelection =
    selection.familyRootIds.length > 0 || selection.items.length > 0;
  return {
    selectedFamilyRootIds: selection.familyRootIds,
    canvasSelection: selection.items,
    selectedCanvasArtifactId: single?.kind === "artifact" ? single.id : null,
    selectedCanvasAssetId: single?.kind === "asset" ? single.id : null,
    selectedCanvasGifId: single?.kind === "gif" ? single.id : null,
    selectedCanvas3DId: single?.kind === "3d" ? single.id : null,
    selectedCanvasSkillId: single?.kind === "skill" ? single.id : null,
    selectedCanvasTextLabelId: single?.kind === "label" ? single.id : null,
    // Selecting anything else deactivates the active group (Figma-section
    // behavior); empty patches leave it alone so group creation — which
    // clears the selection and activates the new group — is not undone.
    ...(hasSelection ? { activeGroupId: null } : {}),
  };
}

/** Slice of CanvasState mutated when moving selection units. */
interface SelectionMoveSlice {
  cards: Record<string, Card>;
  cardOrder: string[];
  globalOrigin: GlobalOrigin | null;
  connections: Connection[];
  threads: Record<string, Thread>;
  threadOrder: string[];
  canvasArtifactNodes: Record<string, CanvasArtifactNode>;
  canvasAssetNodes: Record<string, CanvasAssetNode>;
  canvasGifNodes: Record<string, CanvasGifNode>;
  canvas3DNodes: Record<string, Canvas3DNode>;
  canvasSkillNodes: Record<string, CanvasSkillNode>;
  canvasTextLabels: Record<string, CanvasTextLabel>;
}

function moveNodeRecord<T extends { position: { x: number; y: number } }>(
  records: Record<string, T>,
  id: string,
  dx: number,
  dy: number,
): Record<string, T> {
  const node = records[id];
  if (!node) return records;
  return {
    ...records,
    [id]: {
      ...node,
      position: { x: node.position.x + dx, y: node.position.y + dy },
    },
  };
}

/** Group fields touched when node deletion prunes group membership. */
interface GroupPruneSlice {
  groups: Record<string, BranchGroup>;
  activeGroupId: string | null;
  openGroupArtifactId: string | null;
  groupPlugConnections: GroupPlugConnection[];
}

/**
 * Drop removed node ids from every group's items. Groups left with no
 * members at all are deleted (mirrors the family-deletion cleanup).
 */
function pruneGroupItemsForRemovedNodes(
  state: GroupPruneSlice,
  kind: CanvasSelectionItem["kind"],
  removedIds: Iterable<string>,
): Partial<GroupPruneSlice> {
  const removed = new Set(removedIds);
  if (removed.size === 0) return {};
  let changed = false;
  const nextGroups = { ...state.groups };
  let activeGroupId = state.activeGroupId;
  let openGroupArtifactId = state.openGroupArtifactId;
  for (const [gid, group] of Object.entries(nextGroups)) {
    const items = group.items ?? [];
    const remaining = items.filter(
      (item) => !(item.kind === kind && removed.has(item.id)),
    );
    if (remaining.length === items.length) continue;
    changed = true;
    if (remaining.length === 0 && group.familyRootThreadIds.length === 0) {
      delete nextGroups[gid];
      if (activeGroupId === gid) activeGroupId = null;
      if (openGroupArtifactId === gid) openGroupArtifactId = null;
    } else {
      nextGroups[gid] = { ...group, items: remaining };
    }
  }
  if (!changed) return {};
  return {
    groups: nextGroups,
    activeGroupId,
    openGroupArtifactId,
    groupPlugConnections: state.groupPlugConnections.filter(
      (c) => nextGroups[c.groupId],
    ),
  };
}

/** Apply per-unit deltas: families move all their cards, nodes move directly. */
function applySelectionUnitDeltas<S extends SelectionMoveSlice>(
  state: S,
  deltas: SelectionUnitDelta[],
): Partial<SelectionMoveSlice> {
  let cards = state.cards;
  let artifacts = state.canvasArtifactNodes;
  let assets = state.canvasAssetNodes;
  let gifs = state.canvasGifNodes;
  let threeD = state.canvas3DNodes;
  let skills = state.canvasSkillNodes;
  let labels = state.canvasTextLabels;

  for (const d of deltas) {
    if (d.dx === 0 && d.dy === 0) continue;
    switch (d.kind) {
      case "family": {
        const ids = getFamilyCardIds(state, d.id);
        // Families anchored by the pinned origin card stay put.
        const pinned = ids.some((id) =>
          isOriginCardPinned(pickCanvasLandingInput(state), id, state.globalOrigin),
        );
        if (pinned) break;
        if (cards === state.cards) cards = { ...cards };
        for (const id of ids) {
          const c = cards[id];
          if (!c) continue;
          cards[id] = {
            ...c,
            position: { x: c.position.x + d.dx, y: c.position.y + d.dy },
          };
        }
        break;
      }
      case "artifact":
        artifacts = moveNodeRecord(artifacts, d.id, d.dx, d.dy);
        break;
      case "asset":
        assets = moveNodeRecord(assets, d.id, d.dx, d.dy);
        break;
      case "gif":
        gifs = moveNodeRecord(gifs, d.id, d.dx, d.dy);
        break;
      case "3d":
        threeD = moveNodeRecord(threeD, d.id, d.dx, d.dy);
        break;
      case "skill":
        skills = moveNodeRecord(skills, d.id, d.dx, d.dy);
        break;
      case "label":
        labels = moveNodeRecord(labels, d.id, d.dx, d.dy);
        break;
    }
  }

  return {
    cards,
    canvasArtifactNodes: artifacts,
    canvasAssetNodes: assets,
    canvasGifNodes: gifs,
    canvas3DNodes: threeD,
    canvasSkillNodes: skills,
    canvasTextLabels: labels,
  };
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  selectedModel: "claude-sonnet-4-6",
  guestWall: { open: false, questionsAsked: null },
  openGuestWall: (questionsAsked) =>
    set({ guestWall: { open: true, questionsAsked } }),
  dismissGuestWall: () =>
    set((s) => ({ guestWall: { ...s.guestWall, open: false } })),
  publishedOrigin: null,
  setPublishedOrigin: (origin) => set({ publishedOrigin: origin }),
  markPublishedCanvasForked: () =>
    set((s) =>
      // Idempotent: called from every mutation entry point, so it must be free
      // to run on every keystroke-driven action without churning state.
      !s.publishedOrigin || s.publishedOrigin.forked
        ? s
        : { publishedOrigin: { ...s.publishedOrigin, forked: true } },
    ),
  sessionUsage: {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  },
  addUsage: (input, output, cacheRead = 0, cacheCreation = 0) =>
    set((s) => ({
      sessionUsage: {
        inputTokens: s.sessionUsage.inputTokens + input,
        outputTokens: s.sessionUsage.outputTokens + output,
        cacheReadTokens: s.sessionUsage.cacheReadTokens + cacheRead,
        cacheCreationTokens: s.sessionUsage.cacheCreationTokens + cacheCreation,
      },
    })),
  addCardTurnUsage: (cardId, input, output, cacheRead = 0, cacheCreation = 0) =>
    set((s) => {
      if (!input && !output && !cacheRead && !cacheCreation) return s;
      const card = s.cards[cardId];
      if (!card) return s;
      const prev = card.turnUsage ?? { inputTokens: 0, outputTokens: 0 };
      return {
        cards: {
          ...s.cards,
          [cardId]: {
            ...card,
            turnUsage: {
              inputTokens: prev.inputTokens + input,
              outputTokens: prev.outputTokens + output,
              cacheReadTokens: (prev.cacheReadTokens ?? 0) + cacheRead,
              cacheCreationTokens:
                (prev.cacheCreationTokens ?? 0) + cacheCreation,
            },
          },
        },
      };
    }),
  setModel: (model) => set({ selectedModel: model }),

  leftPanelCollapsed: true,
  setLeftPanelCollapsed: (collapsed) => set({ leftPanelCollapsed: collapsed }),
  toggleLeftPanel: () =>
    set((s) => ({ leftPanelCollapsed: !s.leftPanelCollapsed })),

  rightPanelCollapsed: true,
  setRightPanelCollapsed: (collapsed) => set({ rightPanelCollapsed: collapsed }),
  toggleRightPanel: () =>
    set((s) => ({ rightPanelCollapsed: !s.rightPanelCollapsed })),

  uploadedAttachments: [],
  addUploadedAttachment: (attachment) =>
    set((s) => ({
      uploadedAttachments: [...s.uploadedAttachments, attachment],
    })),
  removeUploadedAttachment: (id) =>
    set((s) => ({
      uploadedAttachments: s.uploadedAttachments.filter((a) => a.id !== id),
    })),
  canvasAssets: {},
  canvasAssetNodes: {},
  canvasAssetOrder: [],
  selectedCanvasAssetId: null,
  addCanvasAsset: (asset) =>
    set((state) => ({
      canvasAssets: { ...state.canvasAssets, [asset.id]: asset },
      collaborationHasEdits: true,
    })),
  patchCanvasAssetPublicUrl: (assetId, publicUrl) =>
    set((state) => {
      const asset = state.canvasAssets[assetId];
      if (!asset) return state;
      return {
        canvasAssets: {
          ...state.canvasAssets,
          [assetId]: { ...asset, publicUrl },
        },
      };
    }),
  removeCanvasAsset: (assetId) =>
    set((state) => {
      if (!state.canvasAssets[assetId]) return state;
      const nextAssets = { ...state.canvasAssets };
      delete nextAssets[assetId];
      const nextNodes = { ...state.canvasAssetNodes };
      const removedNodeIds = new Set<string>();
      for (const [nodeId, node] of Object.entries(nextNodes)) {
        if (node.assetId === assetId) {
          delete nextNodes[nodeId];
          removedNodeIds.add(nodeId);
        }
      }
      return {
        canvasAssets: nextAssets,
        canvasAssetNodes: nextNodes,
        canvasAssetOrder: state.canvasAssetOrder.filter(
          (id) => !removedNodeIds.has(id),
        ),
        selectedCanvasAssetId:
          state.selectedCanvasAssetId && removedNodeIds.has(state.selectedCanvasAssetId)
            ? null
            : state.selectedCanvasAssetId,
        ...pruneGroupItemsForRemovedNodes(state, "asset", removedNodeIds),
        collaborationHasEdits: true,
      };
    }),
  spawnCanvasAsset: (assetId, opts) => {
    let nodeId: string | null = null;
    set((state) => {
      const asset = state.canvasAssets[assetId];
      if (!asset) return state;
      const id = newCanvasAssetNodeId();
      nodeId = id;
      const bounds = getCanvasAssetBounds({}, asset);
      const size = { w: bounds.w, h: bounds.h };
      const node: CanvasAssetNode = {
        id,
        assetId,
        position: opts?.position ?? { x: 0, y: 0 },
        size,
      };
      return {
        canvasAssetNodes: { ...state.canvasAssetNodes, [id]: node },
        canvasAssetOrder: [...state.canvasAssetOrder, id],
        ...(opts?.focus
          ? unifiedSelectionPatch({
              familyRootIds: [],
              items: [{ kind: "asset", id }],
            })
          : {}),
        collaborationHasEdits: true,
      };
    });
    return nodeId;
  },
  moveCanvasAsset: (nodeId, dx, dy) =>
    set((state) => {
      if (dx === 0 && dy === 0) return state;
      const node = state.canvasAssetNodes[nodeId];
      if (!node) return state;
      return {
        canvasAssetNodes: {
          ...state.canvasAssetNodes,
          [nodeId]: {
            ...node,
            position: {
              x: node.position.x + dx,
              y: node.position.y + dy,
            },
          },
        },
        collaborationHasEdits: true,
      };
    }),
  setCanvasAssetSize: (nodeId, size) =>
    set((state) => {
      const node = state.canvasAssetNodes[nodeId];
      if (!node) return state;
      const prev = node.size;
      if (prev && prev.w === size.w && prev.h === size.h) return state;
      return {
        canvasAssetNodes: {
          ...state.canvasAssetNodes,
          [nodeId]: { ...node, size },
        },
        collaborationHasEdits: true,
      };
    }),
  selectCanvasAsset: (nodeId) =>
    set(
      unifiedSelectionPatch({
        familyRootIds: [],
        items: nodeId ? [{ kind: "asset", id: nodeId }] : [],
      }),
    ),
  removeCanvasAssetNode: (nodeId) =>
    set((state) => {
      if (!state.canvasAssetNodes[nodeId]) return state;
      const next = { ...state.canvasAssetNodes };
      delete next[nodeId];
      return {
        canvasAssetNodes: next,
        canvasAssetOrder: state.canvasAssetOrder.filter((id) => id !== nodeId),
        selectedCanvasAssetId:
          state.selectedCanvasAssetId === nodeId
            ? null
            : state.selectedCanvasAssetId,
        canvasSelection: state.canvasSelection.filter(
          (i) => !(i.kind === "asset" && i.id === nodeId),
        ),
        ...pruneGroupItemsForRemovedNodes(state, "asset", [nodeId]),
        collaborationHasEdits: true,
      };
    }),

  canvasGifNodes: {},
  canvasGifOrder: [],
  selectedCanvasGifId: null,
  canvas3DNodes: {},
  canvas3DOrder: [],
  selectedCanvas3DId: null,
  canvas3dPlacementRequest: null,
  gifPickerOpen: false,
  setGifPickerOpen: (open) => set({ gifPickerOpen: open }),
  imagePlacementAssetId: null,
  requestImagePlacement: (assetId) =>
    set({ imagePlacementAssetId: assetId, viewMode: "canvas" }),
  gifPlacementRequest: null,
  requestGifPlacement: (input) =>
    set({
      gifPlacementRequest: input,
      gifPickerOpen: false,
      viewMode: "canvas",
    }),
  spawnCanvasGif: (input, opts) => {
    let nodeId: string | null = null;
    set((state) => {
      const id = newCanvasGifNodeId();
      nodeId = id;
      const aspect =
        input.aspectRatio && input.aspectRatio > 0 ? input.aspectRatio : 1;
      const w = Math.min(360, Math.max(120, 240));
      const node: CanvasGifNode = {
        id,
        url: input.url,
        previewUrl: input.previewUrl,
        title: input.title,
        category: input.category,
        aspectRatio: aspect,
        sourceId: input.sourceId,
        position: opts?.position ?? { x: 0, y: 0 },
        size: { w, h: w / aspect },
      };
      return {
        canvasGifNodes: { ...state.canvasGifNodes, [id]: node },
        canvasGifOrder: [...state.canvasGifOrder, id],
        ...(opts?.focus
          ? unifiedSelectionPatch({
              familyRootIds: [],
              items: [{ kind: "gif", id }],
            })
          : {}),
        collaborationHasEdits: true,
      };
    });
    return nodeId;
  },
  moveCanvasGif: (nodeId, dx, dy) =>
    set((state) => {
      if (dx === 0 && dy === 0) return state;
      const node = state.canvasGifNodes[nodeId];
      if (!node) return state;
      return {
        canvasGifNodes: {
          ...state.canvasGifNodes,
          [nodeId]: {
            ...node,
            position: {
              x: node.position.x + dx,
              y: node.position.y + dy,
            },
          },
        },
        collaborationHasEdits: true,
      };
    }),
  setCanvasGifSize: (nodeId, size) =>
    set((state) => {
      const node = state.canvasGifNodes[nodeId];
      if (!node) return state;
      const prev = node.size;
      if (prev && prev.w === size.w && prev.h === size.h) return state;
      return {
        canvasGifNodes: {
          ...state.canvasGifNodes,
          [nodeId]: { ...node, size },
        },
        collaborationHasEdits: true,
      };
    }),
  selectCanvasGif: (nodeId) =>
    set(
      unifiedSelectionPatch({
        familyRootIds: [],
        items: nodeId ? [{ kind: "gif", id: nodeId }] : [],
      }),
    ),
  removeCanvasGifNode: (nodeId) =>
    set((state) => {
      if (!state.canvasGifNodes[nodeId]) return state;
      const next = { ...state.canvasGifNodes };
      delete next[nodeId];
      return {
        canvasGifNodes: next,
        canvasGifOrder: state.canvasGifOrder.filter((id) => id !== nodeId),
        selectedCanvasGifId:
          state.selectedCanvasGifId === nodeId
            ? null
            : state.selectedCanvasGifId,
        canvasSelection: state.canvasSelection.filter(
          (i) => !(i.kind === "gif" && i.id === nodeId),
        ),
        ...pruneGroupItemsForRemovedNodes(state, "gif", [nodeId]),
        collaborationHasEdits: true,
      };
    }),

  requestCanvas3DPlacement: (input) =>
    set({
      canvas3dPlacementRequest: input,
      gifPickerOpen: false,
      viewMode: "canvas",
    }),
  spawnCanvas3D: (input, opts) => {
    let nodeId: string | null = null;
    set((state) => {
      const id = newCanvas3DNodeId();
      nodeId = id;
      const w = 240;
      const node: Canvas3DNode = {
        id,
        modelUrl: input.modelUrl,
        format: input.format,
        title: input.title,
        sourceId: input.sourceId,
        position: opts?.position ?? { x: 0, y: 0 },
        size: { w, h: w },
      };
      return {
        canvas3DNodes: { ...state.canvas3DNodes, [id]: node },
        canvas3DOrder: [...state.canvas3DOrder, id],
        ...(opts?.focus
          ? unifiedSelectionPatch({
              familyRootIds: [],
              items: [{ kind: "3d", id }],
            })
          : {}),
        collaborationHasEdits: true,
      };
    });
    return nodeId;
  },
  moveCanvas3D: (nodeId, dx, dy) =>
    set((state) => {
      if (dx === 0 && dy === 0) return state;
      const node = state.canvas3DNodes[nodeId];
      if (!node) return state;
      return {
        canvas3DNodes: {
          ...state.canvas3DNodes,
          [nodeId]: {
            ...node,
            position: {
              x: node.position.x + dx,
              y: node.position.y + dy,
            },
          },
        },
        collaborationHasEdits: true,
      };
    }),
  setCanvas3DSize: (nodeId, size) =>
    set((state) => {
      const node = state.canvas3DNodes[nodeId];
      if (!node) return state;
      const prev = node.size;
      if (prev && prev.w === size.w && prev.h === size.h) return state;
      return {
        canvas3DNodes: {
          ...state.canvas3DNodes,
          [nodeId]: { ...node, size },
        },
        collaborationHasEdits: true,
      };
    }),
  selectCanvas3D: (nodeId) =>
    set(
      unifiedSelectionPatch({
        familyRootIds: [],
        items: nodeId ? [{ kind: "3d", id: nodeId }] : [],
      }),
    ),
  removeCanvas3DNode: (nodeId) =>
    set((state) => {
      if (!state.canvas3DNodes[nodeId]) return state;
      const next = { ...state.canvas3DNodes };
      delete next[nodeId];
      return {
        canvas3DNodes: next,
        canvas3DOrder: state.canvas3DOrder.filter((id) => id !== nodeId),
        selectedCanvas3DId:
          state.selectedCanvas3DId === nodeId ? null : state.selectedCanvas3DId,
        canvasSelection: state.canvasSelection.filter(
          (i) => !(i.kind === "3d" && i.id === nodeId),
        ),
        ...pruneGroupItemsForRemovedNodes(state, "3d", [nodeId]),
        collaborationHasEdits: true,
      };
    }),

  canvasSkills: {},
  canvasSkillNodes: {},
  canvasSkillOrder: [],
  selectedCanvasSkillId: null,
  addCanvasSkill: (skill) =>
    set((state) => ({
      canvasSkills: { ...state.canvasSkills, [skill.id]: skill },
      collaborationHasEdits: true,
    })),
  setCanvasSkillMetadataStatus: (skillId, status) =>
    set((state) => {
      const skill = state.canvasSkills[skillId];
      if (!skill) return state;
      return {
        canvasSkills: {
          ...state.canvasSkills,
          [skillId]: { ...skill, metadataStatus: status },
        },
      };
    }),
  setCanvasSkillAiMetadata: (skillId, metadata) =>
    set((state) => {
      const skill = state.canvasSkills[skillId];
      if (!skill) return state;
      return {
        canvasSkills: {
          ...state.canvasSkills,
          [skillId]: { ...skill, metadata, metadataStatus: "ready" },
        },
        collaborationHasEdits: true,
      };
    }),
  removeCanvasSkill: (skillId) =>
    set((state) => {
      if (!state.canvasSkills[skillId]) return state;
      const nextSkills = { ...state.canvasSkills };
      delete nextSkills[skillId];
      const nextNodes = { ...state.canvasSkillNodes };
      const removedNodeIds = new Set<string>();
      for (const [nodeId, node] of Object.entries(nextNodes)) {
        if (node.skillId === skillId) {
          delete nextNodes[nodeId];
          removedNodeIds.add(nodeId);
        }
      }
      return {
        canvasSkills: nextSkills,
        canvasSkillNodes: nextNodes,
        canvasSkillOrder: state.canvasSkillOrder.filter(
          (id) => !removedNodeIds.has(id),
        ),
        selectedCanvasSkillId:
          state.selectedCanvasSkillId && removedNodeIds.has(state.selectedCanvasSkillId)
            ? null
            : state.selectedCanvasSkillId,
        skillPlugConnections: state.skillPlugConnections.filter(
          (c) => !removedNodeIds.has(c.skillNodeId),
        ),
        collaborationHasEdits: true,
      };
    }),
  spawnCanvasSkill: (skillId, opts) => {
    let nodeId: string | null = null;
    set((state) => {
      const skill = state.canvasSkills[skillId];
      if (!skill) return state;
      const id = newCanvasSkillNodeId();
      nodeId = id;
      const node: CanvasSkillNode = {
        id,
        skillId,
        position: opts?.position ?? { x: 0, y: 0 },
      };
      return {
        canvasSkillNodes: { ...state.canvasSkillNodes, [id]: node },
        canvasSkillOrder: [...state.canvasSkillOrder, id],
        ...(opts?.focus
          ? unifiedSelectionPatch({
              familyRootIds: [],
              items: [{ kind: "skill", id }],
            })
          : {}),
        collaborationHasEdits: true,
      };
    });
    return nodeId;
  },
  moveCanvasSkill: (nodeId, dx, dy) =>
    set((state) => {
      if (dx === 0 && dy === 0) return state;
      const node = state.canvasSkillNodes[nodeId];
      if (!node) return state;
      return {
        canvasSkillNodes: {
          ...state.canvasSkillNodes,
          [nodeId]: {
            ...node,
            position: {
              x: node.position.x + dx,
              y: node.position.y + dy,
            },
          },
        },
        collaborationHasEdits: true,
      };
    }),
  setCanvasSkillNodeSize: (nodeId, size) =>
    set((state) => {
      const node = state.canvasSkillNodes[nodeId];
      if (!node) return state;
      const prev = node.size;
      if (prev && prev.w === size.w && prev.h === size.h) return state;
      return {
        canvasSkillNodes: {
          ...state.canvasSkillNodes,
          [nodeId]: { ...node, size },
        },
        collaborationHasEdits: true,
      };
    }),
  selectCanvasSkill: (nodeId) =>
    set(
      unifiedSelectionPatch({
        familyRootIds: [],
        items: nodeId ? [{ kind: "skill", id: nodeId }] : [],
      }),
    ),
  removeCanvasSkillNode: (nodeId) =>
    set((state) => {
      if (!state.canvasSkillNodes[nodeId]) return state;
      const next = { ...state.canvasSkillNodes };
      delete next[nodeId];
      return {
        canvasSkillNodes: next,
        canvasSkillOrder: state.canvasSkillOrder.filter((id) => id !== nodeId),
        selectedCanvasSkillId:
          state.selectedCanvasSkillId === nodeId
            ? null
            : state.selectedCanvasSkillId,
        canvasSelection: state.canvasSelection.filter(
          (i) => !(i.kind === "skill" && i.id === nodeId),
        ),
        skillPlugConnections: state.skillPlugConnections.filter(
          (c) => c.skillNodeId !== nodeId,
        ),
        collaborationHasEdits: true,
      };
    }),

  viewMode: "canvas",
  activeThreadId: null,
  canvasPlacementRequest: null,
  activeCanvasPlacement: null,
  requestCanvasPlacement: (tool) =>
    set({ canvasPlacementRequest: tool, viewMode: "canvas" }),
  artifactPlacementRequest: null,
  requestArtifactPlacement: (pick) =>
    set({ artifactPlacementRequest: pick, viewMode: "canvas" }),
  setViewMode: (mode) =>
    set((state) => {
      const next: Partial<CanvasState> = { viewMode: mode };
      if (
        (mode === "chat" || mode === "focus") &&
        !state.activeThreadId &&
        state.threadOrder[0]
      ) {
        next.activeThreadId = state.threadOrder[0];
      }
      if (mode === "focus" && state.focusArtifactId === null) {
        const threadId = next.activeThreadId ?? state.activeThreadId;
        if (threadId) {
          next.focusArtifactId = getLatestArtifactIdForThread(state, threadId);
        }
      }
      return next;
    }),
  setActiveThreadId: (threadId) => set({ activeThreadId: threadId }),

  focusArtifactId: null,
  focusDraftChat: null,
  setFocusArtifactId: (artifactId) => set({ focusArtifactId: artifactId }),
  focusSelectChat: (threadId) =>
    set((state) => ({
      activeThreadId: threadId,
      focusDraftChat: null,
      focusArtifactId: getLatestArtifactIdForThread(state, threadId),
    })),
  focusSelectArtifact: (artifactId) =>
    set((state) => {
      const threadId = getLatestThreadIdForArtifact(state, artifactId);
      return threadId
        ? {
            focusArtifactId: artifactId,
            activeThreadId: threadId,
            focusDraftChat: null,
          }
        : { focusArtifactId: artifactId };
    }),
  focusStartNewChat: (artifactRef) =>
    set({
      focusDraftChat: { artifactRef },
      ...(artifactRef ? {} : { focusArtifactId: null }),
    }),

  submitCardQuestion: (cardId, question, options) => {
    const q = question.trim();
    if (!q) return;
    get().markPublishedCanvasForked();
    const st = get();
    const card = st.cards[cardId];
    if (!card) return;
    st.recordUndo();
    const attachedFromPlug = resolveCardAttachedArtifactRefs(cardId, {
      cards: st.cards,
      artifactPlugConnections: st.artifactPlugConnections,
      canvasArtifactNodes: st.canvasArtifactNodes,
      plugComposerAttachments: st.plugComposerAttachments,
      sessionArtifacts: st.sessionArtifacts,
    });
    const attachedArtifacts = options?.attachedArtifacts?.length
      ? options.attachedArtifacts
      : card.attachedArtifacts?.length
        ? card.attachedArtifacts
        : attachedFromPlug.length
          ? attachedFromPlug
          : undefined;
    st.updateCard(cardId, {
      question: q,
      answer: "",
      status: "thinking",
      thinkingLabel: "Thinking",
      responseType: "text",
      artifactPayload: undefined,
      pendingEmittedArtifacts: undefined,
      attachedImages: options?.pendingImages,
      images: undefined,
      outputArtifactId: undefined,
      outputArtifactVersionId: undefined,
      attachedArtifacts,
      attachedAssets: options?.attachedAssets,
      attachedGroups: options?.attachedGroups?.length
        ? options.attachedGroups
        : card.attachedGroups,
      pendingFiles: options?.pendingFiles,
      quotedSelection: undefined,
      answerExplains: undefined,
      ...turnMetricsOnSubmit(),
    });
  },

  submitFocusMessage: (question, options) => {
    const q = question.trim();
    if (!q) return null;
    get().markPublishedCanvasForked();
    const state = get();
    if (state.canvasReadOnly) return null;
    const draft = state.focusDraftChat;
    const activeThreadId = state.activeThreadId;

    if (draft || !activeThreadId || !state.threads[activeThreadId]) {
      const ref = draft?.artifactRef ?? null;
      const position = computeFocusRootCardPosition(state);
      const cardId = ref
        ? state.createRootCardWithAttachment(position, ref)
        : state.createRootCard(position);
      if (!cardId) return null;
      if (ref) {
        const node = findCanvasNodeByArtifactId(
          get().canvasArtifactNodes,
          ref.artifactId,
        );
        if (node) {
          get().addArtifactPlugConnection({
            artifactNodeId: node.id,
            cardId,
            fromSide: "right",
            toSide: "left",
          });
        }
      }
      get().submitCardQuestion(cardId, q, options);
      const threadId = get().cards[cardId]?.threadId ?? null;
      set({
        focusDraftChat: null,
        ...(threadId ? { activeThreadId: threadId } : {}),
      });
      return cardId;
    }

    const tailId = getThreadTailCardId(
      {
        cards: state.cards,
        connections: state.connections,
        cardOrder: state.cardOrder,
        threads: {},
        threadOrder: [],
      },
      activeThreadId,
    );
    if (!tailId) return null;
    const tail = state.cards[tailId];
    if (!tail) return null;
    if (tail.status === "empty") {
      get().submitCardQuestion(tailId, q, options);
      return tailId;
    }
    if (tail.status !== "done") return null;
    return get().createFollowUp(tailId, q, options);
  },

  viewport: { x: 0, y: 0, scale: 1 },
  viewportSettledScale: 1,
  cards: {},
  cardOrder: [],
  connections: [],
  threads: {},
  threadOrder: [],
  threadGists: {},
  setThreadGist: (threadId, gist) =>
    set((state) => ({
      threadGists: { ...state.threadGists, [threadId]: gist },
    })),
  pendingMcpApprovals: [],
  addMcpApproval: (approval) =>
    set((state) => ({
      pendingMcpApprovals: [
        ...state.pendingMcpApprovals.filter(
          (a) => a.requestId !== approval.requestId,
        ),
        approval,
      ],
    })),
  resolveMcpApproval: (requestId) =>
    set((state) => ({
      pendingMcpApprovals: state.pendingMcpApprovals.filter(
        (a) => a.requestId !== requestId,
      ),
    })),
  clearMcpApprovalsForCard: (cardId) =>
    set((state) => ({
      pendingMcpApprovals: state.pendingMcpApprovals.filter(
        (a) => a.cardId !== cardId,
      ),
    })),
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
  canvasStrokes: {},
  canvasStrokeOrder: [],
  pencilToolActive: false,
  pencilColor: "#F0F0F0",
  activeCanvasStrokeId: null,
  setPencilToolActive: (active) =>
    set({
      pencilToolActive: active,
      activeCanvasStrokeId: null,
    }),
  setPencilColor: (color) => set({ pencilColor: color }),
  beginCanvasStroke: (point) => {
    get().recordUndo();
    const id = newCanvasStrokeId();
    const stroke: CanvasStroke = {
      id,
      points: [{ ...point }],
      color: get().pencilColor,
      width: PENCIL_STROKE_WIDTH,
    };
    set((state) => ({
      canvasStrokes: { ...state.canvasStrokes, [id]: stroke },
      canvasStrokeOrder: [...state.canvasStrokeOrder, id],
      activeCanvasStrokeId: id,
    }));
    return id;
  },
  appendCanvasStrokePoint: (strokeId, point) =>
    set((state) => {
      const stroke = state.canvasStrokes[strokeId];
      if (!stroke) return state;
      const last = stroke.points[stroke.points.length - 1];
      if (last && last.x === point.x && last.y === point.y) return state;
      return {
        canvasStrokes: {
          ...state.canvasStrokes,
          [strokeId]: {
            ...stroke,
            points: [...stroke.points, { ...point }],
          },
        },
      };
    }),
  finishCanvasStroke: (strokeId) =>
    set((state) => {
      if (state.activeCanvasStrokeId !== strokeId) return state;
      const stroke = state.canvasStrokes[strokeId];
      if (!stroke || stroke.points.length < 2) {
        const { [strokeId]: _removed, ...rest } = state.canvasStrokes;
        return {
          canvasStrokes: rest,
          canvasStrokeOrder: state.canvasStrokeOrder.filter((id) => id !== strokeId),
          activeCanvasStrokeId: null,
        };
      }
      return { activeCanvasStrokeId: null };
    }),
  connectorStyle: "orthogonal",
  canvasBackgroundStyle: "grid",
  canvasBackgroundImageId: DEFAULT_CANVAS_BACKGROUND_IMAGE_ID,
  canvasTheme: "dark",
  canvasArtifactStyle: DEFAULT_ARTIFACT_STYLE_ID,
  soundEnabled: true,
  soundVolume: 0.7,
  canvasPreviewBodyFontId: DEFAULT_BODY_FONT_ID,
  canvasPreviewDisplayFontId: "denton",
  globalOrigin: null,
  undoPast: [],

  spawnMeta: null,
  setSpawnMeta: (meta) => set({ spawnMeta: meta }),
  clearSpawnMeta: () => set({ spawnMeta: null }),
  clearRecentConnection: () => set({ recentConnectionId: null }),
  recentConnectionId: null,
  clearRecentArtifactPlug: () => set({ recentArtifactPlugId: null }),
  recentArtifactPlugId: null,

  canvasLoadReveal: null,
  startCanvasLoadReveal: () =>
    set((state) => {
      if (!state.canvasLoadReveal || state.canvasLoadReveal.phase !== "pending") {
        return state;
      }
      return {
        canvasLoadReveal: {
          ...state.canvasLoadReveal,
          phase: "running",
          startedAt: Date.now(),
        },
      };
    }),
  clearCanvasLoadReveal: () => set({ canvasLoadReveal: null }),

  plugDrag: null,
  plugComposerAttachments: {},
  plugComposerAssetAttachments: {},
  plugComposerSkillAttachments: {},
  plugComposerGroupAttachments: {},
  composerDraftsByCardId: {},

  setComposerDraft: (cardId, draft) =>
    set((state) => ({
      composerDraftsByCardId: {
        ...state.composerDraftsByCardId,
        [cardId]: draft,
      },
    })),

  clearComposerDraft: (cardId) =>
    set((state) => {
      if (!(cardId in state.composerDraftsByCardId)) return state;
      const next = { ...state.composerDraftsByCardId };
      delete next[cardId];
      return { composerDraftsByCardId: next };
    }),
  artifactPlugConnections: [],
  skillPlugConnections: [],
  groupPlugConnections: [],

  selectedFamilyRootIds: [],
  canvasSelection: [],
  collapsedBranchThreadIds: [],
  collapsedCardIds: [],
  chatsGloballyHidden: false,
  groups: {},
  activeGroupId: null,

  setSelectedFamilyRootIds: (rootThreadIds) =>
    set({ selectedFamilyRootIds: rootThreadIds }),

  toggleBranchThreadCollapsed: (branchThreadId) =>
    set((state) => {
      const wasCollapsed =
        state.collapsedBranchThreadIds.includes(branchThreadId);
      if (wasCollapsed) {
        touchThreadInactivity(branchThreadId);
      }
      return {
        collapsedBranchThreadIds: wasCollapsed
          ? state.collapsedBranchThreadIds.filter((id) => id !== branchThreadId)
          : [...state.collapsedBranchThreadIds, branchThreadId],
      };
    }),

  toggleCardCollapsed: (cardId) =>
    set((state) => {
      const wasCollapsed = state.collapsedCardIds.includes(cardId);
      const card = state.cards[cardId];
      if (wasCollapsed && card?.threadId) {
        touchThreadInactivity(card.threadId);
      }
      return {
        collapsedCardIds: wasCollapsed
          ? state.collapsedCardIds.filter((id) => id !== cardId)
          : [...state.collapsedCardIds, cardId],
      };
    }),

  toggleChatsGloballyHidden: () =>
    set((state) => {
      const next = !state.chatsGloballyHidden;
      if (next) {
        return {
          chatsGloballyHidden: true,
          selectedFamilyRootIds: [],
          activeGroupId: null,
        };
      }
      return { chatsGloballyHidden: false };
    }),

  autoCollapseInactiveThreads: (threadIds) =>
    runSilentAutoCollapse(() => {
      set((state) => {
        const next = new Set(state.collapsedCardIds);
        let changed = false;
        for (const threadId of threadIds) {
          const root = getThreadRootCard(state, threadId);
          if (!root || next.has(root.id)) continue;
          if (
            state.cardOrder.some((id) => {
              const card = state.cards[id];
              return (
                card &&
                card.threadId === threadId &&
                (card.status === "thinking" || card.status === "streaming")
              );
            })
          ) {
            continue;
          }
          if (root.status === "empty" && !root.question.trim()) continue;
          next.add(root.id);
          changed = true;
        }
        if (!changed) return state;
        return { collapsedCardIds: [...next] };
      });
    }),

  clearSelection: () =>
    set({
      selectedFamilyRootIds: [],
      canvasSelection: [],
      selectedCanvasArtifactId: null,
      selectedCanvasAssetId: null,
      selectedCanvasTextLabelId: null,
      selectedCanvasGifId: null,
      selectedCanvas3DId: null,
      selectedCanvasSkillId: null,
      activeGroupId: null,
    }),

  removeSelectedFromCanvas: () =>
    set((state) => {
      if (state.canvasReadOnly) return state;
      const { selectedFamilyRootIds, canvasSelection } = state;
      if (selectedFamilyRootIds.length === 0 && canvasSelection.length === 0) {
        return state;
      }

      const landingId = getLandingCardId(state.cards, state.cardOrder);
      const cardIdsToDelete = new Set<string>();
      for (const rootId of selectedFamilyRootIds) {
        for (const id of getFamilyCardIds(state, rootId)) {
          if (id === landingId) {
            const landing = state.cards[id];
            if (landing?.status === "empty") continue;
          }
          cardIdsToDelete.add(id);
        }
      }

      const removedArtifactNodeIds = new Set<string>();
      const removedAssetNodeIds = new Set<string>();
      const removedGifNodeIds = new Set<string>();
      const removed3DNodeIds = new Set<string>();
      const removedSkillNodeIds = new Set<string>();
      const removedLabelIds = new Set<string>();

      for (const item of canvasSelection) {
        switch (item.kind) {
          case "artifact":
            if (state.canvasArtifactNodes[item.id]) {
              removedArtifactNodeIds.add(item.id);
            }
            break;
          case "asset":
            if (state.canvasAssetNodes[item.id]) {
              removedAssetNodeIds.add(item.id);
            }
            break;
          case "gif":
            if (state.canvasGifNodes[item.id]) {
              removedGifNodeIds.add(item.id);
            }
            break;
          case "3d":
            if (state.canvas3DNodes[item.id]) {
              removed3DNodeIds.add(item.id);
            }
            break;
          case "skill":
            if (state.canvasSkillNodes[item.id]) {
              removedSkillNodeIds.add(item.id);
            }
            break;
          case "label":
            if (state.canvasTextLabels[item.id]) {
              removedLabelIds.add(item.id);
            }
            break;
        }
      }

      const willDeleteCards = cardIdsToDelete.size > 0;
      const willDeleteNodes =
        removedArtifactNodeIds.size > 0 ||
        removedAssetNodeIds.size > 0 ||
        removedGifNodeIds.size > 0 ||
        removed3DNodeIds.size > 0 ||
        removedSkillNodeIds.size > 0 ||
        removedLabelIds.size > 0;

      if (!willDeleteCards && !willDeleteNodes) return state;

      if (willDeleteCards) cancelCardAsks(cardIdsToDelete);

      const undoPast = pushUndoSnapshot(state);

      let nextCards = state.cards;
      let nextCardOrder = state.cardOrder;
      let nextConnections = state.connections;
      let nextThreads = state.threads;
      let nextThreadOrder = state.threadOrder;
      let activeThreadId = state.activeThreadId;
      let openArtifactCardId = state.openArtifactCardId;

      if (willDeleteCards) {
        nextCards = { ...state.cards };
        for (const id of cardIdsToDelete) {
          delete nextCards[id];
        }
        nextConnections = state.connections.filter(
          (c) => !cardIdsToDelete.has(c.from) && !cardIdsToDelete.has(c.to),
        );
        nextCardOrder = state.cardOrder.filter((id) => !cardIdsToDelete.has(id));

        const remainingThreadIds = new Set(
          Object.values(nextCards).map((c) => c.threadId),
        );
        nextThreads = { ...state.threads };
        for (const tid of Object.keys(nextThreads)) {
          if (!remainingThreadIds.has(tid)) delete nextThreads[tid];
        }
        nextThreadOrder = state.threadOrder.filter((tid) =>
          remainingThreadIds.has(tid),
        );

        if (activeThreadId && !remainingThreadIds.has(activeThreadId)) {
          activeThreadId = pickDefaultThreadId({
            cards: nextCards,
            connections: nextConnections,
            cardOrder: nextCardOrder,
            threads: nextThreads,
            threadOrder: nextThreadOrder,
          });
        }

        if (openArtifactCardId && cardIdsToDelete.has(openArtifactCardId)) {
          openArtifactCardId = null;
        }
      }

      let nextArtifactNodes = state.canvasArtifactNodes;
      let nextArtifactOrder = state.canvasArtifactOrder;
      if (removedArtifactNodeIds.size > 0) {
        nextArtifactNodes = { ...state.canvasArtifactNodes };
        for (const id of removedArtifactNodeIds) {
          delete nextArtifactNodes[id];
        }
        nextArtifactOrder = state.canvasArtifactOrder.filter(
          (id) => !removedArtifactNodeIds.has(id),
        );
      }

      let nextAssetNodes = state.canvasAssetNodes;
      let nextAssetOrder = state.canvasAssetOrder;
      if (removedAssetNodeIds.size > 0) {
        nextAssetNodes = { ...state.canvasAssetNodes };
        for (const id of removedAssetNodeIds) {
          delete nextAssetNodes[id];
        }
        nextAssetOrder = state.canvasAssetOrder.filter(
          (id) => !removedAssetNodeIds.has(id),
        );
      }

      let nextGifNodes = state.canvasGifNodes;
      let nextGifOrder = state.canvasGifOrder;
      if (removedGifNodeIds.size > 0) {
        nextGifNodes = { ...state.canvasGifNodes };
        for (const id of removedGifNodeIds) {
          delete nextGifNodes[id];
        }
        nextGifOrder = state.canvasGifOrder.filter(
          (id) => !removedGifNodeIds.has(id),
        );
      }

      let next3DNodes = state.canvas3DNodes;
      let next3DOrder = state.canvas3DOrder;
      if (removed3DNodeIds.size > 0) {
        next3DNodes = { ...state.canvas3DNodes };
        for (const id of removed3DNodeIds) {
          delete next3DNodes[id];
        }
        next3DOrder = state.canvas3DOrder.filter(
          (id) => !removed3DNodeIds.has(id),
        );
      }

      let nextSkillNodes = state.canvasSkillNodes;
      let nextSkillOrder = state.canvasSkillOrder;
      if (removedSkillNodeIds.size > 0) {
        nextSkillNodes = { ...state.canvasSkillNodes };
        for (const id of removedSkillNodeIds) {
          delete nextSkillNodes[id];
        }
        nextSkillOrder = state.canvasSkillOrder.filter(
          (id) => !removedSkillNodeIds.has(id),
        );
      }

      let nextLabels = state.canvasTextLabels;
      let nextLabelOrder = state.canvasTextLabelOrder;
      if (removedLabelIds.size > 0) {
        nextLabels = { ...state.canvasTextLabels };
        for (const id of removedLabelIds) {
          delete nextLabels[id];
        }
        nextLabelOrder = state.canvasTextLabelOrder.filter(
          (id) => !removedLabelIds.has(id),
        );
      }

      const deletedFamilyRoots = new Set(
        selectedFamilyRootIds.filter((rootId) =>
          getFamilyCardIds(state, rootId).some((id) => cardIdsToDelete.has(id)),
        ),
      );

      const removedItemsByKind: Record<string, Set<string>> = {
        artifact: removedArtifactNodeIds,
        asset: removedAssetNodeIds,
        gif: removedGifNodeIds,
        "3d": removed3DNodeIds,
        label: removedLabelIds,
      };
      const itemRemoved = (item: CanvasSelectionItem) =>
        removedItemsByKind[item.kind]?.has(item.id) ?? false;

      let nextGroups = state.groups;
      let activeGroupId = state.activeGroupId;
      let openGroupArtifactId = state.openGroupArtifactId;
      {
        nextGroups = { ...state.groups };
        let groupsChanged = false;
        for (const [gid, group] of Object.entries(nextGroups)) {
          const remaining = group.familyRootThreadIds.filter(
            (id) => !deletedFamilyRoots.has(id),
          );
          const items = group.items ?? [];
          const remainingItems = items.filter((item) => !itemRemoved(item));
          const rootsChanged =
            remaining.length !== group.familyRootThreadIds.length;
          const itemsChanged = remainingItems.length !== items.length;
          if (!rootsChanged && !itemsChanged) continue;
          groupsChanged = true;
          if (remaining.length === 0 && remainingItems.length === 0) {
            delete nextGroups[gid];
            if (activeGroupId === gid) activeGroupId = null;
            if (openGroupArtifactId === gid) openGroupArtifactId = null;
          } else {
            nextGroups[gid] = {
              ...group,
              familyRootThreadIds: remaining,
              items: remainingItems,
            };
          }
        }
        if (!groupsChanged) nextGroups = state.groups;
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
        canvasArtifactNodes: nextArtifactNodes,
        canvasArtifactOrder: nextArtifactOrder,
        canvasAssetNodes: nextAssetNodes,
        canvasAssetOrder: nextAssetOrder,
        canvasGifNodes: nextGifNodes,
        canvasGifOrder: nextGifOrder,
        canvas3DNodes: next3DNodes,
        canvas3DOrder: next3DOrder,
        canvasSkillNodes: nextSkillNodes,
        canvasSkillOrder: nextSkillOrder,
        canvasTextLabels: nextLabels,
        canvasTextLabelOrder: nextLabelOrder,
        groups: nextGroups,
        activeGroupId,
        openGroupArtifactId,
        artifactPlugConnections: state.artifactPlugConnections.filter(
          (c) =>
            !cardIdsToDelete.has(c.cardId) &&
            !removedArtifactNodeIds.has(c.artifactNodeId),
        ),
        skillPlugConnections: state.skillPlugConnections.filter(
          (c) =>
            !cardIdsToDelete.has(c.cardId) &&
            !removedSkillNodeIds.has(c.skillNodeId),
        ),
        groupPlugConnections: state.groupPlugConnections.filter(
          (c) => !cardIdsToDelete.has(c.cardId) && nextGroups[c.groupId],
        ),
        ...unifiedSelectionPatch({ familyRootIds: [], items: [] }),
        collaborationHasEdits: true,
      };
    }),

  setCanvasSelection: (selection) => set(unifiedSelectionPatch(selection)),

  addCanvasSelection: (selection) =>
    set((state) =>
      unifiedSelectionPatch(
        mergeCanvasSelections(
          {
            familyRootIds: state.selectedFamilyRootIds,
            items: state.canvasSelection,
          },
          selection,
        ),
      ),
    ),

  toggleCanvasSelectionItem: (item) =>
    set((state) => {
      const selected = isCanvasItemSelected(
        state.canvasSelection,
        item.kind,
        item.id,
      );
      const items = selected
        ? state.canvasSelection.filter(
            (i) => !(i.kind === item.kind && i.id === item.id),
          )
        : [...state.canvasSelection, item];
      return unifiedSelectionPatch({
        familyRootIds: state.selectedFamilyRootIds,
        items,
      });
    }),

  moveSelectedCanvasItems: (dx, dy) =>
    set((state) => {
      if (dx === 0 && dy === 0) return state;
      const deltas: SelectionUnitDelta[] = [
        ...state.selectedFamilyRootIds.map((id) => ({
          kind: "family" as const,
          id,
          dx,
          dy,
        })),
        ...state.canvasSelection.map((item) => ({
          kind: item.kind,
          id: item.id,
          dx,
          dy,
        })),
      ];
      if (deltas.length === 0) return state;
      return {
        ...applySelectionUnitDeltas(state, deltas),
        collaborationHasEdits: true,
      };
    }),

  alignSelectedCanvasItems: (mode) => {
    const state = get();
    const units = getSelectionUnits(state, {
      familyRootIds: state.selectedFamilyRootIds,
      items: state.canvasSelection,
    });
    const deltas = computeAlignDeltas(units, mode);
    if (deltas.length === 0) return;
    get().recordUndo();
    set((s) => ({
      ...applySelectionUnitDeltas(s, deltas),
      collaborationHasEdits: true,
    }));
  },

  arrangeSelectedCanvasItems: (mode) => {
    const state = get();
    const units = getSelectionUnits(state, {
      familyRootIds: state.selectedFamilyRootIds,
      items: state.canvasSelection,
    });
    const deltas = computeArrangeDeltas(units, mode);
    if (deltas.length === 0) return;
    get().recordUndo();
    set((s) => ({
      ...applySelectionUnitDeltas(s, deltas),
      collaborationHasEdits: true,
    }));
  },

  duplicateCanvasTextLabel: (nodeId) => {
    const label = get().canvasTextLabels[nodeId];
    if (!label) return null;
    const id = newCanvasTextLabelId();
    set((state) => ({
      canvasTextLabels: {
        ...state.canvasTextLabels,
        [id]: { ...label, id, position: { ...label.position } },
      },
      canvasTextLabelOrder: [...state.canvasTextLabelOrder, id],
      ...unifiedSelectionPatch({
        familyRootIds: [],
        items: [{ kind: "label", id }],
      }),
      collaborationHasEdits: true,
    }));
    return id;
  },

  duplicateCanvasAssetNode: (nodeId) => {
    const node = get().canvasAssetNodes[nodeId];
    if (!node) return null;
    const id = newCanvasAssetNodeId();
    set((state) => ({
      canvasAssetNodes: {
        ...state.canvasAssetNodes,
        [id]: {
          ...node,
          id,
          position: { ...node.position },
          ...(node.size ? { size: { ...node.size } } : {}),
        },
      },
      canvasAssetOrder: [...state.canvasAssetOrder, id],
      ...unifiedSelectionPatch({
        familyRootIds: [],
        items: [{ kind: "asset", id }],
      }),
      collaborationHasEdits: true,
    }));
    return id;
  },

  duplicateCanvasGifNode: (nodeId) => {
    const node = get().canvasGifNodes[nodeId];
    if (!node) return null;
    const id = newCanvasGifNodeId();
    set((state) => ({
      canvasGifNodes: {
        ...state.canvasGifNodes,
        [id]: {
          ...node,
          id,
          position: { ...node.position },
          ...(node.size ? { size: { ...node.size } } : {}),
        },
      },
      canvasGifOrder: [...state.canvasGifOrder, id],
      ...unifiedSelectionPatch({
        familyRootIds: [],
        items: [{ kind: "gif", id }],
      }),
      collaborationHasEdits: true,
    }));
    return id;
  },

  duplicateCanvas3DNode: (nodeId) => {
    const node = get().canvas3DNodes[nodeId];
    if (!node) return null;
    const id = newCanvas3DNodeId();
    set((state) => ({
      canvas3DNodes: {
        ...state.canvas3DNodes,
        [id]: {
          ...node,
          id,
          position: { ...node.position },
          ...(node.size ? { size: { ...node.size } } : {}),
        },
      },
      canvas3DOrder: [...state.canvas3DOrder, id],
      ...unifiedSelectionPatch({
        familyRootIds: [],
        items: [{ kind: "3d", id }],
      }),
      collaborationHasEdits: true,
    }));
    return id;
  },

  duplicateCanvasArtifactNode: (nodeId) => {
    const state = get();
    const node = state.canvasArtifactNodes[nodeId];
    if (!node) return null;

    const art = node.artifactId
      ? state.sessionArtifacts[node.artifactId]
      : undefined;
    if (!art && !node.permissionPreview && !node.generatingPreview) {
      return null;
    }

    let clonedArtifact = art;
    let displayedVersionId = node.versionId;

    if (art) {
      const cloned = cloneSessionArtifactDeep(art);
      clonedArtifact = cloned.artifact;
      displayedVersionId =
        cloned.versionIdMap.get(node.versionId) ??
        cloned.artifact.latestVersionId;
    } else if (node.permissionPreview) {
      const id = newCanvasArtifactNodeId();
      set((s) => ({
        canvasArtifactNodes: {
          ...s.canvasArtifactNodes,
          [id]: {
            id,
            artifactId: "",
            versionId: "",
            sourceCardId: CANVAS_PASTE_SOURCE_CARD_ID,
            position: { ...node.position },
            ...(node.size ? { size: { ...node.size } } : {}),
            ...(node.userSetSize ? { userSetSize: node.userSetSize } : {}),
            permissionPreview: structuredClone(node.permissionPreview),
          },
        },
        canvasArtifactOrder: [...s.canvasArtifactOrder, id],
        ...unifiedSelectionPatch({
          familyRootIds: [],
          items: [{ kind: "artifact", id }],
        }),
        collaborationHasEdits: true,
      }));
      return id;
    } else if (node.generatingPreview) {
      const id = newCanvasArtifactNodeId();
      set((s) => ({
        canvasArtifactNodes: {
          ...s.canvasArtifactNodes,
          [id]: {
            id,
            artifactId: "",
            versionId: "",
            sourceCardId: CANVAS_PASTE_SOURCE_CARD_ID,
            position: { ...node.position },
            ...(node.size ? { size: { ...node.size } } : {}),
            ...(node.userSetSize ? { userSetSize: node.userSetSize } : {}),
            generatingPreview: structuredClone(node.generatingPreview),
          },
        },
        canvasArtifactOrder: [...s.canvasArtifactOrder, id],
        ...unifiedSelectionPatch({
          familyRootIds: [],
          items: [{ kind: "artifact", id }],
        }),
        collaborationHasEdits: true,
      }));
      return id;
    }

    if (!clonedArtifact) return null;

    const id = newCanvasArtifactNodeId();

    set((s) => ({
      sessionArtifacts: {
        ...s.sessionArtifacts,
        [clonedArtifact!.id]: clonedArtifact!,
      },
      canvasArtifactNodes: {
        ...s.canvasArtifactNodes,
        [id]: {
          id,
          artifactId: clonedArtifact!.id,
          versionId: displayedVersionId,
          sourceCardId: CANVAS_PASTE_SOURCE_CARD_ID,
          position: { ...node.position },
          ...(node.size ? { size: { ...node.size } } : {}),
          ...(node.userSetSize ? { userSetSize: node.userSetSize } : {}),
        },
      },
      canvasArtifactOrder: [...s.canvasArtifactOrder, id],
      ...unifiedSelectionPatch({
        familyRootIds: [],
        items: [{ kind: "artifact", id }],
      }),
      collaborationHasEdits: true,
    }));
    return id;
  },

  duplicateCanvasSkillNode: (nodeId) => {
    const node = get().canvasSkillNodes[nodeId];
    if (!node) return null;
    const id = newCanvasSkillNodeId();
    set((state) => ({
      canvasSkillNodes: {
        ...state.canvasSkillNodes,
        [id]: {
          ...node,
          id,
          position: { ...node.position },
          ...(node.size ? { size: { ...node.size } } : {}),
        },
      },
      canvasSkillOrder: [...state.canvasSkillOrder, id],
      ...unifiedSelectionPatch({
        familyRootIds: [],
        items: [{ kind: "skill", id }],
      }),
      collaborationHasEdits: true,
    }));
    return id;
  },

  canCopyCanvasSelection: () => canCopyCanvasSelection(get()),

  copySelectedCanvasItems: async () => {
    const payload = buildCanvasClipboardPayload(get());
    if (!payload) return false;
    const ok = await writeCanvasClipboard(payload);
    if (ok) {
      showAppToast(copySuccessMessage(payload));
    } else {
      showAppErrorToast("Copy failed");
    }
    return ok;
  },

  pasteCanvasClipboardAt: (world, payload, options) => {
    if (!payload || payload.items.length === 0) return false;
    if (get().canvasReadOnly) return false;

    get().recordUndo();

    const pastedItems: CanvasSelectionItem[] = [];

    set((state) => {
      let nextSessionArtifacts = { ...state.sessionArtifacts };
      let nextCanvasArtifactNodes = { ...state.canvasArtifactNodes };
      let nextCanvasArtifactOrder = [...state.canvasArtifactOrder];
      let nextCanvasSkills = { ...state.canvasSkills };
      let nextCanvasSkillNodes = { ...state.canvasSkillNodes };
      let nextCanvasSkillOrder = [...state.canvasSkillOrder];

      payload.items.forEach((item, index) => {
        const position = computePastePosition(
          payload.anchor,
          item.container.position,
          world,
          index,
        );

        if (item.kind === "artifact") {
          const hasPreviewOnly =
            item.container.permissionPreview || item.container.generatingPreview;
          const nodeId = newCanvasArtifactNodeId();

          if (!hasPreviewOnly) {
            const { artifact, versionIdMap } = cloneSessionArtifactDeep(
              item.sessionArtifact,
            );
            const displayedVersionId =
              versionIdMap.get(item.displayedVersionId) ??
              artifact.latestVersionId;

            nextSessionArtifacts = {
              ...nextSessionArtifacts,
              [artifact.id]: artifact,
            };
            nextCanvasArtifactNodes = {
              ...nextCanvasArtifactNodes,
              [nodeId]: {
                id: nodeId,
                artifactId: artifact.id,
                versionId: displayedVersionId,
                sourceCardId: CANVAS_PASTE_SOURCE_CARD_ID,
                position,
                ...(item.container.size
                  ? { size: { ...item.container.size } }
                  : {}),
                ...(item.container.userSetSize
                  ? { userSetSize: item.container.userSetSize }
                  : {}),
              },
            };
          } else {
            nextCanvasArtifactNodes = {
              ...nextCanvasArtifactNodes,
              [nodeId]: {
                id: nodeId,
                artifactId: "",
                versionId: "",
                sourceCardId: CANVAS_PASTE_SOURCE_CARD_ID,
                position,
                ...(item.container.size
                  ? { size: { ...item.container.size } }
                  : {}),
                ...(item.container.userSetSize
                  ? { userSetSize: item.container.userSetSize }
                  : {}),
                ...(item.container.permissionPreview
                  ? {
                      permissionPreview: structuredClone(
                        item.container.permissionPreview,
                      ),
                    }
                  : {}),
                ...(item.container.generatingPreview
                  ? {
                      generatingPreview: structuredClone(
                        item.container.generatingPreview,
                      ),
                    }
                  : {}),
              },
            };
          }
          nextCanvasArtifactOrder = [...nextCanvasArtifactOrder, nodeId];
          pastedItems.push({ kind: "artifact", id: nodeId });
          return;
        }

        if (item.kind === "skill") {
          let skillId = item.skill.id;
          if (!nextCanvasSkills[skillId]) {
            skillId = newCanvasSkillId();
            nextCanvasSkills = {
              ...nextCanvasSkills,
              [skillId]: {
                ...item.skill,
                id: skillId,
                canvasId: options?.canvasId ?? item.skill.canvasId,
                createdAt: Date.now(),
              },
            };
          }

          const nodeId = newCanvasSkillNodeId();
          nextCanvasSkillNodes = {
            ...nextCanvasSkillNodes,
            [nodeId]: {
              id: nodeId,
              skillId,
              position,
              ...(item.container.size
                ? { size: { ...item.container.size } }
                : {}),
            },
          };
          nextCanvasSkillOrder = [...nextCanvasSkillOrder, nodeId];
          pastedItems.push({ kind: "skill", id: nodeId });
        }
      });

      if (pastedItems.length === 0) return state;

      return {
        sessionArtifacts: nextSessionArtifacts,
        canvasArtifactNodes: nextCanvasArtifactNodes,
        canvasArtifactOrder: nextCanvasArtifactOrder,
        canvasSkills: nextCanvasSkills,
        canvasSkillNodes: nextCanvasSkillNodes,
        canvasSkillOrder: nextCanvasSkillOrder,
        ...unifiedSelectionPatch({
          familyRootIds: [],
          items: pastedItems,
        }),
        collaborationHasEdits: true,
      };
    });

    return pastedItems.length > 0;
  },

  createGroupFromSelection: (label) => {
    const safeLabel =
      typeof label === "string" && label.trim().length > 0
        ? label.trim()
        : undefined;
    let groupId: string | null = null;
    set((state) => {
      const items = state.canvasSelection.filter(isGroupableItem);
      if (state.selectedFamilyRootIds.length === 0 && items.length === 0) {
        return state;
      }
      const id = newGroupId();
      groupId = id;
      const groupCount = Object.keys(state.groups).length;
      const group: BranchGroup = {
        id,
        label: safeLabel ?? `Group ${groupCount + 1}`,
        familyRootThreadIds: [...state.selectedFamilyRootIds],
        items,
        summaryMarkdown: null,
      };
      return {
        groups: { ...state.groups, [id]: group },
        activeGroupId: id,
        ...unifiedSelectionPatch({ familyRootIds: [], items: [] }),
        collaborationHasEdits: true,
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
        groupPlugConnections: state.groupPlugConnections.filter(
          (c) => c.groupId !== groupId,
        ),
        collaborationHasEdits: true,
      };
    }),

  setActiveGroupId: (groupId) => set({ activeGroupId: groupId }),

  renameGroup: (groupId, label) =>
    set((state) => {
      const group = state.groups[groupId];
      const trimmed = label.trim();
      if (!group || !trimmed || trimmed === group.label) return state;
      return {
        groups: {
          ...state.groups,
          [groupId]: { ...group, label: trimmed },
        },
        collaborationHasEdits: true,
      };
    }),

  moveGroupBy: (groupId, dx, dy) =>
    set((state) => {
      if (dx === 0 && dy === 0) return state;
      const group = state.groups[groupId];
      if (!group) return state;
      const deltas: SelectionUnitDelta[] = [
        ...group.familyRootThreadIds.map((id) => ({
          kind: "family" as const,
          id,
          dx,
          dy,
        })),
        ...(group.items ?? []).map((item) => ({
          kind: item.kind,
          id: item.id,
          dx,
          dy,
        })),
      ];
      const cardIds = group.cardIds ?? [];
      if (deltas.length === 0 && cardIds.length === 0) return state;
      const patch = applySelectionUnitDeltas(state, deltas);
      // Individually named cards move alongside the unit deltas, so a chapter
      // group still drags as one rigid piece.
      if (cardIds.length > 0) {
        const cards = { ...(patch.cards ?? state.cards) };
        for (const id of cardIds) {
          const card = cards[id];
          if (!card) continue;
          cards[id] = {
            ...card,
            position: { x: card.position.x + dx, y: card.position.y + dy },
          };
        }
        patch.cards = cards;
      }
      return { ...patch, collaborationHasEdits: true };
    }),

  recordUndo: () =>
    set((state) => {
      // Catch-all: drag, delete, group, text edit — anything undoable — also
      // means the visitor has started making this canvas their own.
      const publishedOrigin =
        state.publishedOrigin && !state.publishedOrigin.forked
          ? { ...state.publishedOrigin, forked: true }
          : state.publishedOrigin;
      const snap = graphSnapshotFromState(state);
      const next = [...state.undoPast, snap];
      if (next.length > MAX_UNDO_STACK) next.shift();
      return { undoPast: next, publishedOrigin };
    }),

  undo: () =>
    set((state) => {
      if (state.undoPast.length === 0) return state;
      const snap = state.undoPast[state.undoPast.length - 1];
      return {
        ...snap,
        // Snapshots predate the unified selection; drop it rather than risk
        // referencing nodes that the restore removed.
        canvasSelection: [],
        selectedFamilyRootIds: [],
        undoPast: state.undoPast.slice(0, -1),
      };
    }),

  setConnectorStyle: (style) => set({ connectorStyle: style }),

  setCanvasBackgroundStyle: (style) =>
    set((state) => ({
      canvasBackgroundStyle: style,
      canvasBackgroundImageId:
        style === "static-image"
          ? normalizeCanvasBackgroundImageId(state.canvasBackgroundImageId)
          : state.canvasBackgroundImageId,
      collaborationHasEdits: true,
    })),

  setCanvasBackgroundImageId: (id) =>
    set({
      canvasBackgroundImageId: normalizeCanvasBackgroundImageId(id),
      collaborationHasEdits: true,
    }),

  cycleCanvasBackgroundImage: (delta) =>
    set((state) => ({
      canvasBackgroundStyle: "static-image",
      canvasBackgroundImageId: cycleCanvasBackgroundImageId(
        state.canvasBackgroundImageId,
        delta,
      ),
      collaborationHasEdits: true,
    })),

  setCanvasTheme: (theme) =>
    set((state) => ({
      canvasTheme: theme,
      canvasBackgroundStyle: resolveBackgroundForTheme(
        state.canvasBackgroundStyle,
        theme,
      ),
      collaborationHasEdits: true,
    })),

  setCanvasArtifactStyle: (styleId) =>
    set({
      canvasArtifactStyle: getArtifactStylePack(styleId).id,
      collaborationHasEdits: true,
    }),

  setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),

  setSoundVolume: (volume) =>
    set({ soundVolume: Math.max(0, Math.min(1, volume)) }),

  setCanvasPreviewBodyFontId: (id) => set({ canvasPreviewBodyFontId: id }),
  setCanvasPreviewDisplayFontId: (id) => set({ canvasPreviewDisplayFontId: id }),

  relayoutCanvasFromDom: () =>
    set((state) => {
      if (state.cardOrder.length === 0) return state;
      const tuning = TUNING;
      let cards = syncCardWidthsToTuning(
        state.cards,
        tuning.cardWidth,
        tuning.emptyCardHeight,
      );
      cards = syncAllCardDomSizes(cards, tuning.cardWidth);
      cards = applyTuningLayoutRepair(
        cards,
        state.connections,
        state.cardOrder,
        tuning,
        DEFAULT_CANVAS_TUNING.repairLateralBandsOnTune,
      );
      return { cards };
    }),

  relayoutFollowUpChainFromParent: (parentId) =>
    set((state) => {
      if (!state.cards[parentId]) return state;
      return { cards: relayoutFollowUpChainFromDom(state, parentId) };
    }),

  snapFollowUpChildToParent: (parentId) =>
    set((state) => {
      const parent = state.cards[parentId];
      if (!parent) return state;
      const childId = getFollowUpChild(parentId, layoutStateFrom(state));
      if (!childId) return state;
      const child = state.cards[childId];
      if (!child) return state;
      const pos = computeFollowUpPositionFromDom(parentId, parent, TUNING);
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

  setViewport: (next) =>
    set((state) => {
      const viewport = { ...state.viewport, ...next };
      if (next.scale != null && next.scale !== state.viewport.scale) {
        scheduleViewportSettledScale(viewport.scale);
      }
      return { viewport };
    }),

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
      scheduleViewportSettledScale(nextScale);
      return { viewport: { x: nx, y: ny, scale: nextScale } };
    }),

  updateCard: (id, patch) =>
    set((state) => {
      const existing = state.cards[id];
      if (!existing) return state;
      let nextPatch = patch;
      if (
        patch.position &&
        isOriginCardPinned(pickCanvasLandingInput(state), id, state.globalOrigin)
      ) {
        nextPatch = {
          ...patch,
          position: {
            x: state.globalOrigin!.x,
            y: state.globalOrigin!.y,
          },
        };
      }
      return {
        cards: { ...state.cards, [id]: { ...existing, ...nextPatch } },
      };
    }),

  /**
   * Updates measured size. On height change, shifts only bottom-attached
   * follow-ups by dy (default). Lateral branches and unrelated cards stay fixed.
   * Full chain relayout runs on first measure only, or when the dev toggle
   * "Full chain relayout on resize" is enabled (useDeltaShiftOnResize false).
   */
  setCardSize: (id, size) =>
    set((state) => {
      const existing = state.cards[id];
      if (!existing) return state;
      const tuning = TUNING;
      const normalized = { w: tuning.cardWidth, h: size.h };
      const prev = existing.size;

      // Never shrink cards while a response is loading — height is grow-only until done.
      if (
        isCardPending(existing.status) &&
        prev?.h != null &&
        normalized.h < prev.h
      ) {
        return state;
      }

      if (prev && prev.w === normalized.w && prev.h === normalized.h) {
        return state;
      }

      const cardsWithSize = {
        ...state.cards,
        [id]: { ...existing, size: normalized },
      };

      return {
        cards: relayoutCardsAfterSizeChange(
          state,
          cardsWithSize,
          id,
          prev,
          normalized,
        ),
      };
    }),

  setCanvasArtifactSize: (nodeId, size, options) =>
    set((state) => {
      const node = state.canvasArtifactNodes[nodeId];
      if (!node) return state;
      const prev = node.size;
      const userSetSize = options?.userSet ? true : node.userSetSize;
      if (
        prev &&
        prev.w === size.w &&
        prev.h === size.h &&
        userSetSize === node.userSetSize
      ) {
        return state;
      }
      return {
        canvasArtifactNodes: {
          ...state.canvasArtifactNodes,
          [nodeId]: { ...node, size, userSetSize },
        },
      };
    }),

  moveSubtree: (rootId, dx, dy) =>
    set((state) => {
      if (dx === 0 && dy === 0) return state;
      if (!state.cards[rootId]) return state;
      if (
        isOriginCardPinned(
          pickCanvasLandingInput(state),
          rootId,
          state.globalOrigin,
        )
      ) {
        return state;
      }

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
    get().markPublishedCanvasForked();
    const tuning = TUNING;
    let cardId = "";
    set((state) => {
      const undoPast = pushUndoSnapshot(state);
      const isSeed = state.cardOrder.length === 0;
      const seed = createLandingSeedCard(tuning, state.threadOrder.length);
      cardId = seed.cardId;
      const placedCard = isSeed ? seed.card : { ...seed.card, position };
      return {
        undoPast,
        threads: { ...state.threads, [seed.threadId]: seed.thread },
        threadOrder: [...state.threadOrder, seed.threadId],
        cards: { ...state.cards, [seed.cardId]: placedCard },
        cardOrder: [...state.cardOrder, seed.cardId],
        globalOrigin: isSeed
          ? {
              cardId: seed.cardId,
              x: CANVAS_ORIGIN.x,
              y: CANVAS_ORIGIN.y,
            }
          : state.globalOrigin,
      };
    });
    get().setSpawnMeta({
      targetId: cardId,
      targetKind: "card",
      kind: "drop",
      createdAt: Date.now(),
    });
    return cardId;
  },

  createArtifactVersion: (artifactId, payload, cardId) => {
    let result = { artifactId: "", versionId: "" };
    set((state) => {
      const createdByUserId =
        state.collaborationActorUserId ??
        state.cards[cardId]?.contributorIds?.[0];
      const normalized = normalizePayloadForRegistry(payload);
      const newKind = payloadToArtifactKind(normalized);
      if (artifactId && state.sessionArtifacts[artifactId]) {
        const existing = state.sessionArtifacts[artifactId];
        if (existing.kind === newKind) {
          const { artifact, versionId } = appendArtifactVersion(
            existing,
            payload,
            cardId,
            createdByUserId,
          );
          result = { artifactId: artifact.id, versionId };
          return {
            collaborationHasEdits: createdByUserId
              ? true
              : state.collaborationHasEdits,
            sessionArtifacts: {
              ...state.sessionArtifacts,
              [artifact.id]: artifact,
            },
          };
        }
      }
      const created = createSessionArtifactFromPayload(
        payload,
        cardId,
        createdByUserId,
      );
      result = {
        artifactId: created.id,
        versionId: created.latestVersionId,
      };
      return {
        collaborationHasEdits: createdByUserId
          ? true
          : state.collaborationHasEdits,
        sessionArtifacts: {
          ...state.sessionArtifacts,
          [created.id]: created,
        },
      };
    });
    return result;
  },

  createBlankTodoArtifact: (title) => {
    const payload = createEmptyTodoPayload(title);
    get().recordUndo();
    const { artifactId, versionId } = get().createArtifactVersion(
      null,
      payload,
      MANUAL_TODO_SOURCE_CARD_ID,
    );
    get().spawnCanvasArtifact(artifactId, versionId, {
      focus: true,
      payload,
      size: getDefaultArtifactSize("todo", payload),
    });
    return { artifactId, versionId };
  },

  createManualArtifact: (artifactType, opts) => {
    get().recordUndo();
    const payload = createManualArtifactPayload(artifactType);
    const sourceCardId = manualArtifactSourceCardId(artifactType);
    const { artifactId, versionId } = get().createArtifactVersion(
      null,
      payload,
      sourceCardId,
    );
    const kind = payloadToArtifactKind(payload);
    const size = getDefaultArtifactSize(kind, payload);
    get().spawnCanvasArtifact(artifactId, versionId, {
      position: opts?.position,
      focus: true,
      payload,
      size,
    });
    return { artifactId, versionId };
  },

  createVideoArtifactFromUrl: (url, opts) => {
    const title = opts?.title?.trim() || "YouTube video";
    const payload: ArtifactPayload = {
      type: "images",
      title,
      data: {
        items: [
          {
            kind: "youtube",
            url,
            thumb: opts?.thumb,
            title,
          },
        ],
      },
    };
    if (opts?.recordUndo !== false) {
      get().recordUndo();
    }
    const { artifactId, versionId } = get().createArtifactVersion(
      null,
      payload,
      MANUAL_VIDEO_SOURCE_CARD_ID,
    );
    if (opts?.position) {
      get().spawnCanvasArtifact(artifactId, versionId, {
        position: opts.position,
        focus: true,
      });
    } else {
      get().spawnCanvasArtifact(artifactId, versionId, { focus: true });
    }
    return { artifactId, versionId };
  },

  createAudioArtifactFromFile: async (file, opts) => {
    const uploadResult = await uploadAudioFile(file, opts?.uploadContext ?? null);
    if ("error" in uploadResult) {
      return { error: uploadResult.error };
    }

    let durationMs: number;
    let peaks: number[];
    try {
      const waveform = await extractWaveformPeaks(file);
      durationMs = waveform.durationMs;
      peaks = waveform.peaks;
    } catch {
      return {
        error: {
          fileName: file.name,
          code: "audio-decode-failed",
          message: `Could not decode ${file.name}. Try a different audio format.`,
        },
      };
    }

    const payload = createAudioPayload({
      fileName: uploadResult.upload.fileName,
      mimeType: uploadResult.upload.mimeType,
      storagePath: uploadResult.upload.storagePath,
      publicUrl: uploadResult.upload.publicUrl,
      durationMs,
      peaks,
    });

    if (opts?.recordUndo !== false) {
      get().recordUndo();
    }

    const { artifactId, versionId } = get().createArtifactVersion(
      null,
      payload,
      MANUAL_AUDIO_SOURCE_CARD_ID,
    );

    const size = getDefaultAudioArtifactSize(payload);
    const index = opts?.index ?? 0;
    const offset = index * 28;
    const spawnPosition = opts?.position
      ? {
          x: opts.position.x - size.w / 2 + offset,
          y: opts.position.y - size.h / 2 + offset,
        }
      : undefined;

    get().spawnCanvasArtifact(artifactId, versionId, {
      position: spawnPosition,
      focus: index === 0,
      payload,
      size,
    });
    return { artifactId, versionId };
  },

  createThreeDArtifactFromFile: async (file, opts) => {
    const format = threeDFormatFromFile(file);
    if (!format) {
      return {
        error: {
          fileName: file.name,
          code: "unsupported-type",
          message: `${file.name} is not a supported 3D model (GLB or GLTF).`,
        },
      };
    }

    const uploadResult = await uploadThreeDModelFile(
      file,
      opts?.uploadContext ?? null,
    );
    if ("error" in uploadResult) {
      return { error: uploadResult.error };
    }

    const payload = createThreeDPayload({
      fileName: uploadResult.upload.fileName,
      modelUrl: uploadResult.upload.publicUrl,
      format,
    });

    if (opts?.recordUndo !== false) {
      get().recordUndo();
    }

    const { artifactId, versionId } = get().createArtifactVersion(
      null,
      payload,
      MANUAL_3D_SOURCE_CARD_ID,
    );

    const size = getDefaultArtifactSize("3d", payload);
    const index = opts?.index ?? 0;
    const offset = index * 28;
    const spawnPosition = opts?.position
      ? {
          x: opts.position.x - size.w / 2 + offset,
          y: opts.position.y - size.h / 2 + offset,
        }
      : undefined;

    get().spawnCanvasArtifact(artifactId, versionId, {
      position: spawnPosition,
      focus: index === 0,
      payload,
      size,
    });
    return { artifactId, versionId };
  },

  createWebsiteArtifactFromUrl: (url, position, opts) => {
    const domainLabel = domainDisplayLabel(url);
    const payload = createWebsitePayload(url, domainLabel);
    if (opts?.recordUndo !== false) {
      get().recordUndo();
    }
    const { artifactId, versionId } = get().createArtifactVersion(
      null,
      payload,
      MANUAL_WEBSITE_SOURCE_CARD_ID,
    );
    if (position) {
      get().spawnCanvasArtifact(artifactId, versionId, {
        position,
        focus: true,
      });
    } else {
      get().spawnCanvasArtifact(artifactId, versionId, { focus: true });
    }
    return { artifactId, versionId };
  },

  createRepoArtifactFromUrl: (url, opts) => {
    const payload = createRepoPayload(url);
    if (!payload) {
      throw new Error("Invalid GitHub repository URL");
    }
    if (opts?.recordUndo !== false) {
      get().recordUndo();
    }
    const { artifactId, versionId } = get().createArtifactVersion(
      null,
      payload,
      MANUAL_REPO_SOURCE_CARD_ID,
    );
    if (opts?.position) {
      get().spawnCanvasArtifact(artifactId, versionId, {
        position: opts.position,
        focus: true,
      });
    } else {
      get().spawnCanvasArtifact(artifactId, versionId, { focus: true });
    }
    return { artifactId, versionId };
  },

  createEmbedArtifactFromUrl: (url, opts) => {
    const provider = matchEmbedProviderId(url) ?? "reddit";
    const payload = createEmbedPayload(url, provider);
    if (opts?.recordUndo !== false) {
      get().recordUndo();
    }
    const { artifactId, versionId } = get().createArtifactVersion(
      null,
      payload,
      MANUAL_EMBED_SOURCE_CARD_ID,
    );
    const spawnOpts = {
      position: opts?.position,
      focus: true,
      size: opts?.size ?? {
        w: EMBED_LOADING_WIDTH,
        h: EMBED_LOADING_HEIGHT,
      },
    };
    get().spawnCanvasArtifact(artifactId, versionId, spawnOpts);
    return { artifactId, versionId };
  },

  createGoogleWorkspaceArtifactFromUrl: (url, opts) => {
    const parsed = parseGoogleDriveUrl(url);
    const payload = createGoogleWorkspacePayload(parsed);
    if (!payload) {
      throw new Error("Invalid Google Drive URL");
    }
    if (opts?.recordUndo !== false) {
      get().recordUndo();
    }
    const { artifactId, versionId } = get().createArtifactVersion(
      null,
      payload,
      MANUAL_GOOGLE_DOC_SOURCE_CARD_ID,
    );
    if (opts?.position) {
      get().spawnCanvasArtifact(artifactId, versionId, {
        position: opts.position,
        focus: true,
      });
    } else {
      get().spawnCanvasArtifact(artifactId, versionId, { focus: true });
    }
    return { artifactId, versionId };
  },

  patchRepoArtifactExplorer: (artifactId, patch) => {
    set((state) => {
      const art = state.sessionArtifacts[artifactId];
      if (!art || art.kind !== "repo") return state;
      const latest = getLatestVersion(art);
      if (!latest || latest.payload.type !== "repo") return state;

      const explorer = mergeRepoExplorer(latest.payload.data.explorer, patch);
      const displayTitle =
        explorer.overview.data?.name ??
        explorer.overview.data?.fullName ??
        latest.payload.data.displayTitle;
      const updatedPayload: ArtifactPayload = {
        ...latest.payload,
        title: displayTitle,
        data: {
          ...latest.payload.data,
          displayTitle,
          explorer,
        },
      };
      const versions = art.versions.map((v) =>
        v.id === latest.id ? { ...v, payload: updatedPayload } : v,
      );
      return {
        sessionArtifacts: {
          ...state.sessionArtifacts,
          [artifactId]: {
            ...art,
            title: displayTitle,
            versions,
          },
        },
      };
    });
  },

  patchWebsiteArtifactTitle: (artifactId, patch) => {
    set((state) => {
      const art = state.sessionArtifacts[artifactId];
      if (!art || art.kind !== "website") return state;
      const latest = getLatestVersion(art);
      if (!latest || latest.payload.type !== "website") return state;
      const title = patch.title.trim();
      if (!title) return state;
      const updatedPayload: ArtifactPayload = {
        ...latest.payload,
        title,
        data: {
          ...latest.payload.data,
          title,
          faviconUrl: patch.faviconUrl ?? latest.payload.data.faviconUrl,
          previewImageUrl:
            patch.previewImageUrl ?? latest.payload.data.previewImageUrl,
          previewAssetId:
            patch.previewAssetId ?? latest.payload.data.previewAssetId,
          embeddable: patch.embeddable ?? latest.payload.data.embeddable,
        },
      };
      const versions = art.versions.map((v) =>
        v.id === latest.id ? { ...v, payload: updatedPayload } : v,
      );
      return {
        sessionArtifacts: {
          ...state.sessionArtifacts,
          [artifactId]: {
            ...art,
            title,
            versions,
          },
        },
      };
    });
  },

  patchGoogleWorkspaceArtifact: (artifactId, patch) => {
    set((state) => {
      const art = state.sessionArtifacts[artifactId];
      if (!art || art.kind !== "google-doc") return state;
      const latest = getLatestVersion(art);
      if (!latest || latest.payload.type !== "google-doc") return state;

      const patchTitle = patch.title;
      const dataPatch = { ...patch };
      delete dataPatch.title;
      const resolvedTitle =
        typeof patchTitle === "string" && patchTitle.trim()
          ? patchTitle.trim()
          : latest.payload.data.title;

      const updatedPayload: ArtifactPayload = {
        ...latest.payload,
        title: resolvedTitle,
        data: {
          ...latest.payload.data,
          ...dataPatch,
          title: resolvedTitle,
        },
      };
      const versions = art.versions.map((v) =>
        v.id === latest.id ? { ...v, payload: updatedPayload } : v,
      );
      return {
        sessionArtifacts: {
          ...state.sessionArtifacts,
          [artifactId]: {
            ...art,
            title: resolvedTitle,
            versions,
          },
        },
      };
    });
  },

  patchYoutubeArtifactTitle: (artifactId, versionId, patch) => {
    set((state) => {
      const art = state.sessionArtifacts[artifactId];
      if (!art || art.kind !== "images") return state;
      const version = art.versions.find((v) => v.id === versionId);
      if (!version || version.payload.type !== "images") return state;
      const title = patch.title.trim();
      if (!title) return state;
      const items = version.payload.data.items.map((item, i) =>
        i === 0 && item.kind === "youtube"
          ? {
              ...item,
              title,
              thumb: patch.thumb ?? item.thumb,
            }
          : item,
      );
      const updatedPayload: ArtifactPayload = {
        ...version.payload,
        title,
        data: { ...version.payload.data, items },
      };
      const versions = art.versions.map((v) =>
        v.id === versionId ? { ...v, payload: updatedPayload } : v,
      );
      return {
        sessionArtifacts: {
          ...state.sessionArtifacts,
          [artifactId]: {
            ...art,
            title,
            versions,
          },
        },
      };
    });
  },

  renameSessionArtifactTitle: (artifactId, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    set((state) => {
      const art = state.sessionArtifacts[artifactId];
      if (!art) return state;
      const versions = art.versions.map((v) => ({
        ...v,
        payload: patchArtifactPayloadTitle(v.payload, trimmed),
      }));
      return {
        collaborationHasEdits: true,
        sessionArtifacts: {
          ...state.sessionArtifacts,
          [artifactId]: {
            ...art,
            title: trimmed,
            versions,
          },
        },
      };
    });
  },

  patchEmbedArtifact: (artifactId, versionId, patch) => {
    set((state) => {
      const art = state.sessionArtifacts[artifactId];
      if (!art || art.kind !== "embed") return state;
      const version = art.versions.find((v) => v.id === versionId);
      if (!version || version.payload.type !== "embed") return state;

      const prev = version.payload.data;
      const isLoading = patch.status === "loading";
      const title =
        !isLoading && "title" in patch && patch.title.trim()
          ? patch.title.trim()
          : prev.title;
      const updatedPayload: ArtifactPayload = {
        ...version.payload,
        title,
        data: isLoading
          ? { ...prev, status: "loading" }
          : {
              url: patch.url,
              provider: patch.provider,
              title,
              domainLabel: patch.fallback?.domainLabel ?? prev.domainLabel,
              embedWidth: patch.embedWidth,
              embedHeight: patch.embedHeight,
              iframeSrc: patch.iframeSrc,
              embedHtml: patch.embedHtml,
              status: patch.status,
              fallback: patch.fallback ?? prev.fallback,
            },
      };
      const versions = art.versions.map((v) =>
        v.id === versionId ? { ...v, payload: updatedPayload } : v,
      );

      let canvasArtifactNodes = state.canvasArtifactNodes;
      if (!isLoading && patch.status === "ready") {
        const node = findCanvasNodeByArtifactId(
          state.canvasArtifactNodes,
          artifactId,
        );
        if (node) {
          const nextSize = clampArtifactSize(patch.embedWidth, patch.embedHeight);
          canvasArtifactNodes = {
            ...state.canvasArtifactNodes,
            [node.id]: {
              ...node,
              size: nextSize,
            },
          };
        }
      }

      return {
        sessionArtifacts: {
          ...state.sessionArtifacts,
          [artifactId]: {
            ...art,
            title,
            versions,
          },
        },
        canvasArtifactNodes,
      };
    });
  },

  ensurePendingTableArtifact: (cardId) => {
    const card = get().cards[cardId];
    if (!card) return null;

    const state = get();
    const targetId =
      resolveEditingArtifactId(
        card,
        state.cards,
        state.connections,
        state.cardOrder,
      ) ?? card.outputArtifactId;

    if (targetId) {
      const art = state.sessionArtifacts[targetId];
      if (art?.kind === "table") {
        const latest = getLatestVersion(art);
        if (latest) {
          get().spawnCanvasArtifact(targetId, latest.id);
          get().removeGeneratingArtifactPreview(cardId);
          return { artifactId: targetId, versionId: latest.id };
        }
      }
    }

    const existingPreview = findGeneratingPreviewNode(
      state.canvasArtifactNodes,
      cardId,
      "table",
    );
    if (existingPreview) {
      set({ selectedCanvasArtifactId: existingPreview.id });
      return null;
    }

    const editingArt = targetId ? state.sessionArtifacts[targetId] : undefined;
    const title =
      editingArt?.title || card.question.slice(0, 48) || "Table";
    get().spawnGeneratingArtifactPreview(cardId, "table", title);
    return null;
  },

  ensurePendingCustomArtifact: (cardId) => {
    const card = get().cards[cardId];
    if (!card) return null;

    const state = get();
    const targetId =
      resolveEditingArtifactId(
        card,
        state.cards,
        state.connections,
        state.cardOrder,
      ) ?? card.outputArtifactId;

    if (targetId) {
      const art = state.sessionArtifacts[targetId];
      if (art?.kind === "custom") {
        const latest = getLatestVersion(art);
        if (latest) {
          get().spawnCanvasArtifact(targetId, latest.id);
          get().removeGeneratingArtifactPreview(cardId);
          return { artifactId: targetId, versionId: latest.id };
        }
      }
    }

    const existingPreview = findGeneratingPreviewNode(
      state.canvasArtifactNodes,
      cardId,
      "custom",
    );
    if (existingPreview) {
      set({ selectedCanvasArtifactId: existingPreview.id });
      return null;
    }

    const editingArt = targetId ? state.sessionArtifacts[targetId] : undefined;
    const title =
      editingArt?.title || card.question.slice(0, 48) || "Custom component";
    get().spawnGeneratingArtifactPreview(cardId, "custom", title);
    return null;
  },

  spawnGeneratingArtifactPreview: (cardId, kind, title) => {
    const card = get().cards[cardId];
    if (!card) return null;

    const position = computeArtifactSpawnPosition(
      cardId,
      get().canvasArtifactNodes,
      get().cards,
      { sessionArtifacts: get().sessionArtifacts },
    );

    const nodeId = newCanvasArtifactNodeId();
    const node: CanvasArtifactNode = {
      id: nodeId,
      artifactId: "",
      versionId: "",
      sourceCardId: cardId,
      position,
      size: getDefaultArtifactSize(kind),
      generatingPreview: { kind, title },
    };

    set((state) => ({
      canvasArtifactNodes: { ...state.canvasArtifactNodes, [nodeId]: node },
      canvasArtifactOrder: [...state.canvasArtifactOrder, nodeId],
      selectedCanvasArtifactId: nodeId,
    }));

    get().setSpawnMeta({
      targetId: nodeId,
      targetKind: "artifact",
      kind: "popUp",
      createdAt: Date.now(),
    });
    return nodeId;
  },

  removeGeneratingArtifactPreview: (cardId) => {
    const preview = findGeneratingPreviewNode(get().canvasArtifactNodes, cardId);
    if (!preview) return;
    get().removeCanvasArtifact(preview.id);
  },

  saveTodoArtifactVersion: (artifactId, payload) => {
    const { versionId } = get().createArtifactVersion(
      artifactId,
      payload,
      MANUAL_TODO_SOURCE_CARD_ID,
    );
    get().setArtifactPanelVersion(versionId);
    const node = findCanvasNodeByArtifactId(
      get().canvasArtifactNodes,
      artifactId,
    );
    if (node) {
      get().setCanvasArtifactVersion(node.id, versionId);
    }
    return { versionId };
  },

  saveMapArtifactVersion: (artifactId, payload) => {
    const { versionId } = get().createArtifactVersion(
      artifactId,
      payload,
      MANUAL_MAP_SOURCE_CARD_ID,
    );
    get().setArtifactPanelVersion(versionId);
    const node = findCanvasNodeByArtifactId(
      get().canvasArtifactNodes,
      artifactId,
    );
    if (node) {
      get().setCanvasArtifactVersion(node.id, versionId);
    }
    return { versionId };
  },

  saveCalendarArtifactVersion: (artifactId, payload) => {
    const { versionId } = get().createArtifactVersion(
      artifactId,
      payload,
      MANUAL_CALENDAR_SOURCE_CARD_ID,
    );
    get().setArtifactPanelVersion(versionId);
    const node = findCanvasNodeByArtifactId(
      get().canvasArtifactNodes,
      artifactId,
    );
    if (node) {
      get().setCanvasArtifactVersion(node.id, versionId);
    }
    return { versionId };
  },

  saveTimelineArtifactVersion: (artifactId, payload) => {
    const { versionId } = get().createArtifactVersion(
      artifactId,
      payload,
      MANUAL_TIMELINE_SOURCE_CARD_ID,
    );
    get().setArtifactPanelVersion(versionId);
    const node = findCanvasNodeByArtifactId(
      get().canvasArtifactNodes,
      artifactId,
    );
    if (node) {
      get().setCanvasArtifactVersion(node.id, versionId);
    }
    return { versionId };
  },

  saveStreetViewArtifactVersion: (artifactId, payload) => {
    const { versionId } = get().createArtifactVersion(
      artifactId,
      payload,
      MANUAL_MAP_SOURCE_CARD_ID,
    );
    get().setArtifactPanelVersion(versionId);
    const node = findCanvasNodeByArtifactId(
      get().canvasArtifactNodes,
      artifactId,
    );
    if (node) {
      get().setCanvasArtifactVersion(node.id, versionId);
    }
    return { versionId };
  },

  saveStickyNoteArtifactVersion: (artifactId, payload) => {
    const { versionId } = get().createArtifactVersion(
      artifactId,
      payload,
      MANUAL_STICKY_NOTE_SOURCE_CARD_ID,
    );
    get().setArtifactPanelVersion(versionId);
    const node = findCanvasNodeByArtifactId(
      get().canvasArtifactNodes,
      artifactId,
    );
    if (node) {
      get().setCanvasArtifactVersion(node.id, versionId);
    }
    return { versionId };
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
    let isNewNode = false;
    let sourceCardId = "";
    let notifyReady = false;
    set((state) => {
      const art = state.sessionArtifacts[artifactId];
      if (!art) return state;
      const ver = getVersionById(art, versionId) ?? getLatestVersion(art);
      if (!ver) return state;
      sourceCardId = ver.sourceCardId;

      const existing = findCanvasNodeByArtifactId(
        state.canvasArtifactNodes,
        artifactId,
      );
      if (existing) {
        nodeId = existing.id;
        isNewNode = false;
        const nextNode: CanvasArtifactNode = {
          ...existing,
          versionId: ver.id,
          sourceCardId: ver.sourceCardId,
          generatingPreview: undefined,
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

      const generatingNode = findGeneratingPreviewNode(
        state.canvasArtifactNodes,
        ver.sourceCardId,
        art.kind,
      );
      if (generatingNode) {
        nodeId = generatingNode.id;
        isNewNode = false;
        notifyReady = isCardSourcedArtifactBuild(
          ver.sourceCardId,
          state.cards,
        );
        const nextNode: CanvasArtifactNode = {
          ...generatingNode,
          artifactId,
          versionId: ver.id,
          generatingPreview: undefined,
          ...(opts?.position ? { position: opts.position } : {}),
        };
        return {
          canvasArtifactNodes: {
            ...state.canvasArtifactNodes,
            [generatingNode.id]: nextNode,
          },
          selectedCanvasArtifactId: opts?.focus
            ? generatingNode.id
            : state.selectedCanvasArtifactId,
        };
      }

      const id = newCanvasArtifactNodeId();
      nodeId = id;
      isNewNode = true;
      notifyReady = isCardSourcedArtifactBuild(ver.sourceCardId, state.cards);
      const position =
        opts?.position ??
        computeArtifactSpawnPosition(
          ver.sourceCardId,
          state.canvasArtifactNodes,
          state.cards,
          {
            payload: opts?.payload ?? ver.payload,
            side: opts?.side,
            sessionArtifacts: state.sessionArtifacts,
          },
          TUNING,
        );
      const artifactSize =
        opts?.size ?? getDefaultArtifactSize(art.kind, ver.payload);
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
    if (nodeId && isNewNode) {
      get().setSpawnMeta({
        targetId: nodeId,
        targetKind: "artifact",
        kind: "popUp",
        createdAt: Date.now(),
      });
    }
    if (sourceCardId) {
      get().removeGeneratingArtifactPreview(sourceCardId);
    }
    if (notifyReady && nodeId) {
      pushArtifactReadyUpdate(artifactId, nodeId);
    }
    if (nodeId && opts?.focus) {
      scheduleCanvasArtifactFocus(nodeId);
    }
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
    set(
      unifiedSelectionPatch({
        familyRootIds: [],
        items: nodeId ? [{ kind: "artifact", id: nodeId }] : [],
      }),
    ),

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
        canvasSelection: state.canvasSelection.filter(
          (i) => !(i.kind === "artifact" && i.id === nodeId),
        ),
        artifactPlugConnections: state.artifactPlugConnections.filter(
          (c) => c.artifactNodeId !== nodeId,
        ),
        ...pruneGroupItemsForRemovedNodes(state, "artifact", [nodeId]),
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
      ...unifiedSelectionPatch({
        familyRootIds: [],
        items: [{ kind: "label", id }],
      }),
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

  setCanvasTextLabelFontSize: (nodeId, fontSize) =>
    set((state) => {
      const label = state.canvasTextLabels[nodeId];
      if (!label) return state;
      const next = clampTextLabelFontSize(fontSize);
      if (label.fontSize === next) return state;
      return {
        canvasTextLabels: {
          ...state.canvasTextLabels,
          [nodeId]: { ...label, fontSize: next },
        },
      };
    }),

  setCanvasTextLabelWidth: (nodeId, width) =>
    set((state) => {
      const label = state.canvasTextLabels[nodeId];
      if (!label) return state;
      const next = clampTextLabelWidth(width);
      if (label.width === next) return state;
      return {
        canvasTextLabels: {
          ...state.canvasTextLabels,
          [nodeId]: { ...label, width: next },
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
        canvasSelection: state.canvasSelection.filter(
          (i) => !(i.kind === "label" && i.id === nodeId),
        ),
        ...pruneGroupItemsForRemovedNodes(state, "label", [nodeId]),
      };
    }),

  selectCanvasTextLabel: (nodeId) =>
    set(
      unifiedSelectionPatch({
        familyRootIds: [],
        items: nodeId ? [{ kind: "label", id: nodeId }] : [],
      }),
    ),

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
    get().markPublishedCanvasForked();
    let childId: string | null = null;
    let parentThreadId: string | null = null;
    set((state) => {
      const parent = state.cards[parentId];
      if (!parent) return state;
      parentThreadId = parent.threadId;
      const undoPast = pushUndoSnapshot(state);
      const id = newCardId();
      childId = id;
      const tuning = TUNING;
      const pos = computeFollowUpPositionFromDom(parentId, parent, tuning);
      const plugAttached = resolveCardAttachedArtifactRefs(parentId, {
        cards: state.cards,
        artifactPlugConnections: state.artifactPlugConnections,
        canvasArtifactNodes: state.canvasArtifactNodes,
        plugComposerAttachments: state.plugComposerAttachments,
        sessionArtifacts: state.sessionArtifacts,
      });
      const attachedArtifacts =
        options?.attachedArtifacts?.length
          ? options.attachedArtifacts
          : parent.attachedArtifacts?.length
            ? parent.attachedArtifacts
            : plugAttached.length
              ? plugAttached
              : undefined;
      const inheritedArtifactId =
        attachedArtifacts?.[0]?.artifactId ??
        resolveInheritedArtifactIdForParent(
          parentId,
          state.cards,
          state.connections,
          state.cardOrder,
        );
      const handoffSource = options?.customUiSource;
      // A handoff builds from its own data. Inheriting the parent's artifact
      // would make /api/custom-ui treat it as a surgical EDIT of that artifact.
      const effectiveInheritedArtifactId = handoffSource ? undefined : inheritedArtifactId;
      const effectiveAttachedArtifacts = handoffSource ? undefined : attachedArtifacts;
      const customUiSeed = seedCustomUiTurnState(
        question,
        effectiveInheritedArtifactId,
        effectiveAttachedArtifacts,
        state.sessionArtifacts,
        { force: Boolean(handoffSource) },
      );
      const child: Card = {
        id,
        threadId: parent.threadId,
        question,
        answer: "",
        status: "thinking",
        thinkingLabel: customUiSeed?.thinkingLabel ?? "Thinking",
        sdkBuildStages: customUiSeed?.sdkBuildStages,
        askStartedAt: Date.now(),
        turnUsage: { inputTokens: 0, outputTokens: 0 },
        position: pos,
        size: { w: tuning.cardWidth, h: tuning.fallbackCardHeight },
        parentCardId: parentId,
        parentConversationId: parentId,
        attachedArtifacts: effectiveAttachedArtifacts,
        attachedAssets: options?.attachedAssets,
        attachedSkills: options?.attachedSkills,
        inheritedArtifactId: effectiveInheritedArtifactId,
        attachedImages: options?.pendingImages,
        pendingFiles: options?.pendingFiles,
        customUiSource: handoffSource,
        suppressArtifactInheritance: handoffSource ? true : undefined,
      };
      const connId = `conn_${parentId}_${id}`;
      const conn: Connection = {
        id: connId,
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
        recentConnectionId: connId,
      };
    });
    if (childId) {
      get().setSpawnMeta({
        targetId: childId,
        targetKind: "card",
        kind: "popUp",
        createdAt: Date.now(),
      });
    }
    if (parentThreadId) touchThreadInactivity(parentThreadId);
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

  setCardComposerAssetAttachment: (cardId, ref) =>
    set((state) => ({
      plugComposerAssetAttachments: {
        ...state.plugComposerAssetAttachments,
        [cardId]: ref,
      },
    })),

  setCardComposerSkillAttachment: (cardId, ref) =>
    set((state) => ({
      plugComposerSkillAttachments: {
        ...state.plugComposerSkillAttachments,
        [cardId]: ref,
      },
    })),

  setCardComposerGroupAttachment: (cardId, ref) =>
    set((state) => ({
      plugComposerGroupAttachments: {
        ...state.plugComposerGroupAttachments,
        [cardId]: ref,
      },
    })),

  addArtifactPlugConnection: (conn) =>
    set((state) => {
      const id = `artplug_${conn.artifactNodeId}_${conn.cardId}`;
      const withoutDup = state.artifactPlugConnections.filter(
        (c) =>
          !(
            c.artifactNodeId === conn.artifactNodeId &&
            c.cardId === conn.cardId
          ),
      );
      return {
        artifactPlugConnections: [
          ...withoutDup,
          { ...conn, id },
        ],
        recentArtifactPlugId: id,
      };
    }),

  addSkillPlugConnection: (conn) =>
    set((state) => {
      const id = `skillplug_${conn.skillNodeId}_${conn.cardId}`;
      const withoutDup = state.skillPlugConnections.filter(
        (c) =>
          !(
            c.skillNodeId === conn.skillNodeId &&
            c.cardId === conn.cardId
          ),
      );
      return {
        skillPlugConnections: [
          ...withoutDup,
          { ...conn, id },
        ],
      };
    }),

  addGroupPlugConnection: (conn) =>
    set((state) => {
      const id = `groupplug_${conn.groupId}_${conn.cardId}`;
      const withoutDup = state.groupPlugConnections.filter(
        (c) => !(c.groupId === conn.groupId && c.cardId === conn.cardId),
      );
      return {
        groupPlugConnections: [...withoutDup, { ...conn, id }],
      };
    }),

  wireArtifactToSourceCard: (artifactNodeId, cardId) => {
    get().addArtifactPlugConnection({
      artifactNodeId,
      cardId,
      fromSide: "left",
      toSide: "right",
    });
  },

  spawnPermissionPreview: (cardId, payload, opts) => {
    const card = get().cards[cardId];
    if (!card) return null;

    const existing = findPermissionPreviewNode(
      get().canvasArtifactNodes,
      cardId,
      payload,
    );
    if (existing) {
      set({ selectedCanvasArtifactId: existing.id });
      return existing.id;
    }

    const kind = payloadToArtifactKind(payload);
    const placeName =
      payload.type === "map" || payload.type === "streetview"
        ? payload.data.place.label ?? payload.data.place.name
        : undefined;
    const copy = opts?.copy ?? getPermissionCopy(kind, placeName);

    const position =
      opts?.position ??
      computeArtifactSpawnPosition(
        cardId,
        get().canvasArtifactNodes,
        get().cards,
        {
          payload,
          side: pickAlternateSpawnSide(
            cardId,
            get().canvasArtifactNodes,
            get().cards,
            TUNING,
          ),
          sessionArtifacts: get().sessionArtifacts,
        },
        TUNING,
      );

    const nodeId = newCanvasArtifactNodeId();
    const node: CanvasArtifactNode = {
      id: nodeId,
      artifactId: "",
      versionId: "",
      sourceCardId: cardId,
      position,
      size: getDefaultArtifactSize(kind, payload),
      permissionPreview: {
        payload,
        copy,
        status: "pending",
        kind,
        title: payload.title,
      },
    };

    set((state) => ({
      canvasArtifactNodes: { ...state.canvasArtifactNodes, [nodeId]: node },
      canvasArtifactOrder: [...state.canvasArtifactOrder, nodeId],
      selectedCanvasArtifactId: nodeId,
    }));

    get().setSpawnMeta({
      targetId: nodeId,
      targetKind: "artifact",
      kind: "popUp",
      createdAt: Date.now(),
    });
    return nodeId;
  },

  approvePermissionPreview: (nodeId) => {
    const node = get().canvasArtifactNodes[nodeId];
    if (!node?.permissionPreview) return;

    const { payload } = node.permissionPreview;
    const cardId = node.sourceCardId;
    const card = get().cards[cardId];
    const state = get();
    const targetId =
      card &&
      resolveArtifactTargetId(
        card,
        payload,
        state.sessionArtifacts,
        state.cards,
        state.connections,
        state.cardOrder,
      );
    const { artifactId, versionId } = get().createArtifactVersion(
      targetId,
      payload,
      cardId,
    );

    set((s) => {
      const currentCard = s.cards[cardId];
      return {
        canvasArtifactNodes: {
          ...s.canvasArtifactNodes,
          [nodeId]: {
            ...node,
            artifactId,
            versionId,
            permissionPreview: undefined,
          },
        },
        ...(currentCard
          ? {
              cards: {
                ...s.cards,
                [cardId]: {
                  ...currentCard,
                  outputArtifactId: artifactId,
                  outputArtifactVersionId: versionId,
                  responseType:
                    payload.type === "video" ? "images" : payload.type,
                },
              },
            }
          : {}),
      };
    });
  },

  declinePermissionPreview: (nodeId) => {
    const node = get().canvasArtifactNodes[nodeId];
    if (!node?.permissionPreview || node.isExiting) return;

    set((state) => ({
      canvasArtifactNodes: {
        ...state.canvasArtifactNodes,
        [nodeId]: {
          ...node,
          permissionPreview: {
            ...node.permissionPreview!,
            status: "declining",
          },
          isExiting: true,
        },
      },
    }));

    window.setTimeout(() => {
      get().removeCanvasArtifact(nodeId);
    }, SPAWN_ANIMATION_MS);
  },

  createRootCardWithAttachment: (position, ref) => {
    let cardId = "";
    set((state) => {
      const undoPast = pushUndoSnapshot(state);
      const tuning = TUNING;
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
        size: emptyCardSize(tuning),
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
    get().setSpawnMeta({
      targetId: cardId,
      targetKind: "card",
      kind: "drop",
      createdAt: Date.now(),
    });
    return cardId;
  },

  createRootCardWithAssetAttachment: (position, ref) => {
    let cardId = "";
    set((state) => {
      const undoPast = pushUndoSnapshot(state);
      const tuning = TUNING;
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
        size: emptyCardSize(tuning),
        parentCardId: null,
        parentConversationId: null,
        attachedAssets: [ref],
      };
      return {
        undoPast,
        threads: { ...state.threads, [threadId]: thread },
        threadOrder: [...state.threadOrder, threadId],
        cards: { ...state.cards, [id]: card },
        cardOrder: [...state.cardOrder, id],
        plugComposerAssetAttachments: {
          ...state.plugComposerAssetAttachments,
          [id]: ref,
        },
      };
    });
    get().setSpawnMeta({
      targetId: cardId,
      targetKind: "card",
      kind: "drop",
      createdAt: Date.now(),
    });
    return cardId;
  },

  createRootCardWithSkillAttachment: (position, ref) => {
    let cardId = "";
    set((state) => {
      const undoPast = pushUndoSnapshot(state);
      const tuning = TUNING;
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
        size: emptyCardSize(tuning),
        parentCardId: null,
        parentConversationId: null,
        attachedSkills: [ref],
      };
      return {
        undoPast,
        threads: { ...state.threads, [threadId]: thread },
        threadOrder: [...state.threadOrder, threadId],
        cards: { ...state.cards, [id]: card },
        cardOrder: [...state.cardOrder, id],
        plugComposerSkillAttachments: {
          ...state.plugComposerSkillAttachments,
          [id]: ref,
        },
      };
    });
    get().setSpawnMeta({
      targetId: cardId,
      targetKind: "card",
      kind: "drop",
      createdAt: Date.now(),
    });
    return cardId;
  },

  createRootCardWithGroupAttachment: (position, ref) => {
    let cardId = "";
    set((state) => {
      const undoPast = pushUndoSnapshot(state);
      const tuning = TUNING;
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
        size: emptyCardSize(tuning),
        parentCardId: null,
        parentConversationId: null,
        attachedGroups: [ref],
      };
      return {
        undoPast,
        threads: { ...state.threads, [threadId]: thread },
        threadOrder: [...state.threadOrder, threadId],
        cards: { ...state.cards, [id]: card },
        cardOrder: [...state.cardOrder, id],
        plugComposerGroupAttachments: {
          ...state.plugComposerGroupAttachments,
          [id]: ref,
        },
      };
    });
    get().setSpawnMeta({
      targetId: cardId,
      targetKind: "card",
      kind: "drop",
      createdAt: Date.now(),
    });
    return cardId;
  },

  createBranchAt: (sourceId, side, position, options) => {
    let branchId: string | null = null;
    let sourceThreadId: string | null = null;
    let newBranchThreadId: string | null = null;
    set((state) => {
      const source = state.cards[sourceId];
      if (!source) return state;
      sourceThreadId = source.threadId;
      const undoPast = pushUndoSnapshot(state);

      const newThreadIdStr = newThreadId();
      newBranchThreadId = newThreadIdStr;
      const accent =
        PALETTE[state.threadOrder.length % PALETTE.length];
      const thread: Thread = {
        id: newThreadIdStr,
        accentColour: accent,
      };

      const id = newCardId();
      branchId = id;
      const tuning = TUNING;
      const layout = layoutStateFrom(state);
      const drop = resolveBranchDropPosition(
        position.x,
        position.y,
        side,
        source,
        tuning,
      );
      const card: Card = {
        id,
        threadId: newThreadIdStr,
        question: "",
        answer: "",
        status: "empty",
        position: drop,
        size: emptyCardSize(tuning),
        parentCardId: null,
        parentConversationId: sourceId,
        quotedSelection: options?.quotedSelection,
      };

      const connId = `conn_${sourceId}_${id}`;
      const conn: Connection = {
        id: connId,
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
        recentConnectionId: connId,
      };
    });
    if (branchId) {
      get().setSpawnMeta({
        targetId: branchId,
        targetKind: "card",
        kind: "popUp",
        createdAt: Date.now(),
      });
    }
    if (sourceThreadId) touchThreadInactivity(sourceThreadId);
    if (newBranchThreadId) touchThreadInactivity(newBranchThreadId);
    return branchId;
  },

  createBranch: (sourceId, side, options) => {
    let branchId: string | null = null;
    let sourceThreadId: string | null = null;
    let newBranchThreadId: string | null = null;
    set((state) => {
      const source = state.cards[sourceId];
      if (!source) return state;
      sourceThreadId = source.threadId;
      const undoPast = pushUndoSnapshot(state);

      const existingOnSide = state.connections.filter(
        (c) => c.from === sourceId && c.fromSide === side,
      ).length;

      const slot = existingOnSide; // 0 for the first branch on this side
      const tuning = TUNING;
      const layout = layoutStateFrom(state);
      const x = defaultBranchSlotX(side, source, slot, tuning);
      const y = childBandY(layout, sourceId, source, tuning);

      const newThreadIdStr = newThreadId();
      newBranchThreadId = newThreadIdStr;
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
        size: emptyCardSize(tuning),
        parentCardId: null,
        parentConversationId: sourceId,
        quotedSelection: options?.quotedSelection,
      };

      const connId = `conn_${sourceId}_${id}`;
      const conn: Connection = {
        id: connId,
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
        recentConnectionId: connId,
      };
    });
    if (branchId) {
      get().setSpawnMeta({
        targetId: branchId,
        targetKind: "card",
        kind: "popUp",
        createdAt: Date.now(),
      });
    }
    if (sourceThreadId) touchThreadInactivity(sourceThreadId);
    if (newBranchThreadId) touchThreadInactivity(newBranchThreadId);
    return branchId;
  },

  createBranchFromSelection: (sourceId, selectedText, side = "right") => {
    return get().createBranch(sourceId, side, {
      quotedSelection: selectedText,
    });
  },

  addAnswerExplain: (cardId, explain) =>
    set((state) => {
      const card = state.cards[cardId];
      if (!card) return state;
      const existing = card.answerExplains ?? [];
      return {
        cards: {
          ...state.cards,
          [cardId]: {
            ...card,
            answerExplains: [...existing, explain],
          },
        },
      };
    }),

  updateAnswerExplain: (cardId, explainId, patch) =>
    set((state) => {
      const card = state.cards[cardId];
      if (!card?.answerExplains?.length) return state;
      const next = card.answerExplains.map((e) =>
        e.id === explainId ? { ...e, ...patch } : e,
      );
      return {
        cards: {
          ...state.cards,
          [cardId]: { ...card, answerExplains: next },
        },
      };
    }),

  deleteFromCard: (cardId) =>
    set((state) => {
      if (!state.cards[cardId]) return state;

      const toDelete = collectSubtreeIds(state.connections, cardId);
      cancelCardAsks(toDelete);

      const undoPast = pushUndoSnapshot(state);
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
        artifactPlugConnections: state.artifactPlugConnections.filter(
          (c) => !toDelete.has(c.cardId),
        ),
        skillPlugConnections: state.skillPlugConnections.filter(
          (c) => !toDelete.has(c.cardId),
        ),
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

  collaborationHasEdits: false,
  collaborationActorUserId: null,
  canvasReadOnly: false,

  setCanvasReadOnly: (readOnly) => set({ canvasReadOnly: readOnly }),

  setCollaborationHasEdits: (value) => set({ collaborationHasEdits: value }),

  setCollaborationActorUserId: (userId) =>
    set({ collaborationActorUserId: userId }),

  appendContributorToCard: (cardId, userId) =>
    set((state) => {
      const card = state.cards[cardId];
      if (!card) return state;
      const existing = card.contributorIds ?? [];
      if (existing.includes(userId)) return state;
      return {
        collaborationHasEdits: true,
        cards: {
          ...state.cards,
          [cardId]: {
            ...card,
            contributorIds: [...existing, userId],
          },
        },
      };
    }),

  appendContributorToArtifact: (artifactId, userId) =>
    set((state) => {
      const artifact = state.sessionArtifacts[artifactId];
      if (!artifact) return state;
      const latest = getLatestVersion(artifact);
      if (!latest || latest.createdByUserId) return state;
      const versions = artifact.versions.map((v) =>
        v.id === latest.id ? { ...v, createdByUserId: userId } : v,
      );
      return {
        collaborationHasEdits: true,
        sessionArtifacts: {
          ...state.sessionArtifacts,
          [artifactId]: { ...artifact, versions },
        },
      };
    }),

  stampContributorOnActiveEdits: (userId) => {
    const state = get();
    state.setCollaborationHasEdits(true);
  },

  getCanvasSnapshotSource: (): CanvasSnapshotSource => {
    const state = get();
    return {
      viewport: state.viewport,
      cards: state.cards,
      cardOrder: state.cardOrder,
      connections: state.connections,
      threads: state.threads,
      threadOrder: state.threadOrder,
      threadGists: state.threadGists,
      groups: state.groups,
      connectorStyle: state.connectorStyle,
      canvasBackgroundStyle: state.canvasBackgroundStyle,
      canvasBackgroundImageId: state.canvasBackgroundImageId,
      canvasTheme: state.canvasTheme,
      canvasArtifactStyle: state.canvasArtifactStyle,
      selectedModel: state.selectedModel,
      viewMode: state.viewMode,
      sessionArtifacts: state.sessionArtifacts,
      canvasAssets: state.canvasAssets,
      canvasArtifactNodes: state.canvasArtifactNodes,
      canvasArtifactOrder: state.canvasArtifactOrder,
      canvasAssetNodes: state.canvasAssetNodes,
      canvasAssetOrder: state.canvasAssetOrder,
      canvasSkills: state.canvasSkills,
      canvasSkillNodes: state.canvasSkillNodes,
      canvasSkillOrder: state.canvasSkillOrder,
      canvasTextLabels: state.canvasTextLabels,
      canvasTextLabelOrder: state.canvasTextLabelOrder,
      canvasStrokes: state.canvasStrokes,
      canvasStrokeOrder: state.canvasStrokeOrder,
      canvasGifNodes: state.canvasGifNodes,
      canvasGifOrder: state.canvasGifOrder,
      canvas3DNodes: state.canvas3DNodes,
      canvas3DOrder: state.canvas3DOrder,
      uploadedAttachments: state.uploadedAttachments,
      collaborationHasEdits: state.collaborationHasEdits,
    };
  },

  resetCanvasState: () => {
    flushViewportSettledScale(1);
    set({
      viewport: { x: 0, y: 0, scale: 1 },
      viewportSettledScale: 1,
      cards: {},
      cardOrder: [],
      connections: [],
      threads: {},
      threadOrder: [],
      threadGists: {},
      groups: {},
      sessionArtifacts: {},
      canvasAssets: {},
      canvasArtifactNodes: {},
      canvasArtifactOrder: [],
      canvasAssetNodes: {},
      canvasAssetOrder: [],
      canvasSkills: {},
      canvasSkillNodes: {},
      canvasSkillOrder: [],
      canvasTextLabels: {},
      canvasTextLabelOrder: [],
      canvasStrokes: {},
      canvasStrokeOrder: [],
      pencilToolActive: false,
      pencilColor: "#F0F0F0",
      activeCanvasStrokeId: null,
      canvasGifNodes: {},
      canvasGifOrder: [],
      canvas3DNodes: {},
      canvas3DOrder: [],
      uploadedAttachments: [],
      globalOrigin: null,
      activeThreadId: null,
      openArtifactCardId: null,
      openGroupArtifactId: null,
      openSessionArtifactId: null,
      openSessionArtifactVersionId: null,
      selectedCanvasArtifactId: null,
      selectedCanvasAssetId: null,
      selectedCanvasSkillId: null,
      selectedCanvasTextLabelId: null,
      selectedCanvasGifId: null,
      selectedCanvas3DId: null,
      selectedFamilyRootIds: [],
      canvasSelection: [],
      activeGroupId: null,
      undoPast: [],
      plugDrag: null,
      plugComposerAttachments: {},
      plugComposerAssetAttachments: {},
      plugComposerSkillAttachments: {},
      plugComposerGroupAttachments: {},
      artifactPlugConnections: [],
      skillPlugConnections: [],
      groupPlugConnections: [],
      canvasPlacementRequest: null,
      activeCanvasPlacement: null,
      artifactPlacementRequest: null,
      viewMode: "canvas",
      focusArtifactId: null,
      focusDraftChat: null,
      collaborationHasEdits: false,
      canvasReadOnly: false,
      publishedOrigin: null,
      canvasLoadReveal: null,
    });
  },

  hydrateFromSnapshot: (snapshot, options) => {
    set((state) => {
      const snapshotNorm = normalizeCanvasSnapshot(snapshot);
      const applyViewport = options?.applyViewport !== false;
      const viewport = applyViewport
        ? { ...snapshotNorm.viewport }
        : { ...state.viewport };
      flushViewportSettledScale(viewport.scale);
      const sessionArtifacts = JSON.parse(
        JSON.stringify(snapshotNorm.sessionArtifacts),
      ) as Record<string, SessionArtifact>;
      const normalized = normalizeLoadedCards({ ...snapshotNorm.cards });
      const connections = snapshotNorm.connections.map((c) => ({ ...c }));
      const cardOrder = [...snapshotNorm.cardOrder];
      const defaultTuning = TUNING;
      const repaired = repairLoadedArtifactState(
        normalized,
        sessionArtifacts,
        connections,
        cardOrder,
      );
      // Re-snap vertical chains so any stale gap from older snapshots
      // collapses back to the canonical FOLLOW_UP_GAP. Lateral branches are
      // not touched (absolute-positions policy).
      let cards = repairVerticalChainsOnly(
        repaired.cards,
        connections,
        cardOrder,
        defaultTuning,
      );
      let threads = { ...snapshotNorm.threads };
      let threadOrder = [...snapshotNorm.threadOrder];
      let nextCardOrder = cardOrder;

      if (nextCardOrder.length === 0) {
        const seed = createLandingSeedCard(defaultTuning, threadOrder.length);
        cards = { ...cards, [seed.cardId]: seed.card };
        nextCardOrder = [seed.cardId];
        threads = { ...threads, [seed.threadId]: seed.thread };
        threadOrder = [...threadOrder, seed.threadId];
      }

      const canvasArtifactNodes = normalizeLoadedArtifactNodes(
        { ...snapshotNorm.canvasArtifactNodes },
        repaired.sessionArtifacts,
      );
      const firstCardId = nextCardOrder[0];
      const firstCard = firstCardId ? cards[firstCardId] : undefined;
      const globalOrigin =
        firstCardId && firstCard
          ? {
              cardId: firstCardId,
              x: firstCard.position.x,
              y: firstCard.position.y,
            }
          : null;

      const canvasArtifactOrder = [...(snapshotNorm.canvasArtifactOrder ?? [])];
      let canvasLoadReveal: CanvasLoadReveal | null = null;
      if (options?.canvasReveal) {
        const plan = buildCanvasLoadRevealPlan({
          cards,
          cardOrder: nextCardOrder,
          connections,
          threads,
          threadOrder,
          canvasArtifactNodes,
          canvasArtifactOrder,
        });
        if (plan.unitCount > 0) {
          canvasLoadReveal = {
            phase: "pending",
            delays: plan.delays,
            maxDelayMs: plan.maxDelayMs,
            startedAt: 0,
          };
        }
      }

      const preserveEphemeral = options?.preserveEphemeral === true;

      return {
        viewport,
        viewportSettledScale: viewport.scale,
        cards,
        cardOrder: nextCardOrder,
        connections,
        threads,
        threadOrder,
        threadGists: { ...snapshotNorm.threadGists },
        groups: { ...snapshotNorm.groups },
        connectorStyle: snapshotNorm.connectorStyle,
        canvasBackgroundStyle: snapshotNorm.canvasBackgroundStyle,
        canvasBackgroundImageId: snapshotNorm.canvasBackgroundImageId,
        canvasTheme: snapshotNorm.canvasTheme,
        canvasArtifactStyle: getArtifactStylePack(
          snapshotNorm.canvasArtifactStyle ?? DEFAULT_ARTIFACT_STYLE_ID,
        ).id,
        selectedModel: snapshotNorm.selectedModel,
        viewMode: snapshotNorm.viewMode,
        sessionArtifacts: repaired.sessionArtifacts,
        canvasAssets: { ...snapshotNorm.canvasAssets },
        canvasArtifactNodes,
        canvasArtifactOrder,
        canvasAssetNodes: { ...snapshotNorm.canvasAssetNodes },
        canvasAssetOrder: [...(snapshotNorm.canvasAssetOrder ?? [])],
        canvasSkills: { ...snapshotNorm.canvasSkills },
        canvasSkillNodes: { ...snapshotNorm.canvasSkillNodes },
        canvasSkillOrder: [...(snapshotNorm.canvasSkillOrder ?? [])],
        canvasLoadReveal: preserveEphemeral ? state.canvasLoadReveal : canvasLoadReveal,
        activeThreadId: preserveEphemeral ? state.activeThreadId : (threadOrder[0] ?? null),
        focusArtifactId: preserveEphemeral ? state.focusArtifactId : null,
        focusDraftChat: preserveEphemeral ? state.focusDraftChat : null,
        openArtifactCardId: preserveEphemeral ? state.openArtifactCardId : null,
        openGroupArtifactId: preserveEphemeral ? state.openGroupArtifactId : null,
        openSessionArtifactId: preserveEphemeral ? state.openSessionArtifactId : null,
        openSessionArtifactVersionId: preserveEphemeral
          ? state.openSessionArtifactVersionId
          : null,
        selectedCanvasArtifactId: preserveEphemeral
          ? state.selectedCanvasArtifactId
          : null,
        selectedCanvasAssetId: preserveEphemeral ? state.selectedCanvasAssetId : null,
        canvasTextLabels: { ...snapshotNorm.canvasTextLabels },
        canvasTextLabelOrder: [...(snapshotNorm.canvasTextLabelOrder ?? [])],
        canvasStrokes: preserveEphemeral
          ? {
              ...(snapshotNorm.canvasStrokes ?? {}),
              ...state.canvasStrokes,
            }
          : { ...(snapshotNorm.canvasStrokes ?? {}) },
        canvasStrokeOrder: preserveEphemeral
          ? Array.from(
              new Set([
                ...(snapshotNorm.canvasStrokeOrder ?? []),
                ...state.canvasStrokeOrder,
              ]),
            )
          : [...(snapshotNorm.canvasStrokeOrder ?? [])],
        pencilToolActive: preserveEphemeral ? state.pencilToolActive : false,
        activeCanvasStrokeId: preserveEphemeral ? state.activeCanvasStrokeId : null,
        canvasGifNodes: { ...snapshotNorm.canvasGifNodes },
        canvasGifOrder: [...(snapshotNorm.canvasGifOrder ?? [])],
        canvas3DNodes: { ...snapshotNorm.canvas3DNodes },
        canvas3DOrder: [...(snapshotNorm.canvas3DOrder ?? [])],
        selectedCanvasGifId: preserveEphemeral ? state.selectedCanvasGifId : null,
        selectedCanvas3DId: preserveEphemeral ? state.selectedCanvas3DId : null,
        selectedCanvasSkillId: preserveEphemeral ? state.selectedCanvasSkillId : null,
        selectedCanvasTextLabelId: preserveEphemeral
          ? state.selectedCanvasTextLabelId
          : null,
        selectedFamilyRootIds: preserveEphemeral ? state.selectedFamilyRootIds : [],
        canvasSelection: preserveEphemeral ? state.canvasSelection : [],
        collapsedBranchThreadIds: preserveEphemeral
          ? state.collapsedBranchThreadIds
          : state.collapsedBranchThreadIds,
        collapsedCardIds: preserveEphemeral ? state.collapsedCardIds : state.collapsedCardIds,
        chatsGloballyHidden: false,
        activeGroupId: preserveEphemeral ? state.activeGroupId : null,
        undoPast: preserveEphemeral ? state.undoPast : [],
        globalOrigin,
        uploadedAttachments: JSON.parse(
          JSON.stringify(snapshotNorm.uploadedAttachments),
        ) as UploadedAttachment[],
        plugDrag: preserveEphemeral ? state.plugDrag : null,
        plugComposerAttachments: preserveEphemeral
          ? state.plugComposerAttachments
          : {},
        plugComposerAssetAttachments: preserveEphemeral
          ? state.plugComposerAssetAttachments
          : {},
        plugComposerSkillAttachments: preserveEphemeral
          ? state.plugComposerSkillAttachments
          : {},
        composerDraftsByCardId: preserveEphemeral
          ? state.composerDraftsByCardId
          : {},
        artifactPlugConnections: preserveEphemeral
          ? state.artifactPlugConnections
          : [],
        skillPlugConnections: preserveEphemeral ? state.skillPlugConnections : [],
        canvasPlacementRequest: preserveEphemeral
          ? state.canvasPlacementRequest
          : null,
        activeCanvasPlacement: preserveEphemeral ? state.activeCanvasPlacement : null,
        artifactPlacementRequest: preserveEphemeral
          ? state.artifactPlacementRequest
          : null,
        collaborationHasEdits: snapshotNorm.collaborationHasEdits ?? false,
      };
    });
    resetThreadActivity(get().threadOrder);
  },
}));

function pushUndoSnapshot(state: CanvasState): GraphSnapshot[] {
  const snap = graphSnapshotFromState(state);
  const next = [...state.undoPast, snap];
  if (next.length > MAX_UNDO_STACK) next.shift();
  return next;
}

function pickThreadInactivityState(state: CanvasState): ThreadInactivityState {
  return {
    cards: state.cards,
    cardOrder: state.cardOrder,
    connections: state.connections,
    threads: state.threads,
    threadOrder: state.threadOrder,
    collapsedCardIds: state.collapsedCardIds,
  };
}

function touchThreadInactivity(threadId: string): void {
  touchThreadActivity(threadId, () =>
    pickThreadInactivityState(useCanvasStore.getState()),
  );
}

registerThreadInactivityHandlers({
  readState: () => pickThreadInactivityState(useCanvasStore.getState()),
  applyCollapse: (threadIds) =>
    useCanvasStore.getState().autoCollapseInactiveThreads(threadIds),
});

// Selector helpers.
export const selectAccentForCard = (cardId: string) =>
  (state: CanvasState): string | undefined => {
    const card = state.cards[cardId];
    if (!card) return undefined;
    return state.threads[card.threadId]?.accentColour;
  };
