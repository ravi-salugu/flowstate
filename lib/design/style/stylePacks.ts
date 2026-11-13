import { canvasColors, darkCanvasColors } from "@/lib/design/tokens";
import type {
  ArtifactStyleCategoryTones,
  ArtifactStylePreset,
} from "@/lib/design/style/types";
import type { ArtifactCategoryId } from "@/lib/design/theme/types";

/**
 * Artifact style pack registry. Packs are add-only: a new visual language
 * (from a new reference) is a new entry here plus a scoped rule block in
 * app/styles/artifact-styles.css — no component changes.
 */

export const DEFAULT_ARTIFACT_STYLE_ID = "vanilla";

/**
 * The pack every newly created canvas starts in — blank canvases, guests'
 * first canvas, and playground imports. Distinct from the vanilla baseline
 * above, which stays the fallback for legacy snapshots saved without a style.
 */
export const NEW_CANVAS_ARTIFACT_STYLE_ID = "frost";

/**
 * Vanilla documents the current factory look (ground truth for a future
 * full-token refactor). It is never resolved into CSS — the resolver
 * short-circuits so vanilla stays a structural no-op.
 */
const VANILLA: ArtifactStylePreset = {
  id: DEFAULT_ARTIFACT_STYLE_ID,
  name: "Vanilla",
  description: "The current Flowstate look — quiet chrome revealed on hover.",
  strokeWidth: "1px",
  radius: "var(--canvas-radius-md)",
  controlStrokeWidth: "1px",
  checkboxStrokeWidth: "1px",
  pillRadius: "999px",
  density: 1,
  showKindLabel: false,
  selectedRing: "none",
  selectedChin: "none",
  tilt: "0deg",
  hoverLift: "0px, 0px",
  pressPush: "0px, 0px",
  light: {
    cardFill: "#FFFFFF",
    stroke: "#E6E4DF",
    ambientShadow: "var(--canvas-artifact-shadow)",
    chinShadow: "none",
    headerBg: "transparent",
    headerRule: "none",
    canvasBg: null,
    canvasDot: null,
    hardShadow: "none",
  },
  dark: {
    cardFill: darkCanvasColors.card,
    stroke: darkCanvasColors.border,
    ambientShadow: "var(--canvas-artifact-shadow)",
    chinShadow: "none",
    headerBg: "transparent",
    headerRule: "none",
    canvasBg: null,
    canvasDot: null,
    hardShadow: "none",
  },
};

/**
 * Brut — neobrutalism without the outline: no card stroke in either mode,
 * just the hard zero-blur offset shadow, flat opaque fills, and per-category
 * loud sticker headers (colored in app/styles/artifact-styles.css). The
 * canvas backdrop is left to the active theme (no pack recolor). Cards tilt a
 * hair and physically lift on hover / press down on click. Dark mode swaps
 * ink for bone white and shadows for hot pink.
 */
const NEOBRUTALISM: ArtifactStylePreset = {
  id: "neobrutalism",
  name: "Brut",
  description:
    "Neobrutalism — no strokes, hard offset shadows, loud flat color.",
  accent: canvasColors.brutPop,
  strokeWidth: "0px",
  radius: "4px",
  controlStrokeWidth: "2px",
  checkboxStrokeWidth: "2.5px",
  pillRadius: "4px",
  density: 1,
  showKindLabel: true,
  selectedRing: "0 0 0 3px rgb(var(--canvas-accent))",
  selectedChin: "8px 8px 0 rgb(var(--canvas-accent-deep))",
  tilt: "-0.5deg",
  hoverLift: "-2px, -2px",
  pressPush: "2px, 2px",
  light: {
    cardFill: "#FFFFFF",
    stroke: canvasColors.brutInk,
    ambientShadow: "none",
    chinShadow: "none",
    headerBg: canvasColors.brutSun,
    headerRule: `3px solid ${canvasColors.brutInk}`,
    canvasBg: null,
    canvasDot: null,
    hardShadow: `6px 6px 0 ${canvasColors.brutInk}`,
  },
  dark: {
    cardFill: "#241F35",
    stroke: darkCanvasColors.brutInk,
    ambientShadow: "none",
    chinShadow: "none",
    headerBg: darkCanvasColors.brutSun,
    headerRule: `3px solid ${darkCanvasColors.brutInk}`,
    canvasBg: null,
    canvasDot: null,
    hardShadow: `6px 6px 0 ${darkCanvasColors.brutPop}`,
  },
};

