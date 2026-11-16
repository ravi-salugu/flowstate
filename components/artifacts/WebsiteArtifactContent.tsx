"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArtifactContentStage } from "@/components/artifacts/ArtifactContentStage";
import { MediaLoadingCover } from "@/components/artifacts/ArtifactLoadingSkeleton";
import { useMediaLoaded } from "@/hooks/useMediaLoaded";
import { ArtifactTypeIcon } from "@/components/artifacts/ArtifactTypeIcon";
import { InteractiveWebFrame } from "@/components/artifacts/InteractiveWebFrame";
import type { ArtifactPayload } from "@/lib/artifactTypes";
import { healWebsitePreview } from "@/lib/createUrlArtifact";
import { refreshAssetSignedUrl } from "@/lib/refreshAssetUrl";
import {
  faviconForUrl,
  isFaviconServicePlaceholder,
} from "@/lib/transcriptArtifacts";
import { useCanvasStore } from "@/lib/store";
import { isWebsiteTitlePending } from "@/lib/websiteArtifact";

function displayHost(url: string): string {
  try {
    const u = new URL(url);
    return u.host + u.pathname + u.search;
  } catch {
    return url;
  }
}

function WebsiteFavicon({
  faviconUrl,
  url,
  className,
  bare = false,
}: {
  faviconUrl?: string;
  /** The site itself — a favicon is looked up from it when none was scraped. */
  url?: string;
  className: string;
  /** Drop the gray plate and let the glyph fill the box — for the hero icon. */
  bare?: boolean;
}) {
  // Every site gets a favicon attempt (L1 is mandatory): the scraped one first,
  // then the favicon service. A favicon commonly 403s on hotlink-protected
  // origins, so each failure steps down, and only when both fail does the card
  // fall through to the generic globe.
  const serviceSrc = url ? faviconForUrl(url) : undefined;
  const sources = useMemo(
    () =>
      [faviconUrl, serviceSrc].filter(
        (src, index, all): src is string =>
          Boolean(src) && all.indexOf(src) === index,
      ),
    [faviconUrl, serviceSrc],
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setAttempt(0);
  }, [sources]);

  const src = sources[attempt];
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={`${className} object-contain`}
        referrerPolicy="no-referrer"
        onError={() => setAttempt((n) => n + 1)}
        onLoad={(event) => {
          // An unknown site gets the service's 16px globe, not an error —
          // count it as no favicon so the crisp glyph below draws instead.
          if (isFaviconServicePlaceholder(event.currentTarget)) {
            setAttempt((n) => n + 1);
          }
        }}
      />
    );
  }
  return (
    <div
      className={`${className} flex items-center justify-center ${
        bare ? "text-canvas-ink/70" : "bg-canvas-bg text-canvas-muted"
      }`}
    >
      <ArtifactTypeIcon kind="website" className={bare ? "h-full w-full" : "h-1/2 w-1/2"} />
    </div>
  );
}

/**
 * Reports failure upward rather than rendering nothing. Returning null used to
 * leave the sized container behind as a blank slab — the caller needs to know so
 * it can show the real empty state instead.
 */
function PreviewThumbnail({
  previewImageUrl,
  alt,
  className,
  onFailed,
  onNaturalSize,
}: {
  previewImageUrl: string;
  alt: string;
  className: string;
  onFailed: () => void;
  /** Only passed while the size is still unknown. */
  onNaturalSize?: (size: { width: number; height: number }) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const load = useMediaLoaded(previewImageUrl);
  const wantsSize = Boolean(onNaturalSize);
  // An image that finished loading before the size was wanted (cached, or the
  // payload changed under it) fires no further load event, so read it here.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) load.onLoad();
    if (wantsSize && img?.complete && img.naturalWidth > 0) {
      onNaturalSize?.({ width: img.naturalWidth, height: img.naturalHeight });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsSize, previewImageUrl]);
  return (
    <>
      {/* Unstacked, so overlays drawn after the image (the hero's title
          strip) stay visible while it loads. */}
      <MediaLoadingCover loaded={load.loaded} className="" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={previewImageUrl}
        alt={alt}
        className={className}
        referrerPolicy="no-referrer"
        onError={() => {
          load.onError();
          onFailed();
        }}
        onLoad={(event) => {
          load.onLoad();
          const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
          if (width > 0 && height > 0) onNaturalSize?.({ width, height });
        }}
      />
    </>
  );
}

