import type { CanvasStroke } from "@/lib/canvasStroke";
import { repairLoadedArtifactState } from "@/lib/materializeCardArtifact";
import { resolveBackgroundForTheme } from "@/lib/canvasBackgroundTheme";
import { isKnownModel } from "@/lib/models";
import {
  DEFAULT_ARTIFACT_STYLE_ID,
  NEW_CANVAS_ARTIFACT_STYLE_ID,
  getArtifactStylePack,
} from "@/lib/design/style/stylePacks";
import type { ArtifactStyleId } from "@/lib/design/style/types";
import {
  DEFAULT_CANVAS_BACKGROUND_IMAGE_ID,
  normalizeCanvasBackgroundImageId,
} from "@/lib/canvasBackgroundImages";
import type { SessionArtifact } from "@/lib/sessionArtifacts";
import type {
  AnswerExplain,
  AppViewMode,
  BranchGroup,
  CanvasArtifactNode,
  CanvasAsset,
  CanvasAssetNode,
  CanvasGifNode,
  Canvas3DNode,
  CanvasSkill,
  CanvasSkillNode,
  CanvasBackgroundStyle,
  CanvasTheme,
  CanvasTextLabel,
  Card,
  CardStatus,
  ClaudeModel,
  Connection,
  ConnectorStyle,
  Thread,
  ThreadGist,
  UploadedAttachment,
  Viewport,
} from "@/lib/store";

export const CANVAS_SNAPSHOT_VERSION = 1 as const;

export interface CanvasSnapshot {
  version: typeof CANVAS_SNAPSHOT_VERSION;
  viewport: Viewport;
  cards: Record<string, Card>;
  cardOrder: string[];
  connections: Connection[];
  threads: Record<string, Thread>;
  threadOrder: string[];
  threadGists?: Record<string, ThreadGist>;
  groups: Record<string, BranchGroup>;
  connectorStyle: ConnectorStyle;
  canvasBackgroundStyle: CanvasBackgroundStyle;
  canvasBackgroundImageId?: string;
  canvasTheme: CanvasTheme;
  canvasArtifactStyle?: ArtifactStyleId;
  selectedModel: ClaudeModel;
  viewMode: AppViewMode;
  sessionArtifacts: Record<string, SessionArtifact>;
  canvasAssets?: Record<string, CanvasAsset>;
  canvasArtifactNodes?: Record<string, CanvasArtifactNode>;
  canvasArtifactOrder?: string[];
  canvasAssetNodes?: Record<string, CanvasAssetNode>;
  canvasAssetOrder?: string[];
  canvasSkills?: Record<string, CanvasSkill>;
  canvasSkillNodes?: Record<string, CanvasSkillNode>;
  canvasSkillOrder?: string[];
  canvasTextLabels?: Record<string, CanvasTextLabel>;
  canvasTextLabelOrder?: string[];
  canvasStrokes?: Record<string, CanvasStroke>;
  canvasStrokeOrder?: string[];
  canvasGifNodes?: Record<string, CanvasGifNode>;
  canvasGifOrder?: string[];
  canvas3DNodes?: Record<string, Canvas3DNode>;
  canvas3DOrder?: string[];
  uploadedAttachments?: UploadedAttachment[];
  collaborationHasEdits?: boolean;
}

export interface CanvasSnapshotSource {
  viewport: Viewport;
  cards: Record<string, Card>;
  cardOrder: string[];
  connections: Connection[];
  threads: Record<string, Thread>;
  threadOrder: string[];
  threadGists?: Record<string, ThreadGist>;
  groups: Record<string, BranchGroup>;
  connectorStyle: ConnectorStyle;
  canvasBackgroundStyle: CanvasBackgroundStyle;
  canvasBackgroundImageId?: string;
  canvasTheme: CanvasTheme;
  canvasArtifactStyle?: ArtifactStyleId;
  selectedModel: ClaudeModel;
  viewMode: AppViewMode;
  sessionArtifacts: Record<string, SessionArtifact>;
  canvasAssets?: Record<string, CanvasAsset>;
  canvasArtifactNodes: Record<string, CanvasArtifactNode>;
  canvasArtifactOrder: string[];
  canvasAssetNodes?: Record<string, CanvasAssetNode>;
  canvasAssetOrder?: string[];
  canvasSkills?: Record<string, CanvasSkill>;
  canvasSkillNodes?: Record<string, CanvasSkillNode>;
  canvasSkillOrder?: string[];
  canvasTextLabels: Record<string, CanvasTextLabel>;
  canvasTextLabelOrder: string[];
  canvasStrokes?: Record<string, CanvasStroke>;
  canvasStrokeOrder?: string[];
  canvasGifNodes?: Record<string, CanvasGifNode>;
  canvasGifOrder?: string[];
  canvas3DNodes?: Record<string, Canvas3DNode>;
  canvas3DOrder?: string[];
  uploadedAttachments: UploadedAttachment[];
  collaborationHasEdits: boolean;
}

