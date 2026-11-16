"use client";

import { PRIMARY } from "../fonts";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CurrentBody } from "../current";
import { useWebsitePreview } from "../useWebsitePreview";
import type { ArtifactRenderContext } from "../types";
import { GALLERY_VISIBLE, ROLE } from "../textSpec";
import { C, Display, KICKER_PART, Kicker, NEST_INSET, NEST_RADIUS, PAD, PAD_Y, sentenceCase, sizeFor, splitTitle, tint } from "./tokens";

/**
 * Media: the title is set on the card above the picture, as in the reference's
 * "Thomas Smith" card, and the picture sits in a well inset into the card's
 * lower edge — inset by NEST_INSET with NEST_RADIUS corners, so the curves
 * stay concentric with the card.
 */

type Ctx = { ctx: ArtifactRenderContext };

function MediaHead({ title, kicker, aside }: { title: string; kicker?: ReactNode; aside?: ReactNode }) {
  const t = splitTitle(title);
  const head = t.head;
  const lead = t.lead;
  const sub = [t.sub ? sentenceCase(t.sub) : null, t.range].filter(Boolean).join(" · ");
  return (
    <div className="flex shrink-0 items-start gap-4" style={{ padding: `${PAD_Y - 4}px ${PAD}px 22px` }}>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {/* A kicker that isn't the title's (a site's name) carries its own part tag. */}
        {kicker ? <Kicker size={KICKER_PART}>{kicker}</Kicker> : null}
        <div data-el={ROLE.title} className="flex flex-col gap-2">
          {!kicker && lead ? <Kicker>{lead}</Kicker> : null}
          <Display size={sizeFor(head, [[18, 34], [30, 30], [48, 26]], 23)}>{kicker && lead ? `${lead}: ${head}` : head}</Display>
          {sub ? <Kicker>{sub}</Kicker> : null}
        </div>
      </div>
      {aside}
    </div>
  );
}

/** The least height a media well is drawn at. */
const WELL_MIN = 220;

function Well({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`relative flex flex-1 flex-col overflow-hidden ${className}`}
      // The picture never gives up its room to a long title — the card grows instead.
      style={{ margin: `0 ${NEST_INSET}px ${NEST_INSET}px`, borderRadius: NEST_RADIUS, background: tint(C.ink, 8), minHeight: WELL_MIN }}
    >
      {children}
    </div>
  );
}

/** Title above, the live artifact (map, street view, 3D, embed, widget) in the inset well. */
export function InsetBody({ ctx }: Ctx) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MediaHead title={ctx.item.artifact.title} />
      <Well>
        {ctx.item.variant === "map" ? (
          // The live map labels its place along its lower edge — that label is the Place part.
          <div data-el={ROLE.place} className="flex min-h-0 flex-1 flex-col">
            <CurrentBody ctx={ctx} />
          </div>
        ) : (
          <CurrentBody ctx={ctx} />
        )}
      </Well>
    </div>
  );
}

// ─── Images ─────────────────────────────────────────────────────────────────

