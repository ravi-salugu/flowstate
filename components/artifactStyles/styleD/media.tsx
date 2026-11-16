"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CurrentBody } from "../current";
import { useWebsitePreview } from "../useWebsitePreview";
import type { ArtifactRenderContext } from "../types";
import { GALLERY_VISIBLE, ROLE } from "../textSpec";
import { D, inkA, DISPLAY, FONT, GLASS, MEDIA_INSET, MEDIA_RADIUS, PAD, Sub, Title, TitleBlock, sentenceCase, sizeFor, splitTitle, useOn } from "./tokens";

/**
 * Media on frost. One inset rules the card: the kicker, the title and the
 * picture well all start MEDIA_INSET from the card's edge, and the well's
 * corners (MEDIA_RADIUS) stay concentric with the card's. Controls over
 * pictures are glass — they blur what's under them. The ⋯ circle in the
 * corner is the card's only control; nothing else sits beside the title.
 */

type Ctx = { ctx: ArtifactRenderContext };

/**
 * The title over the media: its lead as a quiet kicker, the head, then the
 * rest of its words — all one part. A `kicker` that isn't the title's own
 * (a website's domain) is its own part, `kickerRole`.
 */
export function MediaHead({ title, kicker, kickerRole }: { title: string; kicker?: ReactNode; kickerRole?: string }) {
  const t = splitTitle(title);
  const sub = [t.sub ? sentenceCase(t.sub) : null, t.range].filter(Boolean).join(" · ");
  return (
    <div className="flex shrink-0 items-start gap-5" style={{ padding: `${MEDIA_INSET - 2}px ${MEDIA_INSET}px ${MEDIA_INSET - 6}px` }}>
      <div data-el={ROLE.title} className="flex min-w-0 flex-1 flex-col gap-1.5">
        {kicker || t.lead ? (
          <Sub el={kicker ? kickerRole : undefined} size={kicker ? 18 : 15} color={D.ink} lines={1}>
            {kicker ?? t.lead}
          </Sub>
        ) : null}
        <Title size={sizeFor(t.head, [[18, 32], [30, 28], [48, 25]], 22)}>{kicker && t.lead ? `${t.lead}: ${t.head}` : t.head}</Title>
        {sub ? <Sub size={15}>{sub}</Sub> : null}
      </div>
    </div>
  );
}

/**
 * The picture well: inset, concentric, with a faint inner shadow so the
 * picture sits *in* the card. Its content is laid over it absolutely: in a
 * hugging card the well's height comes from flexing to the card's least
 * height, which is not definite, so a child's `h-full` would resolve to
 * nothing — an inset-0 box always has the well's real size.
 */
export function Well({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{
        margin: `0 ${MEDIA_INSET}px ${MEDIA_INSET}px`,
        borderRadius: MEDIA_RADIUS,
        background: D.well,
        boxShadow: `0 1px 0 ${D.rim}, 0 0 0 1px ${inkA(4)}`,
      }}
    >
      <div className="absolute inset-0 flex flex-col">{children}</div>
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ borderRadius: "inherit", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.05), inset 0 2px 8px rgba(0,0,0,0.06)" }} />
    </div>
  );
}

/**
 * The well for content that has a size of its own (the repo explorer's
 * stage): the same sunken surface, but its content sits in flow, so a
 * hugging card grows to hold all of it instead of clipping it.
 */
export function FlowWell({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative flex flex-col overflow-hidden"
      style={{
        margin: `0 ${MEDIA_INSET}px ${MEDIA_INSET}px`,
        borderRadius: MEDIA_RADIUS,
        background: D.well,
        boxShadow: `0 1px 0 ${D.rim}, 0 0 0 1px ${inkA(4)}`,
      }}
    >
      {children}
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ borderRadius: "inherit", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.05), inset 0 2px 8px rgba(0,0,0,0.06)" }} />
    </div>
  );
}

/** A GitHub repo: its title, then the explorer (hub, panels, curves) whole in the well. */
export function RepoBody({ ctx }: Ctx) {
  return (
    <div className="flex flex-col">
      <MediaHead title={ctx.item.artifact.title} />
      <FlowWell>
        <LiveBody ctx={ctx} />
      </FlowWell>
    </div>
  );
}

/** Title above, the live artifact (map, street view, 3D, embed, widget) in the well. */
export function InsetBody({ ctx }: Ctx) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MediaHead title={ctx.item.artifact.title} />
      <Well>
        <LiveBody ctx={ctx} />
      </Well>
    </div>
  );
}

/** The live body. A map's only text is the label of its place, which is the map's Place part. */
function LiveBody({ ctx }: Ctx) {
  const live = ctx.liveBody ?? <CurrentBody ctx={ctx} />;
  if (ctx.item.variant !== "map") return <>{live}</>;
  return (
    <div data-el={ROLE.place} className="flex min-h-0 flex-1 flex-col">
      {live}
    </div>
  );
}

// ─── Images ─────────────────────────────────────────────────────────────────