function cardHasPersistableResponse(card: Card): boolean {
  return !!(
    card.answer?.trim() ||
    card.outputArtifactId ||
    card.artifactPayload ||
    (card.pendingEmittedArtifacts?.length ?? 0) > 0 ||
    (card.images?.length ?? 0) > 0
  );
}

function normalizeCardStatus(card: Card): CardStatus {
  if (card.status === "streaming" || card.status === "thinking") {
    return cardHasPersistableResponse(card) ? "done" : "thinking";
  }
  return card.status;
}

function normalizeAnswerExplains(
  explains?: AnswerExplain[],
): AnswerExplain[] | undefined {
  if (!explains?.length) return undefined;
  return explains.map((e) => ({
    ...e,
    status:
      e.status === "loading"
        ? e.explanation.trim()
          ? "done"
          : "error"
        : e.status,
  }));
}

function normalizeCardForPersist(card: Card): Card {
  const normalized: Card = {
    ...card,
    status: normalizeCardStatus(card),
    thinkingLabel: undefined,
    pendingFiles: undefined,
    // Transient turn state, like pendingFiles — not canvas content.
    customUiSource: undefined,
    quotedSelection: undefined,
    answerExplains: normalizeAnswerExplains(card.answerExplains),
  };
  // Artifact body lives in sessionArtifacts once materialized — drop duplicate blob.
  if (normalized.outputArtifactId && normalized.artifactPayload) {
    return { ...normalized, artifactPayload: undefined };
  }
  return normalized;
}

export function buildCanvasSnapshot(source: CanvasSnapshotSource): CanvasSnapshot {
  let sessionArtifacts = JSON.parse(
    JSON.stringify(source.sessionArtifacts),
  ) as Record<string, SessionArtifact>;
  const connections = source.connections.map((c) => ({ ...c }));
  const cardOrder = [...source.cardOrder];
  const repaired = repairLoadedArtifactState(
    source.cards,
    sessionArtifacts,
    connections,
    cardOrder,
  );
  sessionArtifacts = repaired.sessionArtifacts;

  const cards: Record<string, Card> = {};
  for (const [id, card] of Object.entries(repaired.cards)) {
    cards[id] = normalizeCardForPersist(card);
  }

  return {
    version: CANVAS_SNAPSHOT_VERSION,
    viewport: { ...source.viewport },
    cards,
    cardOrder,
    connections,
    threads: { ...source.threads },
    threadOrder: [...source.threadOrder],
    threadGists: normalizeThreadGists(source.threadGists, source.threads),
    groups: { ...source.groups },
    connectorStyle: source.connectorStyle,
    canvasBackgroundStyle: source.canvasBackgroundStyle,
    canvasBackgroundImageId: source.canvasBackgroundImageId,
    canvasTheme: source.canvasTheme,
    canvasArtifactStyle: normalizeArtifactStyleId(source.canvasArtifactStyle),
    selectedModel: source.selectedModel,
    viewMode: source.viewMode,
    sessionArtifacts,
    canvasAssets: JSON.parse(
      JSON.stringify(source.canvasAssets ?? {}),
    ) as Record<string, CanvasAsset>,
    canvasArtifactNodes: JSON.parse(
      JSON.stringify(source.canvasArtifactNodes),
    ) as Record<string, CanvasArtifactNode>,
    canvasArtifactOrder: [...source.canvasArtifactOrder],
    canvasAssetNodes: JSON.parse(
      JSON.stringify(source.canvasAssetNodes ?? {}),
    ) as Record<string, CanvasAssetNode>,
    canvasAssetOrder: [...(source.canvasAssetOrder ?? [])],
    canvasSkills: JSON.parse(
      JSON.stringify(source.canvasSkills ?? {}),
    ) as Record<string, CanvasSkill>,
    canvasSkillNodes: JSON.parse(
      JSON.stringify(source.canvasSkillNodes ?? {}),
    ) as Record<string, CanvasSkillNode>,
    canvasSkillOrder: [...(source.canvasSkillOrder ?? [])],
    canvasTextLabels: JSON.parse(
      JSON.stringify(source.canvasTextLabels),
    ) as Record<string, CanvasTextLabel>,
    canvasTextLabelOrder: [...source.canvasTextLabelOrder],
    canvasStrokes: JSON.parse(
      JSON.stringify(source.canvasStrokes ?? {}),
    ) as Record<string, CanvasStroke>,
    canvasStrokeOrder: [...(source.canvasStrokeOrder ?? [])],
    canvasGifNodes: JSON.parse(
      JSON.stringify(source.canvasGifNodes ?? {}),
    ) as Record<string, CanvasGifNode>,
    canvasGifOrder: [...(source.canvasGifOrder ?? [])],
    canvas3DNodes: JSON.parse(
      JSON.stringify(source.canvas3DNodes ?? {}),
    ) as Record<string, Canvas3DNode>,
    canvas3DOrder: [...(source.canvas3DOrder ?? [])],
    uploadedAttachments: JSON.parse(
      JSON.stringify(source.uploadedAttachments),
    ) as UploadedAttachment[],
    collaborationHasEdits: source.collaborationHasEdits,
  };
}

