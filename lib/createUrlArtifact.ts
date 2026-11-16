import { getActiveCanvasContext } from "@/lib/activeCanvasContext";
import type { CanvasAsset } from "@/lib/store";
import {
  CANVAS_ARTIFACT_WIDTH,
  DEFAULT_ARTIFACT_HEIGHT,
  REPO_ARTIFACT_HEIGHT,
  REPO_ARTIFACT_WIDTH,
} from "@/lib/canvasNodeBounds";
import {
  EMBED_LOADING_HEIGHT,
  EMBED_LOADING_WIDTH,
} from "@/lib/embedArtifact";
import { matchEmbedProviderId } from "@/lib/embed/registry";
import { markWebsiteEnriching } from "@/lib/websiteArtifact";
import type { EmbedResolveResult } from "@/lib/embed/types";
import {
  fetchGoogleConnectionGate,
  googleFileImportBlockedMessage,
} from "@/lib/google/fileImportClient";
import { createGoogleWorkspacePayload } from "@/lib/googleWorkspaceArtifact";
import { parseGoogleDriveUrl } from "@/lib/google/parseDriveUrl";
import { useCanvasStore } from "@/lib/store";
import { classifyPastedText } from "@/lib/urlDetection";
import { fetchYoutubeMeta } from "@/lib/youtube";

function artifactPositionAtPointer(
  world: { x: number; y: number },
  width = CANVAS_ARTIFACT_WIDTH,
  height = DEFAULT_ARTIFACT_HEIGHT,
): {
  x: number;
  y: number;
} {
  return {
    x: world.x - width / 2,
    y: world.y - height / 2,
  };
}

export interface LinkPreviewClientResult {
  title: string;
  domainLabel: string;
  faviconUrl?: string;
  previewImageUrl?: string;
  embeddable?: boolean;
}

export async function fetchLinkPreviewClient(
  url: string,
): Promise<LinkPreviewClientResult | null> {
  try {
    const res = await fetch(
      `/api/link-preview?url=${encodeURIComponent(url)}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as LinkPreviewClientResult;
  } catch {
    return null;
  }
}

export async function fetchEmbedClient(
  url: string,
): Promise<EmbedResolveResult | null> {
  try {
    const res = await fetch(`/api/embed?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    return (await res.json()) as EmbedResolveResult;
  } catch {
    return null;
  }
}

/**
 * Pull a resolved preview image into the canvas as an asset.
 *
 * A preview URL points at someone else's origin, so the browser re-fetches it on
 * every render and it rots when that origin moves, 403s a hotlink, or rate-limits.
 * Copying the bytes in once makes the image the canvas's own. Best-effort: if the
 * user is signed out, no canvas is open, or the source refuses us, the artifact
 * keeps the remote URL and simply behaves as it did before.
 */
async function persistPreviewImage(
  artifactId: string,
  previewImageUrl: string,
): Promise<void> {
  const context = getActiveCanvasContext();
  if (!context) return;
  // Already ours — a re-enrichment pass must not copy the copy.
  if (previewImageUrl.startsWith("/")) return;
  try {
    const res = await fetch("/api/assets/import-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: previewImageUrl,
        canvasId: context.canvasId,
      }),
    });
    if (!res.ok) return;
    const { asset } = (await res.json()) as { asset?: CanvasAsset };
    if (!asset) return;
    const store = useCanvasStore.getState();
    const current = store.sessionArtifacts[artifactId];
    if (!current) return;
    store.addCanvasAsset(asset);
    store.patchWebsiteArtifactTitle(artifactId, {
      title: current.title,
      previewImageUrl: asset.publicUrl,
      previewAssetId: asset.id,
    });
  } catch {
    // Keeping the remote URL is a strictly better outcome than losing the card.
  }
}

const healAttempted = new Set<string>();

/**
 * Re-resolve a website card whose stored preview image no longer loads.
 *
 * Canvases built offline (the transcript and conversation imports) bake a
 * preview path such as /transcript-import/previews/<hash>.jpg into the
 * payload. When those bytes never shipped with the deploy, every viewer gets a
 * broken image forever. This asks /api/link-preview for the site's real hero
 * once per artifact per session, patches the card, and copies the image into
 * the canvas's own assets so the fix sticks for everyone.
 *
 * Resolves to the new image URL, or null when the site offers none.
 */