/**
 * Liquid Glass — Apple's WWDC 2025 material: translucent blurred glass with
 * specular edge highlights and large continuous corners. Fill hexes carry no
 * alpha (token contract) — translucency composes at consumption via
 * cardFillAlpha; the blur lives on --canvas-artifact-backdrop-filter and is
 * applied on exactly one element per node. No pack accent: glass adapts to
 * the active theme accent. Material and backdrop are pure greys (the canvas
 * stays neutral in every pack); the backdrop sits a step off the default
 * canvas grey so the frosted fill still separates from it.
 */
const LIQUID_GLASS: ArtifactStylePreset = {
  id: "liquid-glass",
  name: "Liquid Glass",
  description:
    "Apple-style liquid glass — translucent blurred material, specular edges, continuous corners.",
  backdropFilter: "blur(20px) saturate(1.7)",
  strokeWidth: "1px",
  radius: "24px",
  controlStrokeWidth: "1px",
  checkboxStrokeWidth: "1.5px",
  pillRadius: "999px",
  density: 1,
  showKindLabel: false,
  selectedRing: "0 0 0 3px rgb(var(--canvas-accent) / 0.38)",
  selectedChin: "none",
  tilt: "0deg",
  hoverLift: "0px, 0px",
  pressPush: "0px, 0px",
  light: {
    cardFill: "#FAFAFA",
    cardFillAlpha: 0.55,
    stroke: "#FFFFFF",
    ambientShadow:
      "0 12px 32px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.07)",
    chinShadow: "none",
    innerHighlight:
      "inset 0 1px 0 rgba(255, 255, 255, 0.85), inset 0 0 0 1px rgba(255, 255, 255, 0.3)",
    headerBg: "rgba(255, 255, 255, 0.35)",
    headerRule: "1px solid rgba(255, 255, 255, 0.55)",
    canvasBg: "#E3E3E3",
    canvasDot: "#9D9D9D",
    hardShadow: "none",
  },
  dark: {
    cardFill: "#2A2A2A",
    cardFillAlpha: 0.5,
    stroke: "#939393",
    ambientShadow:
      "0 12px 32px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.35)",
    chinShadow: "none",
    innerHighlight:
      "inset 0 1px 0 rgba(255, 255, 255, 0.28), inset 0 0 0 1px rgba(255, 255, 255, 0.1)",
    headerBg: "rgba(255, 255, 255, 0.06)",
    headerRule: "1px solid rgba(255, 255, 255, 0.12)",
    canvasBg: "#131313",
    canvasDot: "#414141",
    hardShadow: "none",
  },
};

/* -------------------------------------------------------------------------- */
/* Color-led packs                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Bento — the solid tonal system (nue / finance-bento references). One hue
 * per artifact category, and EVERY card is that hue at full strength, header
 * band included: a saturated fill edge to edge with light ink and huge type.
 * There is no pale card role any more — `pale` / `ink` / `muted` stay in the
 * table as the derivation source for hairlines, stages and the contrast test,
 * but app/styles/artifact-styles.css binds every node to the solid pair.
 * Anything painted ON a card (chips, table head, step blocks, rules) inverts
 * to the on-solid tone. All solids share L≈0.36 so eight hues still read as
 * one family; dark mode brightens them and flips the ink to a deep tint of
 * the hue. Every text pair is AA-checked in stylePacks.contrast.test.
 */