function mergeRecordPreferLocal<T extends Record<string, unknown>>(
  remote: T,
  local: T,
): T {
  return { ...remote, ...local };
}

/** Per-thread newest-wins merge so a stale collaborator save can't clobber a fresher gist. */
function mergeThreadGists(
  remote: Record<string, ThreadGist>,
  local: Record<string, ThreadGist>,
): Record<string, ThreadGist> {
  const merged = { ...remote };
  for (const [threadId, gist] of Object.entries(local)) {
    const existing = merged[threadId];
    if (!existing || gist.updatedAt >= existing.updatedAt) {
      merged[threadId] = gist;
    }
  }
  return merged;
}

/** Drop malformed entries and gists for threads that no longer exist. */
function normalizeThreadGists(
  raw: unknown,
  threads: Record<string, Thread>,
): Record<string, ThreadGist> {
  const input = normalizeRecord<ThreadGist>(raw);
  const out: Record<string, ThreadGist> = {};
  for (const [threadId, entry] of Object.entries(input)) {
    if (!threads[threadId]) continue;
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.gist !== "string" || !entry.gist.trim()) continue;
    out[threadId] = {
      gist: entry.gist,
      updatedAt:
        typeof entry.updatedAt === "number" && Number.isFinite(entry.updatedAt)
          ? entry.updatedAt
          : 0,
      turnCount:
        typeof entry.turnCount === "number" && Number.isFinite(entry.turnCount)
          ? entry.turnCount
          : 0,
    };
  }
  return out;
}

function mergeOrder(remote: string[], local: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const id of remote) {
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(id);
    }
  }
  for (const id of local) {
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(id);
    }
  }
  return merged;
}