export async function healWebsitePreview(
  artifactId: string,
  url: string,
  brokenPreviewUrl: string | undefined,
): Promise<string | null> {
  if (healAttempted.has(artifactId)) return null;
  healAttempted.add(artifactId);
  const preview = await fetchLinkPreviewClient(url);
  const next = preview?.previewImageUrl;
  if (!next || next === brokenPreviewUrl) return null;
  const current = useCanvasStore.getState().sessionArtifacts[artifactId];
  if (!current) return null;
  useCanvasStore.getState().patchWebsiteArtifactTitle(artifactId, {
    title: current.title,
    faviconUrl: preview.faviconUrl,
    previewImageUrl: next,
  });
  void persistPreviewImage(artifactId, next);
  return next;
}

function enrichWebsiteTitle(artifactId: string, url: string): void {
  // While this runs the card is genuinely "pending" and keeps its default box;
  // once it ends, an unresolved site is final and sizes as a favicon card.
  markWebsiteEnriching(artifactId, true);
  const applyPreview = (preview: LinkPreviewClientResult | null): boolean => {
    if (!preview?.title) return false;
    markWebsiteEnriching(artifactId, false);
    useCanvasStore.getState().patchWebsiteArtifactTitle(artifactId, {
      title: preview.title,
      faviconUrl: preview.faviconUrl,
      previewImageUrl: preview.previewImageUrl,
      embeddable: preview.embeddable ?? false,
    });
    if (preview.previewImageUrl) {
      void persistPreviewImage(artifactId, preview.previewImageUrl);
    }
    return true;
  };

  void fetchLinkPreviewClient(url).then((preview) => {
    if (applyPreview(preview)) return;
    window.setTimeout(() => {
      void fetchLinkPreviewClient(url).then((retry) => {
        if (!applyPreview(retry)) markWebsiteEnriching(artifactId, false);
      });
    }, 2000);
  });
}

function enrichYoutubeTitle(
  artifactId: string,
  url: string,
  versionId: string,
): void {
  void fetchYoutubeMeta(url).then((meta) => {
    const state = useCanvasStore.getState();
    const art = state.sessionArtifacts[artifactId];
    if (!art) return;
    const ver = art.versions.find((v) => v.id === versionId);
    if (!ver || ver.payload.type !== "images") return;
    const item = ver.payload.data.items[0];
    if (!item || item.kind !== "youtube") return;
    state.patchYoutubeArtifactTitle(artifactId, versionId, {
      title: meta.title,
      thumb: meta.thumb,
    });
  });
}

function applyEmbedResult(
  artifactId: string,
  versionId: string,
  result: EmbedResolveResult,
): void {
  useCanvasStore.getState().patchEmbedArtifact(artifactId, versionId, result);
}

function enrichEmbed(artifactId: string, versionId: string, url: string): void {
  void fetchEmbedClient(url).then((result) => {
    if (!result) {
      const provider = matchEmbedProviderId(url) ?? "reddit";
      applyEmbedResult(artifactId, versionId, {
        provider,
        url,
        title: url,
        embedWidth: EMBED_LOADING_WIDTH,
        embedHeight: EMBED_LOADING_HEIGHT,
        status: "failed",
        fallback: { domainLabel: url },
      });
      return;
    }
    applyEmbedResult(artifactId, versionId, result);
  });
}

interface GoogleFileImportResult {
  fileId: string;
  fileKind: string;
  title: string;
  mimeType?: string;
  url: string;
  extractedText?: string;
  extractedTextLength?: number;
  truncated?: boolean;
  status?: string;
  needsConnect?: boolean;
  needsAccess?: boolean;
  error?: string;
}

async function fetchGoogleFileImport(
  url: string,
  fileId?: string,
): Promise<GoogleFileImportResult | null> {
  try {
    const params = new URLSearchParams({ url });
    if (fileId) params.set("fileId", fileId);
    const res = await fetch(`/api/google/files?${params.toString()}`);
    const body = (await res.json()) as GoogleFileImportResult;
    if (body.needsConnect) {
      return {
        ...body,
        fileId: body.fileId ?? fileId ?? "",
        url,
        needsConnect: true,
      };
    }
    if (body.needsAccess) {
      return {
        ...body,
        fileId: body.fileId ?? fileId ?? "",
        url,
        needsAccess: true,
        error: body.error,
      };
    }
    if (!res.ok) {
      return {
        ...body,
        fileId: body.fileId ?? fileId ?? "",
        url,
        error: body.error,
      } as GoogleFileImportResult;
    }
    return body;
  } catch {
    return null;
  }
}