const BENTO_LIGHT_CATEGORIES: Record<ArtifactCategoryId, ArtifactStyleCategoryTones> = {
  data:      { solid: "#2B5BE0", onSolid: "#FFFFFF", onSolidMuted: "#E1E8FB", pale: "#E3E9FC", ink: "#17265C", muted: "#4A5A8E", vivid: "#2B5BE0" },
  viz:       { solid: "#0E7C9A", onSolid: "#FFFFFF", onSolidMuted: "#FAFCFD", pale: "#DCF1F7", ink: "#0B3A48", muted: "#3B6A78", vivid: "#0E7C9A" },
  geo:       { solid: "#1F7A4C", onSolid: "#FFFFFF", onSolidMuted: "#E9F2ED", pale: "#DDF3E6", ink: "#123D2A", muted: "#3C6B52", vivid: "#1F7A4C" },
  media:     { solid: "#C93D36", onSolid: "#FFFFFF", onSolidMuted: "#FDF7F7", pale: "#FBE3E0", ink: "#5A1F1B", muted: "#8A4540", vivid: "#C93D36" },
  docs:      { solid: "#F2C230", onSolid: "#2B2105", onSolidMuted: "#57440E", pale: "#FBF0C8", ink: "#4A3708", muted: "#7A5E14", vivid: "#F2C230" },
  dev:       { solid: "#4B5563", onSolid: "#FFFFFF", onSolidMuted: "#D7DADD", pale: "#E7EAEF", ink: "#1F2937", muted: "#4B5563", vivid: "#4B5563" },
  planning:  { solid: "#C92C6D", onSolid: "#FFFFFF", onSolidMuted: "#FCF2F6", pale: "#FCE4EF", ink: "#5C1435", muted: "#8E3560", vivid: "#C92C6D" },
  discourse: { solid: "#5B2DEE", onSolid: "#FFFFFF", onSolidMuted: "#DBD1FB", pale: "#EAE4FB", ink: "#2A1A6E", muted: "#5A4A9E", vivid: "#5B2DEE" },
};

const BENTO_DARK_CATEGORIES: Record<ArtifactCategoryId, ArtifactStyleCategoryTones> = {
  data:      { solid: "#4F7BFF", onSolid: "#0A1235", onSolidMuted: "#0D163D", pale: "#1C2340", ink: "#DCE4FF", muted: "#A4B2E6", vivid: "#4F7BFF" },
  viz:       { solid: "#22B0D3", onSolid: "#06232B", onSolidMuted: "#0B3C49", pale: "#16303A", ink: "#D6F1F9", muted: "#93C6D6", vivid: "#22B0D3" },
  geo:       { solid: "#34B57A", onSolid: "#06241A", onSolidMuted: "#0E3E2B", pale: "#173229", ink: "#D6F5E4", muted: "#93CDB0", vivid: "#34B57A" },
  media:     { solid: "#F0655C", onSolid: "#3A0E0B", onSolidMuted: "#4C1713", pale: "#3A2220", ink: "#FBE0DD", muted: "#E2A39E", vivid: "#F0655C" },
  docs:      { solid: "#F5C842", onSolid: "#2B2105", onSolidMuted: "#574612", pale: "#3A3116", ink: "#FBF0C8", muted: "#D9C27A", vivid: "#F5C842" },
  dev:       { solid: "#8B96A8", onSolid: "#0F141B", onSolidMuted: "#252B34", pale: "#262B33", ink: "#E5E9EF", muted: "#AEB6C2", vivid: "#8B96A8" },
  planning:  { solid: "#F0569A", onSolid: "#3A0B21", onSolidMuted: "#49112B", pale: "#3A1E2C", ink: "#FCE0EC", muted: "#E39EBF", vivid: "#F0569A" },
  discourse: { solid: "#8B6BFF", onSolid: "#140A3A", onSolidMuted: "#1B1046", pale: "#2A2344", ink: "#EAE4FB", muted: "#B9ACE8", vivid: "#8B6BFF" },
};

