"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CurrentBody } from "../current";
import { useWebsitePreview } from "../useWebsitePreview";
import type { ArtifactRenderContext } from "../types";
import { GALLERY_VISIBLE, ROLE } from "../textSpec";
import { V, labelStyle, padTop, useLook } from "./look";

/**
 * Kit media. Live artifacts (map, street view, 3D, embed, widget) sit in a
 * well inset one nest from the card; pictures, video and web previews fill
 * the well edge to edge.
 *
 * A live artifact is media, not text: its well is opaque to the Elements
 * scan (a 3D viewer's "Loading model…" is not a part). The map is the one
 * exception — its live body labels the place, and that label is the Place
 * part (textSpec.ts).
 */

type Ctx = { ctx: ArtifactRenderContext };

function Well({ children, flush = false, live = false }: { children: ReactNode; flush?: boolean; live?: boolean }) {
  const look = useLook();
  const inset = look.pad - look.nest > 0 ? look.radius - look.nest : 10;
  return (
    <div
      data-el-opaque={live || undefined}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{
        margin: flush ? 0 : `0 ${inset}px ${inset}px`,
        borderRadius: flush ? 0 : look.nest,
        background: V.well,
        border: look.chip === "block" && !flush ? `${look.stroke}px solid ${V.ink}` : undefined,
      }}
    >
      {children}
    </div>
  );
}

/** The live artifact in a well. */
export function InsetBody({ ctx }: Ctx) {
  if (ctx.item.payload.type === "map") {
    return (
      <div data-el={ROLE.place} className="flex min-h-0 flex-1 flex-col pt-0">
        <Well>
          <CurrentBody ctx={ctx} />
        </Well>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col pt-0">
      <Well live>
        <CurrentBody ctx={ctx} />
      </Well>
    </div>
  );
}

/** The live artifact edge to edge, the frame's corners cropping it. */
export function FlushBody({ ctx }: Ctx) {
  return (
    <div data-el={ctx.item.payload.type === "map" ? ROLE.place : undefined} className="flex min-h-0 flex-1 flex-col">
      <Well flush live={ctx.item.payload.type !== "map"}>
        <CurrentBody ctx={ctx} />
      </Well>
    </div>
  );
}

// ─── Images ─────────────────────────────────────────────────────────────────

export function ImagesBody({ ctx }: Ctx) {
  const look = useLook();
  const payload = ctx.item.payload;
  if (payload.type !== "images") return <InsetBody ctx={ctx} />;
  const items = payload.data.items.filter((i) => i.url || i.thumb);
  const shown = items.slice(0, GALLERY_VISIBLE);
  // Counted from the gallery, not from what has a picture: "+n" is what the tiles don't show.
  const more = payload.data.items.length > GALLERY_VISIBLE ? payload.data.items.length - shown.length : 0;
  const src = (i: (typeof items)[number]) => i.thumb || i.url;
  const alt = (i: (typeof items)[number]) => (i.kind === "image" ? i.alt ?? "" : i.title ?? "");
  const gap = look.chip === "block" ? look.stroke : 3;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Well>
        <div className="grid h-full" style={{ gap, background: look.chip === "block" ? V.ink : "transparent", ...(shown.length >= 3 ? { gridTemplateColumns: "1.6fr 1fr", gridTemplateRows: "1fr 1fr" } : { gridTemplateColumns: `repeat(${shown.length}, 1fr)` }) }}>
          {shown.map((item, i) => (
            <div key={item.url + i} className="relative min-h-0 overflow-hidden" style={{ gridRow: shown.length >= 3 && i === 0 ? "span 2" : undefined }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src(item)} alt={alt(item)} className="h-full w-full object-cover" loading="lazy" />
              {more > 0 && i === shown.length - 1 ? (
                <span data-el={ROLE.moreCount} className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)", color: "#fff", fontFamily: look.font.display, fontWeight: look.font.numberWeight, fontSize: 30 }}>
                  +{more}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </Well>
    </div>
  );
}

// ─── Video ──────────────────────────────────────────────────────────────────

export function VideoBody({ ctx }: Ctx) {
  const look = useLook();
  const [playing, setPlaying] = useState(false);
  const payload = ctx.item.payload;
  const first = payload.type === "video" ? payload.data.items[0] : payload.type === "images" ? payload.data.items.find((i) => i.kind === "youtube") : undefined;
  const thumb = first?.thumb;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Well live>
        {playing || !thumb ? (
          <CurrentBody ctx={ctx} />
        ) : (
          <button type="button" disabled={!ctx.interactive} onClick={() => setPlaying(true)} className="relative h-full w-full" aria-label="Play video">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="inline-flex items-center justify-center" style={{ width: 64, height: 64, background: V.accent, borderRadius: look.chip === "block" ? 6 : 999, border: look.chip === "block" ? `${look.stroke}px solid ${V.ink}` : undefined, boxShadow: look.chip === "block" ? `4px 4px 0 ${V.ink}` : "0 8px 24px -8px rgba(0,0,0,0.5)" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
                  <path d="M7 4.5v15l12.5-7.5L7 4.5Z" fill={V.accentInk} />
                </svg>
              </span>
            </span>
          </button>
        )}
      </Well>
    </div>
  );
}

// ─── Audio ──────────────────────────────────────────────────────────────────

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function AudioBody({ ctx }: Ctx) {
  const look = useLook();
  const payload = ctx.item.payload;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const tick = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
    const end = () => setPlaying(false);
    a.addEventListener("timeupdate", tick);
    a.addEventListener("ended", end);
    return () => {
      a.removeEventListener("timeupdate", tick);
      a.removeEventListener("ended", end);
    };
  }, []);

  if (payload.type !== "audio") return <InsetBody ctx={ctx} />;
  const d = payload.data;
  const bars = 40;
  const peaks = Array.from({ length: bars }, (_, i) => {
    const from = Math.floor((i * d.peaks.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * d.peaks.length) / bars));
    return Math.max(...d.peaks.slice(from, to), 0.05);
  });
  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      void a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  };
  const barRadius = look.bar === "pill" || look.bar === "cap" ? 999 : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ padding: `${padTop(look, look.pad - 6)}px ${look.pad}px ${look.pad - 6}px` }}>
      <div className="flex min-h-0 flex-1 items-center gap-[3px] py-2">
        {peaks.map((p, i) => (
          <span key={i} className="min-w-0 flex-1" style={{ height: `${Math.max(8, p * 100)}%`, background: i / bars < progress ? V.accent : V.ink, borderRadius: barRadius, opacity: i / bars < progress ? 1 : 0.85 }} />
        ))}
      </div>
      <div className="flex shrink-0 items-center justify-between">
        <button type="button" disabled={!ctx.interactive} onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="inline-flex h-9 w-9 items-center justify-center" style={{ background: V.accent, borderRadius: look.chip === "block" ? 4 : 999, border: look.chip === "block" ? `${look.stroke}px solid ${V.ink}` : undefined }}>
          {playing ? (
            <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
              <rect x="2.5" y="2" width="3" height="10" fill={V.accentInk} />
              <rect x="8.5" y="2" width="3" height="10" fill={V.accentInk} />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
              <path d="M3.5 2v10l8-5-8-5Z" fill={V.accentInk} />
            </svg>
          )}
        </button>
        <span data-el={ROLE.duration} className="tabular-nums" style={labelStyle(look, 14, V.ink)}>
          {clock(d.durationMs)}
        </span>
      </div>
      {ctx.interactive ? <audio ref={audioRef} src={d.publicUrl} preload="none" /> : null}
    </div>
  );
}