/** Union merge for collaborative saves — local edits win on id collisions. */
export function mergeCanvasSnapshots(
  remote: CanvasSnapshot,
  local: CanvasSnapshot,
): CanvasSnapshot {
  const cards = mergeRecordPreferLocal(remote.cards, local.cards);
  const cardOrder = mergeOrder(remote.cardOrder, local.cardOrder).filter(
    (id) => id in cards,
  );

  const connectionIds = new Set(remote.connections.map((c) => c.id));
  const connections = [
    ...remote.connections,
    ...local.connections.filter((c) => !connectionIds.has(c.id)),
  ];

  return {
    ...remote,
    viewport: local.viewport,
    cards,
    cardOrder,
    connections,
    threads: mergeRecordPreferLocal(remote.threads, local.threads),
    threadOrder: mergeOrder(remote.threadOrder, local.threadOrder),
    threadGists: mergeThreadGists(
      remote.threadGists ?? {},
      local.threadGists ?? {},
    ),
    groups: mergeRecordPreferLocal(remote.groups, local.groups),
    sessionArtifacts: mergeRecordPreferLocal(
      remote.sessionArtifacts,
      local.sessionArtifacts,
    ),
    canvasAssets: mergeRecordPreferLocal(
      remote.canvasAssets ?? {},
      local.canvasAssets ?? {},
    ),
    canvasArtifactNodes: mergeRecordPreferLocal(
      remote.canvasArtifactNodes ?? {},
      local.canvasArtifactNodes ?? {},
    ),
    canvasArtifactOrder: mergeOrder(
      remote.canvasArtifactOrder ?? [],
      local.canvasArtifactOrder ?? [],
    ),
    canvasAssetNodes: mergeRecordPreferLocal(
      remote.canvasAssetNodes ?? {},
      local.canvasAssetNodes ?? {},
    ),
    canvasAssetOrder: mergeOrder(
      remote.canvasAssetOrder ?? [],
      local.canvasAssetOrder ?? [],
    ),
    canvasSkills: mergeRecordPreferLocal(
      remote.canvasSkills ?? {},
      local.canvasSkills ?? {},
    ),
    canvasSkillNodes: mergeRecordPreferLocal(
      remote.canvasSkillNodes ?? {},
      local.canvasSkillNodes ?? {},
    ),
    canvasSkillOrder: mergeOrder(
      remote.canvasSkillOrder ?? [],
      local.canvasSkillOrder ?? [],
    ),
    canvasTextLabels: mergeRecordPreferLocal(
      remote.canvasTextLabels ?? {},
      local.canvasTextLabels ?? {},
    ),
    canvasTextLabelOrder: mergeOrder(
      remote.canvasTextLabelOrder ?? [],
      local.canvasTextLabelOrder ?? [],
    ),
    canvasStrokes: mergeRecordPreferLocal(
      remote.canvasStrokes ?? {},
      local.canvasStrokes ?? {},
    ),
    canvasStrokeOrder: mergeOrder(
      remote.canvasStrokeOrder ?? [],
      local.canvasStrokeOrder ?? [],
    ),
    canvasGifNodes: mergeRecordPreferLocal(
      remote.canvasGifNodes ?? {},
      local.canvasGifNodes ?? {},
    ),
    canvasGifOrder: mergeOrder(
      remote.canvasGifOrder ?? [],
      local.canvasGifOrder ?? [],
    ),
    canvas3DNodes: mergeRecordPreferLocal(
      remote.canvas3DNodes ?? {},
      local.canvas3DNodes ?? {},
    ),
    canvas3DOrder: mergeOrder(
      remote.canvas3DOrder ?? [],
      local.canvas3DOrder ?? [],
    ),
    uploadedAttachments: [
      ...(remote.uploadedAttachments ?? []),
      ...(local.uploadedAttachments ?? []).filter(
        (item) =>
          !(remote.uploadedAttachments ?? []).some(
            (remoteItem) => remoteItem.id === item.id,
          ),
      ),
    ],
    collaborationHasEdits:
      remote.collaborationHasEdits || local.collaborationHasEdits,
    connectorStyle: local.connectorStyle,
    canvasArtifactStyle: local.canvasArtifactStyle,
    canvasBackgroundStyle: local.canvasBackgroundStyle,
    canvasBackgroundImageId: local.canvasBackgroundImageId,
    canvasTheme: local.canvasTheme,
    selectedModel: local.selectedModel,
    viewMode: local.viewMode,
  };
}

export function buildEmptyCanvasSnapshot(
  selectedModel: ClaudeModel = "claude-sonnet-4-6",
): CanvasSnapshot {
  return {
    version: CANVAS_SNAPSHOT_VERSION,
    viewport: { x: 0, y: 0, scale: 1 },
    cards: {},
    cardOrder: [],
    connections: [],
    threads: {},
    threadOrder: [],
    threadGists: {},
    groups: {},
    connectorStyle: "curvy",
    canvasBackgroundStyle: "grid",
    canvasBackgroundImageId: DEFAULT_CANVAS_BACKGROUND_IMAGE_ID,
    canvasTheme: "light",
    canvasArtifactStyle: NEW_CANVAS_ARTIFACT_STYLE_ID,
    selectedModel,
    viewMode: "canvas",
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
    canvasGifNodes: {},
    canvasGifOrder: [],
    canvas3DNodes: {},
    canvas3DOrder: [],
    uploadedAttachments: [],
    collaborationHasEdits: false,
  };
}