const BENTO: ArtifactStylePreset = {
  id: "bento",
  name: "Bento",
  description:
    "Tonal bento — every card is one solid category color, edge to edge, no strokes.",
  strokeWidth: "0px",
  radius: "36px",
  controlStrokeWidth: "0px",
  checkboxStrokeWidth: "2px",
  pillRadius: "999px",
  density: 1,
  showKindLabel: true,
  // Selected ring is category-toned, so it lives in the stylesheet (per-node
  // --art-* vars are out of scope for pack tokens).
  selectedRing: "none",
  selectedChin: "none",
  tilt: "0deg",
  hoverLift: "0px, -1px",
  pressPush: "0px, 0px",
  typography: {
    // One face per canvas: display + eyebrow inherit the canvas font.
    displayFamily: "inherit",
    displayWeight: "700",
    displayTracking: "-0.03em",
    displaySize: "120px",
    quoteSize: "30px",
    eyebrowFamily: "inherit",
    eyebrowTracking: "0.08em",
  },
  previewSwatches: ["#5B2DEE", "#0E7C9A", "#F2C230"],
  light: {
    cardFill: "#E3E9FC",
    stroke: "#D6D6D6",
    ambientShadow:
      "0 8px 24px rgba(0, 0, 0, 0.10), 0 1px 2px rgba(0, 0, 0, 0.06)",
    chinShadow: "none",
    headerBg: "transparent",
    headerRule: "none",
    canvasBg: "#DCDCDC",
    canvasDot: "#9C9C9C",
    hardShadow: "none",
    categories: BENTO_LIGHT_CATEGORIES,
    surfaceBorder: "#D6D6D6",
    canvasConnector: "#8F8F8F",
    chart: {
      series: ["#0E7C9A", "#2B5BE0", "#5B2DEE", "#C92C6D", "#F2C230", "#1F7A4C", "#C93D36"],
      ink: "#0B3A48",
      muted: "#3B6A78",
      grid: "rgba(11, 58, 72, 0.14)",
      bg: "#DCF1F7",
    },
    timeline: ["#C92C6D", "#E58BB4", "#8E3560", "#F4BFD6"],
  },
  dark: {
    cardFill: "#1C2340",
    stroke: "#2B2B2B",
    ambientShadow: "0 10px 28px rgba(0, 0, 0, 0.55), 0 1px 2px rgba(0, 0, 0, 0.4)",
    chinShadow: "none",
    headerBg: "transparent",
    headerRule: "none",
    canvasBg: "#161616",
    canvasDot: "#3D3D3D",
    hardShadow: "none",
    categories: BENTO_DARK_CATEGORIES,
    surfaceBorder: "#2B2B2B",
    canvasConnector: "#5F5F5F",
    chart: {
      series: ["#22B0D3", "#4F7BFF", "#8B6BFF", "#F0569A", "#F5C842", "#34B57A", "#F0655C"],
      ink: "#D6F1F9",
      muted: "#93C6D6",
      grid: "rgba(214, 241, 249, 0.14)",
      bg: "#16303A",
    },
    timeline: ["#F0569A", "#B23C70", "#F9A3C8", "#7A2A4E"],
  },
};

/**
 * Frost — Artifact Studio's Style D brought to the canvas. White frost cards
 * lit from one soft light at the top-left: a sheen pooled in the corner, a
 * bright 1px rim along the top edge, and a three-layer shadow (contact, near,
 * ambient) that falls down and away. No strokes — the light separates. Ink is
 * near-black and lime is the one accent, used as a solid mark (today, done,
 * the active pill), never a gradient. The theme accent is NOT replaced: lime
 * carries no white-text guarantee, so app chrome keeps the brand accent and
 * the stylesheet paints lime through its own --frost-* vars. Dark mode turns
 * the frost into smoked glass with the same light at a fraction of its
 * strength; the lime stays exactly as it is.
 *
 * Frost-only material vars (gradient stops, rim, sheen, lime) live in
 * app/styles/artifact-styles.css — they're literal CSS, not hex tokens.
 */