/** A hero picture and its supporting cast, the remainder counted on the last tile. */
export function ImagesBody({ ctx }: Ctx) {
  const payload = ctx.item.payload;
  if (payload.type !== "images") return <InsetBody ctx={ctx} />;
  const items = payload.data.items.filter((i) => i.url || i.thumb);
  const shown = items.slice(0, GALLERY_VISIBLE);
  // Counted from the gallery itself, so the "+n" is there whenever it holds more than it shows.
  const more = payload.data.items.length - GALLERY_VISIBLE;
  const src = (i: (typeof items)[number]) => i.thumb || i.url;
  const alt = (i: (typeof items)[number]) => (i.kind === "image" ? i.alt ?? "" : i.title ?? "");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MediaHead title={ctx.item.artifact.title} />
      <Well className="!bg-transparent">
        <div
          className="grid h-full gap-1.5"
          style={
            shown.length >= 3
              ? { gridTemplateColumns: "1.7fr 1fr", gridTemplateRows: "1fr 1fr" }
              : { gridTemplateColumns: `repeat(${shown.length}, 1fr)` }
          }
        >
          {shown.map((item, i) => (
            <div
              key={item.url + i}
              className="relative min-h-0 overflow-hidden"
              style={{ gridRow: shown.length >= 3 && i === 0 ? "span 2" : undefined, borderRadius: 8 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src(item)} alt={alt(item)} className="h-full w-full object-cover" loading="lazy" />
              {more > 0 && i === shown.length - 1 ? (
                <span
                  data-el={ROLE.moreCount}
                  className="absolute inset-0 flex items-center justify-center text-[34px] font-medium tracking-[-0.03em]"
                  style={{ fontFamily: PRIMARY, background: C.scrim, color: C.pure }}
                >
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

function PlayButton({ size = 76 }: { size?: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-full" style={{ width: size, height: size, background: C.lime }}>
      <svg width={size * 0.36} height={size * 0.36} viewBox="0 0 24 24" aria-hidden>
        <path d="M7 4.5v15l12.5-7.5L7 4.5Z" fill={C.onBright} strokeLinejoin="round" stroke={C.onBright} strokeWidth="1.5" />
      </svg>
    </span>
  );
}

/** A date or series in the kicker, the headline, then the frame with a lime play button. */
export function VideoBody({ ctx }: Ctx) {
  const [playing, setPlaying] = useState(false);
  const payload = ctx.item.payload;
  const first =
    payload.type === "video"
      ? payload.data.items[0]
      : payload.type === "images"
        ? payload.data.items.find((i) => i.kind === "youtube")
        : undefined;
  const thumb = first?.thumb;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MediaHead title={ctx.item.artifact.title} />
      <Well>
        {playing || !thumb ? (
          <CurrentBody ctx={ctx} />
        ) : (
          <button
            type="button"
            disabled={!ctx.interactive}
            onClick={() => setPlaying(true)}
            className="relative h-full w-full"
            aria-label="Play video"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center">
              <PlayButton />
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

/** The waveform is the picture: ink bars, the played part orange, the title over it. */
export function AudioBody({ ctx }: Ctx) {
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
  const t = splitTitle(ctx.item.artifact.title);
  const bars = 36;
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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ padding: `${PAD_Y - 8}px ${PAD - 8}px` }}>
      <div data-el={ROLE.title} className="shrink-0">
        <Display size={sizeFor(t.head, [[16, 22], [28, 19]], 17)}>{t.lead ? `${t.lead}: ${t.head}` : t.head}</Display>
        {t.sub || t.range ? (
          <p className="mt-1.5 text-[13px] font-medium" style={{ color: C.ink }}>
            {[t.sub ? sentenceCase(t.sub) : null, t.range].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>
      <div className="flex min-h-[48px] flex-1 items-center gap-[3px] py-3">
        {peaks.map((p, i) => (
          <span
            key={i}
            className="min-w-0 flex-1 rounded-full"
            style={{ height: `${Math.max(8, p * 100)}%`, background: i / bars < progress ? C.orange : C.ink }}
          />
        ))}
      </div>
      <div className="flex shrink-0 items-center justify-between">
        <button
          type="button"
          disabled={!ctx.interactive}
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: C.inkSurface }}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <rect x="2.5" y="2" width="3" height="10" rx="1" fill={C.lime} />
              <rect x="8.5" y="2" width="3" height="10" rx="1" fill={C.lime} />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path d="M3.5 2v10l8-5-8-5Z" fill={C.lime} />
            </svg>
          )}
        </button>
        <span data-el={ROLE.duration} className="text-[17px] font-medium tabular-nums" style={{ color: C.ink }}>
          {clock(d.durationMs)}
        </span>
      </div>
      {ctx.interactive ? <audio ref={audioRef} src={d.publicUrl} preload="none" /> : null}
    </div>
  );
}

// ─── Website ────────────────────────────────────────────────────────────────

/** The site's name is the kicker, its page title the headline, the preview in the well. */
export function WebsiteBody({ ctx }: Ctx) {
  const payload = ctx.item.payload;
  const site = payload.type === "website" ? payload.data : null;
  const preview = useWebsitePreview(ctx.item.artifact.id, site?.url ?? "", site?.previewImageUrl);
  if (payload.type !== "website" || !payload.data.previewImageUrl || preview.failed) {
    return <InsetBody ctx={ctx} />;
  }
  const d = payload.data;
  // The title is set as written, even when it repeats the site's name.
  const title = ctx.item.artifact.title;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MediaHead
        title={title}
        kicker={
          <span data-el={ROLE.domain} className="inline-flex items-center gap-2">
            {d.faviconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.faviconUrl} alt="" className="h-[18px] w-[18px] rounded-[4px] bg-white" />
            ) : null}
            {d.domainLabel}
          </span>
        }
      />
      <Well>
        <a href={ctx.interactive ? d.url : undefined} target="_blank" rel="noreferrer" className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.previewImageUrl} alt="" onError={preview.onError} className="h-full w-full object-cover object-top" />
        </a>
      </Well>
    </div>
  );
}