export function ImagesBody({ ctx }: Ctx) {
  const payload = ctx.item.payload;
  if (payload.type !== "images") return <InsetBody ctx={ctx} />;
  const items = payload.data.items.filter((i) => i.url || i.thumb);
  const shown = items.slice(0, GALLERY_VISIBLE);
  // Counted from the gallery itself: everything past the visible tiles.
  const total = payload.data.items.length;
  const more = total > GALLERY_VISIBLE ? total - shown.length : 0;
  const src = (i: (typeof items)[number]) => i.thumb || i.url;
  const alt = (i: (typeof items)[number]) => (i.kind === "image" ? i.alt ?? "" : i.title ?? "");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MediaHead title={ctx.item.artifact.title} />
      <div
        className="grid min-h-0 flex-1 gap-2"
        style={{
          margin: `0 ${MEDIA_INSET}px ${MEDIA_INSET}px`,
          ...(shown.length >= 3 ? { gridTemplateColumns: "1.7fr 1fr", gridTemplateRows: "1fr 1fr" } : { gridTemplateColumns: `repeat(${shown.length}, 1fr)` }),
        }}
      >
        {shown.map((item, i) => {
          // Outer corners follow the card; inner corners are small.
          const n = shown.length;
          const R = MEDIA_RADIUS;
          const r = 10;
          const radius =
            n >= 3
              ? i === 0
                ? `${r}px ${r}px ${r}px ${R}px`
                : i === 1
                  ? `${r}px`
                  : `${r}px ${r}px ${R}px ${r}px`
              : n === 1
                ? `${r}px ${r}px ${R}px ${R}px`
                : i === 0
                  ? `${r}px ${r}px ${r}px ${R}px`
                  : `${r}px ${r}px ${R}px ${r}px`;
          return (
            <div key={item.url + i} className="relative min-h-0 overflow-hidden" style={{ gridRow: n >= 3 && i === 0 ? "span 2" : undefined, borderRadius: radius }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src(item)} alt={alt(item)} className="h-full w-full object-cover" loading="lazy" />
              {more > 0 && i === n - 1 ? (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span data-el={ROLE.moreCount} className="rounded-full px-5 py-2.5 text-[29px]" style={{ ...DISPLAY, ...GLASS, color: D.white, letterSpacing: "-0.02em" }}>
                    +{more}
                  </span>
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Video ──────────────────────────────────────────────────────────────────

function PlayButton({ size = 84 }: { size?: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-full" style={{ width: size, height: size, ...GLASS }}>
      <svg width={size * 0.32} height={size * 0.32} viewBox="0 0 24 24" aria-hidden style={{ marginLeft: size * 0.04 }}>
        <path d="M7 4.5v15l12.5-7.5L7 4.5Z" fill={D.white} stroke={D.white} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function VideoBody({ ctx }: Ctx) {
  const [playing, setPlaying] = useState(false);
  const payload = ctx.item.payload;
  const first = payload.type === "video" ? payload.data.items[0] : payload.type === "images" ? payload.data.items.find((i) => i.kind === "youtube") : undefined;
  const thumb = first?.thumb;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MediaHead title={ctx.item.artifact.title} />
      <Well>
        {playing || !thumb ? (
          <CurrentBody ctx={ctx} />
        ) : (
          <button type="button" disabled={!ctx.interactive} onClick={() => setPlaying(true)} className="relative h-full w-full" aria-label="Play video">
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

/**
 * On frost: the title in ink, the waveform as ink bars with the played part
 * solid, and the play disc as the card's one lime element. On glow (Aurora)
 * the bars and disc are white glass.
 */
export function AudioBody({ ctx }: Ctx) {
  const payload = ctx.item.payload;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const on = useOn();

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
  const bars = 34;
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ padding: `${PAD - 6}px ${PAD - 4}px ${PAD - 10}px` }}>
      <TitleBlock title={ctx.item.artifact.title} sizes={[[16, 30], [28, 26]]} fallback={23} color={on.title} subColor={on.sub} subSize={16} gap={4} />
      {/* A fixed height: the bars are percentages of it, and a hugging card has no height of its own to give them. */}
      <div className="flex min-w-0 flex-1 items-center gap-[3px] py-5" style={{ minHeight: 120 }}>
        {peaks.map((p, i) => (
          <span
            key={i}
            className="min-w-0 flex-1 rounded-full"
            style={{
              height: Math.max(6, p * 80),
              background: on.light ? (i / bars < progress ? D.white : "rgba(255,255,255,0.5)") : i / bars < progress ? D.ink : inkA(20),
              boxShadow: on.glow && i / bars < progress ? "0 0 8px rgba(255,255,255,0.7)" : undefined,
            }}
          />
        ))}
      </div>
      <div className="flex shrink-0 items-center justify-between">
        <button
          type="button"
          disabled={!ctx.interactive}
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="inline-flex h-12 w-12 items-center justify-center rounded-full"
          style={on.glow ? { ...GLASS, color: D.white } : { background: D.accent, color: D.accentInk, boxShadow: `0 4px 12px -3px ${D.accentShadow}` }}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <rect x="2.5" y="2" width="3" height="10" rx="1" fill="currentColor" />
              <rect x="8.5" y="2" width="3" height="10" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path d="M4 2v10l8-5-8-5Z" fill="currentColor" />
            </svg>
          )}
        </button>
        <span data-el={ROLE.duration} className="text-[18px] tabular-nums" style={{ ...FONT, color: on.title }}>
          {clock(d.durationMs)}
        </span>
      </div>
      {ctx.interactive ? <audio ref={audioRef} src={d.publicUrl} preload="none" /> : null}
    </div>
  );
}

// ─── Website ────────────────────────────────────────────────────────────────

export function WebsiteBody({ ctx }: Ctx) {
  const payload = ctx.item.payload;
  const site = payload.type === "website" ? payload.data : null;
  const preview = useWebsitePreview(ctx.item.artifact.id, site?.url ?? "", site?.previewImageUrl);
  if (payload.type !== "website" || !payload.data.previewImageUrl || preview.failed) {
    return <InsetBody ctx={ctx} />;
  }
  const d = payload.data;
  // The title as written — even when it repeats the domain.
  const title = ctx.item.artifact.title;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MediaHead
        title={title}
        kickerRole={ROLE.domain}
        kicker={
          <span className="inline-flex items-center gap-2">
            {d.faviconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.faviconUrl} alt="" className="h-[16px] w-[16px] rounded-[4px] bg-white" />
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