const FROST: ArtifactStylePreset = {
  id: "frost",
  name: "Frost",
  description:
    "Style D — white frost cards lit from the top-left, soft falling shadows, lime the one accent.",
  strokeWidth: "0px",
  radius: "44px",
  controlStrokeWidth: "0px",
  checkboxStrokeWidth: "1.5px",
  pillRadius: "999px",
  density: 1,
  showKindLabel: false,
  // Frost selects with an ink outline set off the card (stylesheet), not an
  // accent ring.
  selectedRing: "none",
  selectedChin: "none",
  tilt: "0deg",
  hoverLift: "0px, -3px",
  pressPush: "0px, 0px",
  bodyFamily: "frost",
  previewSwatches: ["#F7F7F6", "#DDF23F", "#1C1C1E"],
  light: {
    cardFill: "#F3F3F1",
    stroke: "#FFFFFF",
    ambientShadow:
      "0 1px 1px rgba(24, 24, 40, 0.04), 0 8px 18px -8px rgba(24, 24, 40, 0.09), 0 34px 60px -30px rgba(24, 24, 40, 0.2)",
    chinShadow: "none",
    innerHighlight:
      "inset 0 1px 0 rgba(255, 255, 255, 0.95), inset 0 0 0 1px rgba(255, 255, 255, 0.6)",
    headerBg: "transparent",
    headerRule: "none",
    canvasBg: "#E4E4E2",
    canvasDot: "#B4B4B0",
    hardShadow: "none",
    surfaceInk: "#1C1C1E",
    surfaceMuted: "#5C5C60",
    surfaceBorder: "#D9D9D6",
    canvasConnector: "#7E7E7A",
    chart: {
      series: ["#1C1C1E", "#C4DB1E", "#8C9386", "#5F665A", "#C8CBC2", "#A3B22E", "#DADCD4"],
      ink: "#1C1C1E",
      muted: "#5C5C60",
      grid: "rgba(28, 28, 30, 0.08)",
      bg: "#F3F3F1",
    },
    timeline: ["#1C1C1E", "#C4DB1E", "#8C9386", "#5F665A"],
    connector: {
      line: "rgba(28, 28, 30, 0.4)",
      emphasis: "rgba(28, 28, 30, 0.72)",
      active: "#C4DB1E",
      plugLink: "rgba(28, 28, 30, 0.4)",
      dragPreview: "rgba(28, 28, 30, 0.55)",
      dragValid: "#C4DB1E",
    },
  },
  dark: {
    cardFill: "#26262A",
    stroke: "#3D3D44",
    ambientShadow:
      "0 1px 1px rgba(0, 0, 0, 0.3), 0 8px 18px -8px rgba(0, 0, 0, 0.45), 0 34px 60px -30px rgba(0, 0, 0, 0.6)",
    chinShadow: "none",
    innerHighlight:
      "inset 0 1px 0 rgba(255, 255, 255, 0.13), inset 0 0 0 1px rgba(255, 255, 255, 0.06)",
    headerBg: "transparent",
    headerRule: "none",
    canvasBg: "#18181B",
    canvasDot: "#3A3A3F",
    hardShadow: "none",
    surfaceInk: "#F2F2F0",
    surfaceMuted: "#A6A6A4",
    surfaceBorder: "#36363B",
    canvasConnector: "#7C7C82",
    chart: {
      series: ["#F2F2F0", "#DDF23F", "#8C9386", "#B5BCAE", "#5F665A", "#A3B22E", "#4A4A50"],
      ink: "#F2F2F0",
      muted: "#A6A6A4",
      grid: "rgba(242, 242, 240, 0.1)",
      bg: "#26262A",
    },
    timeline: ["#DDF23F", "#F2F2F0", "#8C9386", "#B5BCAE"],
    connector: {
      line: "rgba(242, 242, 240, 0.34)",
      emphasis: "rgba(242, 242, 240, 0.68)",
      active: "#DDF23F",
      plugLink: "rgba(242, 242, 240, 0.34)",
      dragPreview: "rgba(242, 242, 240, 0.5)",
      dragValid: "#DDF23F",
    },
  },
};

export const ARTIFACT_STYLE_PACKS: readonly ArtifactStylePreset[] = [
  VANILLA,
  NEOBRUTALISM,
  LIQUID_GLASS,
  FROST,
  BENTO,
];

export function getArtifactStylePack(id: string): ArtifactStylePreset {
  return (
    ARTIFACT_STYLE_PACKS.find((pack) => pack.id === id) ?? VANILLA
  );
}