const VALID_BACKGROUND_STYLES = new Set<CanvasBackgroundStyle>([
  "grid",
  "ambient-gradient",
  "static-image",
]);

function normalizeCanvasBackgroundStyle(
  raw: unknown,
  fallback: CanvasBackgroundStyle,
): CanvasBackgroundStyle {
  return typeof raw === "string" &&
    VALID_BACKGROUND_STYLES.has(raw as CanvasBackgroundStyle)
    ? (raw as CanvasBackgroundStyle)
    : fallback;
}

/** Validate a persisted style id against the registry; fall back to vanilla. */
function normalizeArtifactStyleId(raw: unknown): ArtifactStyleId {
  return typeof raw === "string"
    ? getArtifactStylePack(raw).id
    : DEFAULT_ARTIFACT_STYLE_ID;
}

const VALID_THEMES = new Set<CanvasTheme>(["light", "dark"]);

function normalizeCanvasTheme(
  raw: unknown,
  fallback: CanvasTheme,
): CanvasTheme {
  return typeof raw === "string" && VALID_THEMES.has(raw as CanvasTheme)
    ? (raw as CanvasTheme)
    : fallback;
}


function normalizeViewport(raw: unknown, fallback: Viewport): Viewport {
  if (!raw || typeof raw !== "object") return { ...fallback };
  const v = raw as Partial<Viewport>;
  return {
    x: typeof v.x === "number" && Number.isFinite(v.x) ? v.x : fallback.x,
    y: typeof v.y === "number" && Number.isFinite(v.y) ? v.y : fallback.y,
    scale:
      typeof v.scale === "number" && Number.isFinite(v.scale) && v.scale > 0
        ? v.scale
        : fallback.scale,
  };
}

function normalizeRecord<T>(raw: unknown): Record<string, T> {
  if (!raw || typeof raw !== "object") return {};
  return { ...(raw as Record<string, T>) };
}

function normalizeStringArray(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((id): id is string => typeof id === "string")
    : [];
}

function normalizeSessionArtifacts(
  raw: unknown,
): Record<string, SessionArtifact> {
  const input = normalizeRecord<SessionArtifact>(raw);
  const out: Record<string, SessionArtifact> = {};

  for (const [id, artifact] of Object.entries(input)) {
    if (!artifact || typeof artifact !== "object") continue;
    const versions = Array.isArray(artifact.versions)
      ? artifact.versions.filter(
          (version): version is SessionArtifact["versions"][number] =>
            Boolean(version && typeof version === "object" && version.id),
        )
      : [];
    if (versions.length === 0) continue;

    const latestVersionId =
      typeof artifact.latestVersionId === "string" &&
      versions.some((version) => version.id === artifact.latestVersionId)
        ? artifact.latestVersionId
        : versions[versions.length - 1]!.id;

    out[id] = {
      id: typeof artifact.id === "string" ? artifact.id : id,
      title:
        typeof artifact.title === "string" && artifact.title.trim().length > 0
          ? artifact.title
          : "Artifact",
      kind: artifact.kind ?? "custom",
      versions,
      latestVersionId,
    };
  }

  return out;
}