// ─── Website ────────────────────────────────────────────────────────────────

export function WebsiteBody({ ctx }: Ctx) {
  const look = useLook();
  const payload = ctx.item.payload;
  const site = payload.type === "website" ? payload.data : null;
  const preview = useWebsitePreview(ctx.item.artifact.id, site?.url ?? "", site?.previewImageUrl);
  if (payload.type !== "website") return <InsetBody ctx={ctx} />;
  const d = payload.data;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 pb-2.5" style={{ padding: `0 ${look.pad}px 10px` }}>
        {d.faviconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.faviconUrl} alt="" className="h-4 w-4 rounded-[3px] bg-white" />
        ) : null}
        <span data-el={ROLE.domain} className="truncate" style={labelStyle(look, 14, V.ink)}>
          {d.domainLabel}
        </span>
      </div>
      <Well>
        <a href={ctx.interactive ? d.url : undefined} target="_blank" rel="noreferrer" className="absolute inset-0 flex items-center justify-center">
          {d.previewImageUrl && !preview.failed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.previewImageUrl} alt="" onError={preview.onError} className="h-full w-full object-cover object-top" />
          ) : d.faviconUrl ? (
            // No preview: the site's mark, large, in the well.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.faviconUrl} alt="" className="h-12 w-12 rounded-[8px] bg-white opacity-80" />
          ) : null}
        </a>
      </Well>
    </div>
  );
}