function enrichGoogleWorkspaceArtifact(
  artifactId: string,
  url: string,
  fileId: string,
): void {
  void fetchGoogleConnectionGate().then((gate) => {
    const state = useCanvasStore.getState();
    if (!gate.signedIn || !gate.connected) {
      state.patchGoogleWorkspaceArtifact(artifactId, {
        status: "needs_connect",
        errorMessage: googleFileImportBlockedMessage(gate),
      });
      return;
    }

    void fetchGoogleFileImport(url, fileId).then((result) => {
      if (!result) {
        state.patchGoogleWorkspaceArtifact(artifactId, {
          status: "failed",
          errorMessage: "Could not import this file.",
        });
        return;
      }

      if (result.needsConnect) {
        state.patchGoogleWorkspaceArtifact(artifactId, {
          status: "needs_connect",
          errorMessage: "Connect Google to import content from this file.",
        });
        return;
      }

      if (result.needsAccess) {
        state.patchGoogleWorkspaceArtifact(artifactId, {
          status: "needs_access",
          errorMessage:
            "Grant Drive access to import text for AI context.",
        });
        return;
      }

      if (result.error && result.status !== "ready") {
        state.patchGoogleWorkspaceArtifact(artifactId, {
          status: "failed",
          errorMessage: result.error,
        });
        return;
      }

      state.patchGoogleWorkspaceArtifact(artifactId, {
        title: result.title,
        mimeType: result.mimeType,
        status: "ready",
        extractedText: result.extractedText,
        extractedTextLength:
          result.extractedTextLength ?? result.extractedText?.length,
        truncated: result.truncated,
        errorMessage: undefined,
      });
    });
  });
}

/** Create a website, embed, or YouTube artifact from pasted/typed URL text. */
export function createUrlArtifactFromText(
  text: string,
  position: { x: number; y: number },
  opts?: { recordUndo?: boolean },
): boolean {
  const classified = classifyPastedText(text);
  if (!classified) return false;

  const undoOpts = { recordUndo: opts?.recordUndo };

  if (classified.kind === "youtube") {
    const { artifactId, versionId } = useCanvasStore
      .getState()
      .createVideoArtifactFromUrl(classified.url, {
        position: artifactPositionAtPointer(position),
        ...undoOpts,
      });
    enrichYoutubeTitle(artifactId, classified.url, versionId);
    return true;
  }

  if (classified.kind === "repo") {
    useCanvasStore.getState().createRepoArtifactFromUrl(classified.url, {
      position: artifactPositionAtPointer(
        position,
        REPO_ARTIFACT_WIDTH,
        REPO_ARTIFACT_HEIGHT,
      ),
      ...undoOpts,
    });
    return true;
  }

  if (classified.kind === "google-doc") {
    const parsed = parseGoogleDriveUrl(classified.url);
    const payload = createGoogleWorkspacePayload(parsed);
    if (!payload) return false;
    const { artifactId } = useCanvasStore
      .getState()
      .createGoogleWorkspaceArtifactFromUrl(classified.url, {
        position: artifactPositionAtPointer(position),
        ...undoOpts,
      });
    enrichGoogleWorkspaceArtifact(artifactId, classified.url, payload.data.fileId);
    return true;
  }

  if (classified.kind === "embed") {
    const { artifactId, versionId } = useCanvasStore
      .getState()
      .createEmbedArtifactFromUrl(classified.url, {
        position: artifactPositionAtPointer(
          position,
          EMBED_LOADING_WIDTH,
          EMBED_LOADING_HEIGHT,
        ),
        ...undoOpts,
      });
    enrichEmbed(artifactId, versionId, classified.url);
    return true;
  }

  if (classified.kind === "image") {
    return false;
  }

  const spawnPosition = artifactPositionAtPointer(position);
  const { artifactId } = useCanvasStore
    .getState()
    .createWebsiteArtifactFromUrl(classified.url, spawnPosition, undoOpts);
  enrichWebsiteTitle(artifactId, classified.url);
  return true;
}

/** Re-fetch embed metadata for retry from the artifact UI. */
export function retryEmbedArtifact(
  artifactId: string,
  versionId: string,
  url: string,
): void {
  useCanvasStore.getState().patchEmbedArtifact(artifactId, versionId, {
    status: "loading",
  });
  void fetchEmbedClient(url).then((result) => {
    if (!result) {
      const provider = matchEmbedProviderId(url) ?? "reddit";
      applyEmbedResult(artifactId, versionId, {
        provider,
        url,
        title: url,
        embedWidth: EMBED_LOADING_WIDTH,
        embedHeight: EMBED_LOADING_HEIGHT,
        status: "failed",
        fallback: { domainLabel: url },
      });
      return;
    }
    applyEmbedResult(artifactId, versionId, result);
  });
}
