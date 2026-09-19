"use client";

import { ArtifactContentStage } from "@/components/artifacts/ArtifactContentStage";
import type { ArtifactPayload } from "@/lib/artifactTypes";

/**
 * How much room the figure can claim. `value` is a string on purpose (see
 * transcriptArtifacts) and is not always a numeral — "The only theatre of its
 * format" has to read as the headline too, so the display type steps down
 * as the figure gets wordier instead of overflowing the card. Style packs read
 * this off `data-stat-figure` and pick their own clamp per step.
 */
function figureLength(value: string): "xl" | "lg" | "md" | "sm" {
  const len = value.trim().length;
  if (len <= 5) return "xl";
  if (len <= 10) return "lg";
  if (len <= 22) return "md";
  return "sm";
}

/**
 * One spoken figure. A single number in a chart reads as a broken chart; here
 * the number is the whole design, and the delta (when there is one) sits under
 * it as a plain from→to rather than as an implied trend line.
 */

export function StatArtifactContent({
  payload,
  fill = false,
  sidebar = false,
  artifactId,
}: {
  payload: Extract<ArtifactPayload, { type: "stat" }>;
  fill?: boolean;
  sidebar?: boolean;
  artifactId?: string;
}) {
  const { value, unit, label, delta, source, speaker } = payload.data;
  const attribution = [speaker, source].filter(Boolean).join(" · ");

  return (
    <ArtifactContentStage fill={fill} artifactId={artifactId}>
      <div
        className="artifact-stat flex h-full flex-col justify-center gap-2 px-5 py-4"
        data-stat-figure={figureLength(value)}
      >
        <div className="artifact-stat-figure flex items-baseline gap-1.5">
          <span
            className={`artifact-stat-value font-semibold leading-none tracking-tight text-canvas-ink ${
              sidebar ? "text-[28px]" : "text-[44px]"
            }`}
          >
            {value}
          </span>
          {unit ? (
            <span className="artifact-stat-unit text-canvas-body font-medium text-canvas-muted">
              {unit}
            </span>
          ) : null}
        </div>

        <p className="artifact-stat-label text-canvas-body leading-snug text-canvas-ink/80">{label}</p>

        {delta ? (
          <p className="artifact-stat-delta flex items-center gap-1.5 text-canvas-caption tabular-nums text-canvas-muted">
            <span>{delta.from}</span>
            <span aria-hidden className="opacity-50">
              →
            </span>
            <span className="font-medium text-canvas-ink/70">{delta.to}</span>
          </p>
        ) : null}

        {attribution ? (
          <p className="artifact-stat-attribution text-canvas-caption text-canvas-muted opacity-70">
            {attribution}
          </p>
        ) : null}
      </div>
    </ArtifactContentStage>
  );
}