/** Merge partial or legacy persisted state with empty snapshot defaults. */
export function normalizeCanvasSnapshot(raw: unknown): CanvasSnapshot {
  const base = buildEmptyCanvasSnapshot();
  if (!raw || typeof raw !== "object") return base;

  const snapshot = raw as Partial<CanvasSnapshot>;
  if (snapshot.version !== CANVAS_SNAPSHOT_VERSION) return base;

  const cards = normalizeRecord<Card>(snapshot.cards);
  const cardOrder = normalizeStringArray(snapshot.cardOrder);
  const normalizedCardOrder =
    cardOrder.length > 0 ? cardOrder : Object.keys(cards);

  return {
    version: CANVAS_SNAPSHOT_VERSION,
    viewport: normalizeViewport(snapshot.viewport, base.viewport),
    cards,
    cardOrder: normalizedCardOrder,
    connections: Array.isArray(snapshot.connections)
      ? snapshot.connections.map((connection) => ({ ...connection }))
      : [],
    threads: normalizeRecord<Thread>(snapshot.threads),
    threadOrder: normalizeStringArray(snapshot.threadOrder),
    threadGists: normalizeThreadGists(
      snapshot.threadGists,
      normalizeRecord<Thread>(snapshot.threads),
    ),
    groups: normalizeRecord<BranchGroup>(snapshot.groups),
    // Curved is the only connector style offered (the hover picker is gone),
    // so canvases saved with pipeline ("orthogonal") connectors load curved.
    connectorStyle:
      snapshot.connectorStyle === "straight"
        ? snapshot.connectorStyle
        : snapshot.connectorStyle === "curvy" ||
            snapshot.connectorStyle === "orthogonal"
          ? "curvy"
          : base.connectorStyle,
    canvasBackgroundStyle: resolveBackgroundForTheme(
      normalizeCanvasBackgroundStyle(
        snapshot.canvasBackgroundStyle,
        base.canvasBackgroundStyle,
      ),
      normalizeCanvasTheme(snapshot.canvasTheme, base.canvasTheme),
    ),
    canvasBackgroundImageId: normalizeCanvasBackgroundImageId(
      snapshot.canvasBackgroundImageId,
      base.canvasBackgroundImageId,
    ),
    canvasTheme: normalizeCanvasTheme(snapshot.canvasTheme, base.canvasTheme),
    canvasArtifactStyle: normalizeArtifactStyleId(snapshot.canvasArtifactStyle),
    selectedModel:
      snapshot.selectedModel && isKnownModel(snapshot.selectedModel)
        ? snapshot.selectedModel
        : base.selectedModel,
    // Focus view is hidden from the view switch for now, so a canvas saved in
    // it reopens in chat (its nearest sibling) rather than a mode with no button.
    viewMode:
      snapshot.viewMode === "chat" || snapshot.viewMode === "focus"
        ? "chat"
        : "canvas",
    sessionArtifacts: normalizeSessionArtifacts(snapshot.sessionArtifacts),
    canvasAssets: normalizeRecord<CanvasAsset>(snapshot.canvasAssets),
    canvasArtifactNodes: normalizeRecord<CanvasArtifactNode>(
      snapshot.canvasArtifactNodes,
    ),
    canvasArtifactOrder: normalizeStringArray(snapshot.canvasArtifactOrder),
    canvasAssetNodes: normalizeRecord<CanvasAssetNode>(
      snapshot.canvasAssetNodes,
    ),
    canvasAssetOrder: normalizeStringArray(snapshot.canvasAssetOrder),
    canvasSkills: normalizeRecord<CanvasSkill>(snapshot.canvasSkills),
    canvasSkillNodes: normalizeRecord<CanvasSkillNode>(snapshot.canvasSkillNodes),
    canvasSkillOrder: normalizeStringArray(snapshot.canvasSkillOrder),
    canvasTextLabels: normalizeRecord<CanvasTextLabel>(
      snapshot.canvasTextLabels,
    ),
    canvasTextLabelOrder: normalizeStringArray(snapshot.canvasTextLabelOrder),
    canvasStrokes: normalizeRecord<CanvasStroke>(snapshot.canvasStrokes),
    canvasStrokeOrder: normalizeStringArray(snapshot.canvasStrokeOrder),
    canvasGifNodes: normalizeRecord<CanvasGifNode>(snapshot.canvasGifNodes),
    canvasGifOrder: normalizeStringArray(snapshot.canvasGifOrder),
    canvas3DNodes: normalizeRecord<Canvas3DNode>(snapshot.canvas3DNodes),
    canvas3DOrder: normalizeStringArray(snapshot.canvas3DOrder),
    uploadedAttachments: Array.isArray(snapshot.uploadedAttachments)
      ? (JSON.parse(
          JSON.stringify(snapshot.uploadedAttachments),
        ) as UploadedAttachment[])
      : [],
    collaborationHasEdits: Boolean(snapshot.collaborationHasEdits),
  };
}

export function isCanvasSnapshot(value: unknown): value is CanvasSnapshot {
  if (!value || typeof value !== "object") return false;
  return (value as Partial<CanvasSnapshot>).version === CANVAS_SNAPSHOT_VERSION;
}

export function parseCanvasSnapshot(raw: unknown): CanvasSnapshot | null {
  if (!isCanvasSnapshot(raw)) return null;
  return normalizeCanvasSnapshot(raw);
}

export function snapshotHasContent(snapshot: CanvasSnapshot): boolean {
  return snapshot.cardOrder.length > 0;
}