export function WebsiteArtifactContent({
  payload,
  fill = false,
  sidebar = false,
  layout = "panel",
  forceInteractive = false,
  artifactId,
}: {
  payload: Extract<ArtifactPayload, { type: "website" }>;
  fill?: boolean;
  sidebar?: boolean;
  layout?: "canvas" | "panel" | "sidebar";
  forceInteractive?: boolean;
  artifactId?: string;
}) {
  const {
    url,
    title,
    faviconUrl,
    previewImageUrl,
    previewAssetId,
    embeddable,
    previewWidth,
    previewHeight,
  } = payload.data;
  const pending = isWebsiteTitlePending(payload);

  // The live frame is preferred when the site allows embedding; the watchdog
  // inside InteractiveWebFrame can flip us back to the static card if it never
  // renders. Reset the fallback whenever the target URL changes.
  const [frameFailed, setFrameFailed] = useState(false);
  useEffect(() => {
    setFrameFailed(false);
  }, [url]);
  const showLiveFrame = embeddable === true && !frameFailed && !sidebar;

  // A preview that 404s, 403s or rate-limits must fall through to the empty
  // state below, not leave an empty box the size of the whole card.
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewSrc, setPreviewSrc] = useState(previewImageUrl);
  const resignedRef = useRef(false);
  useEffect(() => {
    setPreviewFailed(false);
    setPreviewSrc(previewImageUrl);
    resignedRef.current = false;
  }, [previewImageUrl]);

  // When the image is a canvas asset, its signed URL expires after a week. One
  // re-sign from the stored path is the difference between a card that keeps
  // working and one that quietly empties out.
  const handlePreviewError = () => {
    const asset = previewAssetId
      ? useCanvasStore.getState().canvasAssets[previewAssetId]
      : undefined;
    if (!resignedRef.current && asset?.storagePath) {
      resignedRef.current = true;
      void refreshAssetSignedUrl(asset.storagePath).then((nextUrl) => {
        if (!nextUrl) {
          setPreviewFailed(true);
          return;
        }
        setPreviewSrc(nextUrl);
        useCanvasStore.getState().patchCanvasAssetPublicUrl(asset.id, nextUrl);
      });
      return;
    }
    // Not an asset (or its re-sign failed): the stored image is gone. Ask the
    // site for its real hero once; the empty state shows meanwhile.
    setPreviewFailed(true);
    if (artifactId) {
      void healWebsitePreview(artifactId, url, previewSrc).then((nextUrl) => {
        if (!nextUrl) return;
        setPreviewSrc(nextUrl);
        setPreviewFailed(false);
      });
    }
  };

  const showPreview = Boolean(previewSrc) && !previewFailed;

  // A card that never stored its hero's size (made before sizes were baked,
  // or from a pasted link) learns it from the loaded image, so the card can
  // take the image's real aspect ratio — see getArtifactBounds.
  const recordPreviewSize = (size: { width: number; height: number }) => {
    if (!artifactId) return;
    useCanvasStore.getState().patchWebsitePreviewSize(artifactId, size);
  };

  if (showLiveFrame) {
    const frame = (
      <InteractiveWebFrame
        src={url}
        title={title}
        layout={layout}
        forceInteractive={forceInteractive}
        onFailed={() => setFrameFailed(true)}
      />
    );
    if (fill) {
      return (
        <ArtifactContentStage
          fill
          artifactId={artifactId}
          className="h-full min-h-0 !bg-transparent"
        >
          {frame}
        </ArtifactContentStage>
      );
    }
    return frame;
  }

  if (sidebar) {
    return (
      <div className="flex h-full min-h-[80px] items-center gap-2 px-3 py-2">
        {showPreview ? (
          <div className="relative h-10 w-16 shrink-0 overflow-hidden rounded-canvas bg-canvas-bg">
            <PreviewThumbnail
              previewImageUrl={previewSrc!}
              alt={title}
              className="h-full w-full object-cover"
              onFailed={handlePreviewError}
            />
          </div>
        ) : (
          <WebsiteFavicon faviconUrl={faviconUrl} url={url} className="h-10 w-10 shrink-0 rounded-canvas" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {showPreview && (
              <WebsiteFavicon
                faviconUrl={faviconUrl}
                url={url}
                className="h-4 w-4 shrink-0 rounded-canvas-xs"
              />
            )}
            <span
              className={`min-w-0 truncate text-canvas-caption font-medium ${
                pending ? "text-canvas-muted" : "text-canvas-ink"
              }`}
            >
              {title}
            </span>
          </div>
          <span className="mt-0.5 block truncate text-canvas-micro text-canvas-muted">
            {displayHost(url)}
          </span>
        </div>
      </div>
    );
  }

  // Two shapes, picked by what the site offers. L2: its hero image, in a card
  // already sized to the image's own aspect ratio (see websiteArtifactSize), so
  // the image fills it exactly — `object-cover` only absorbs sub-pixel rounding,
  // and a portrait poster stays a portrait. L1: no hero, so the favicon, title
  // and link are the card, centred on the artifact's own colour.
  const linkRow = (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={url}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      className="block max-w-full truncate text-canvas-caption text-canvas-ink/70 underline decoration-canvas-ink/30 underline-offset-2 transition-colors hover:text-canvas-ink hover:decoration-canvas-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas-accent/50"
    >
      {displayHost(url)}
    </a>
  );

  const identity = (
    <div
      className={`flex flex-col items-center justify-center gap-3 px-5 pb-4 pt-2 text-center ${
        fill ? "h-full min-h-0" : "min-h-[200px]"
      }`}
    >
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="flex aspect-square h-20 max-h-full items-center justify-center rounded-[22%] bg-white p-3 shadow-sm">
          <WebsiteFavicon
            bare
            faviconUrl={faviconUrl}
            url={url}
            className="h-full w-full"
          />
        </div>
      </div>
      <div className="flex w-full shrink-0 flex-col items-center gap-0.5">
        <h3
          className={`max-w-full truncate text-canvas-body font-semibold leading-snug ${
            pending ? "text-canvas-ink/60" : "text-canvas-ink"
          }`}
        >
          {title}
        </h3>
        {linkRow}
      </div>
    </div>
  );

  const card = showPreview ? (
    <div className={`flex flex-col px-3 pb-3 ${fill ? "h-full min-h-0" : ""}`}>
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        title={url}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        className={`group/hero relative block w-full overflow-hidden rounded-canvas-nest-13 bg-canvas-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas-accent/50 ${
          fill ? "min-h-0 flex-1" : "aspect-[4/3]"
        }`}
      >
        <PreviewThumbnail
          previewImageUrl={previewSrc!}
          alt={title}
          className="absolute inset-0 h-full w-full object-cover"
          onFailed={handlePreviewError}
          onNaturalSize={previewWidth && previewHeight ? undefined : recordPreviewSize}
        />
        <span className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/65 via-black/30 to-transparent px-3 pb-2.5 pt-8 text-white">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white p-1">
            <WebsiteFavicon
              bare
              faviconUrl={faviconUrl}
              url={url}
              className="h-full w-full"
            />
          </span>
          <span className="min-w-0 flex-1 truncate text-canvas-caption font-medium drop-shadow-sm group-hover/hero:underline">
            {displayHost(url)}
          </span>
        </span>
      </a>
    </div>
  ) : (
    identity
  );

  if (fill) {
    return (
      <ArtifactContentStage
        fill
        artifactId={artifactId}
        className="h-full !bg-transparent"
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden">{card}</div>
      </ArtifactContentStage>
    );
  }

  return card;
}
