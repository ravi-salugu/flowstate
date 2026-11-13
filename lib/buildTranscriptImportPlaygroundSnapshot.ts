import type { CanvasAsset } from "@/lib/store";
import { transcriptWebsitePreview } from "@/lib/transcriptImport/websitePreviews";
import {
  buildCanvasSnapshot,
  type CanvasSnapshot,
} from "@/lib/canvasSnapshot";
import { NEW_CANVAS_ARTIFACT_STYLE_ID } from "@/lib/design/style/stylePacks";
import { buildDesignToolsCanvasSection } from "@/lib/transcriptImport/buildDesignToolsCanvasSection";
import { buildYcInterviewCanvasSection } from "@/lib/transcriptImport/buildYcInterviewCanvasSection";
import { buildHubermanCanvasSection } from "@/lib/transcriptImport/buildHubermanCanvasSection";
import { buildRanaDaggubatiCanvasSection } from "@/lib/transcriptImport/buildRanaDaggubatiCanvasSection";
import { buildJagadambaCanvasSection } from "@/lib/transcriptImport/buildJagadambaCanvasSection";
import { buildCazualTalkSahilAggarwalCanvasSection } from "@/lib/transcriptImport/buildCazualTalkSahilAggarwalCanvasSection";
import { buildHubermanRajShamaniCanvasSection } from "@/lib/transcriptImport/buildHubermanRajShamaniCanvasSection";
import { buildSchoolCastVanitaUppalCanvasSection } from "@/lib/transcriptImport/buildSchoolCastVanitaUppalCanvasSection";
import { buildMeenakshiAnantramCanvasSection } from "@/lib/transcriptImport/buildMeenakshiAnantramCanvasSection";
import { buildLightconeEmergentCanvasSection } from "@/lib/transcriptImport/buildLightconeEmergentCanvasSection";
import { buildPrashantKishorCanvasSection } from "@/lib/transcriptImport/buildPrashantKishorCanvasSection";
import { buildKunalShahHiringCanvasSection } from "@/lib/transcriptImport/buildKunalShahHiringCanvasSection";
import { buildNithinKamathRiskCanvasSection } from "@/lib/transcriptImport/buildNithinKamathRiskCanvasSection";
import { buildFreshMenuCanvasSection } from "@/lib/transcriptImport/buildFreshMenuCanvasSection";
import { buildAllariNareshCanvasSection } from "@/lib/transcriptImport/buildAllariNareshCanvasSection";
import { buildSamAltmanCanvasSection } from "@/lib/transcriptImport/buildSamAltmanCanvasSection";
import { DESIGN_TOOLS_HISTORY_TRANSCRIPT } from "@/lib/transcriptImport/designToolsHistory";
import {
  HUBERMAN_NEUROPLASTICITY_SOURCE_URL,
  HUBERMAN_NEUROPLASTICITY_TRANSCRIPT,
} from "@/lib/transcriptImport/hubermanNeuroplasticity";
import {
  YC_INTERVIEW_TIPS_TRANSCRIPT,
  YC_INTERVIEW_TIPS_VIDEO_URL,
} from "@/lib/transcriptImport/ycInterviewTips";
import {
  RANA_DAGGUBATI_INTERVIEW_TRANSCRIPT,
  RANA_DAGGUBATI_VIDEO_URL,
} from "@/lib/transcriptImport/ranaDaggubatiInterview";
import {
  JAGADAMBA_THEATRE_TRANSCRIPT,
  JAGADAMBA_THEATRE_VIDEO_URL,
} from "@/lib/transcriptImport/jagadambaTheatre";
import {
  LIGHTCONE_EMERGENT_TRANSCRIPT,
  LIGHTCONE_EMERGENT_VIDEO_URL,
} from "@/lib/transcriptImport/lightconeEmergent";
import {
  PRASHANT_KISHOR_INTERVIEW_TRANSCRIPT,
  PRASHANT_KISHOR_VIDEO_URL,
} from "@/lib/transcriptImport/prashantKishorInterview";
import {
  HUBERMAN_RAJ_SHAMANI_TRANSCRIPT_EXCERPTS,
  HUBERMAN_RAJ_SHAMANI_VIDEO_URL,
} from "@/lib/transcriptImport/hubermanRajShamaniInterview";
import {
  CAZUAL_TALK_SAHIL_AGGARWAL_TRANSCRIPT_EXCERPTS,
  CAZUAL_TALK_SAHIL_AGGARWAL_VIDEO_URL,
} from "@/lib/transcriptImport/cazualTalkSahilAggarwalInterview";
import {
  SCHOOLCAST_VANITA_UPPAL_TRANSCRIPT_EXCERPTS,
  SCHOOLCAST_VANITA_UPPAL_VIDEO_URL,
} from "@/lib/transcriptImport/schoolCastVanitaUppalInterview";
import {
  MEENAKSHI_ANANTRAM_TRANSCRIPT,
  MEENAKSHI_ANANTRAM_VIDEO_URL,
} from "@/lib/transcriptImport/meenakshiAnantramInterview";
import {
  KUNAL_SHAH_HIRING_TRANSCRIPT,
  KUNAL_SHAH_HIRING_VIDEO_URL,
} from "@/lib/transcriptImport/kunalShahHiring";
import {
  NITHIN_KAMATH_RISK_TRANSCRIPT,
  NITHIN_KAMATH_RISK_VIDEO_URL,
} from "@/lib/transcriptImport/nithinKamathRisk";
import {
  FRESHMENU_TRANSCRIPT,
  FRESHMENU_VIDEO_URL,
} from "@/lib/transcriptImport/freshMenuStruggle";
import {
  ALLARI_NARESH_TRANSCRIPT,
  ALLARI_NARESH_VIDEO_URL,
} from "@/lib/transcriptImport/allariNareshInterview";
import {
  SAM_ALTMAN_TRANSCRIPT,
  SAM_ALTMAN_VIDEO_URL,
} from "@/lib/transcriptImport/samAltmanMatthewBerman";
import type { TranscriptImportCanvasSection } from "@/lib/transcriptImport/playgroundLayout";

/**
 * One canvas per imported transcript. Each is built independently at its own
 * origin, so nothing has to be offset around anything else — adding a fourth
 * transcript is a fourth entry, not a fourth magic coordinate.
 */
export interface TranscriptImportCanvasDef {
  id: string;
  title: string;
  transcript: string;
  sourceUrl?: string;
  buildSnapshot(): CanvasSnapshot;
  contentCenter(): { x: number; y: number };
}

/**
 * Register each baked preview image as a canvas asset.
 *
 * The bytes already ship with the app, so this is not about storage — it is
 * about ownership. Registering them means the images travel with the canvas
 * snapshot, appear in its Attachments panel, and are addressed as canvas
 * content rather than as a URL the card happens to point at.
 *
 * Derived from the artifacts rather than authored in each builder, so a new
 * transcript canvas picks this up for free. No asset *nodes* are placed: the
 * image belongs to its website artifact, not to a separate tile on the board.
 */
function websitePreviewAssets(
  section: TranscriptImportCanvasSection,
  canvasId: string,
): Record<string, CanvasAsset> {
  const assets: Record<string, CanvasAsset> = {};
  for (const artifact of Object.values(section.sessionArtifacts)) {
    const version = artifact.versions.find(
      (v) => v.id === artifact.latestVersionId,
    );
    if (version?.payload.type !== "website") continue;
    const preview = transcriptWebsitePreview(version.payload.data.url);
    if (!preview) continue;
    const id = `asset_tip_${preview.path.split("/").pop()!.replace(/\W/g, "_")}`;
    if (assets[id]) continue;
    assets[id] = {
      id,
      canvasId,
      ownerId: "sample",
      name: preview.path.split("/").pop()!,
      mimeType: preview.mime,
      sizeBytes: preview.sizeBytes,
      storagePath: preview.path,
      publicUrl: preview.path,
      kind: "image",
      width: preview.width,
      height: preview.height,
      aspectRatio: preview.height > 0 ? preview.width / preview.height : undefined,
      createdAt: 0,
    };
  }
  return assets;
}

function snapshotFromSection(
  section: TranscriptImportCanvasSection,
  canvasId: string,
): CanvasSnapshot {
  const canvasAssets = websitePreviewAssets(section, canvasId);
  return buildCanvasSnapshot({
    viewport: { x: 0, y: 0, scale: 0.55 },
    cards: section.cards,
    cardOrder: section.cardOrder,
    connections: section.connections,
    threads: section.threads,
    threadOrder: section.threadOrder,
    // Canvas memory travels with the canvas. Without it a published copy starts
    // with no sibling-branch awareness, and nothing would ever backfill it —
    // gists are only written by a real exchange, which an import never has.
    threadGists: section.threadGists,
    groups: section.groups,
    connectorStyle: "orthogonal",
    canvasBackgroundStyle: "grid",
    canvasTheme: "light",
    canvasArtifactStyle: NEW_CANVAS_ARTIFACT_STYLE_ID,
    selectedModel: "claude-sonnet-4-6",
    viewMode: "canvas",
    sessionArtifacts: section.sessionArtifacts,
    canvasArtifactNodes: section.canvasArtifactNodes,
    canvasArtifactOrder: section.canvasArtifactOrder,
    canvasTextLabels: {},
    canvasTextLabelOrder: [],
    canvasAssets,
    canvasAssetNodes: {},
    canvasAssetOrder: [],
    uploadedAttachments: [],
    collaborationHasEdits: false,
  });
}

export function defineCanvas(
  id: string,
  title: string,
  transcript: string,
  build: () => TranscriptImportCanvasSection,
  sourceUrl?: string,
): TranscriptImportCanvasDef {
  return {
    id,
    title,
    transcript,
    sourceUrl,
    buildSnapshot: () => snapshotFromSection(build(), id),
    contentCenter: () => build().contentCenter,
  };
}

export const TRANSCRIPT_IMPORT_CANVASES: TranscriptImportCanvasDef[] = [
  defineCanvas(
    "design-tools",
    "Design tools history",
    DESIGN_TOOLS_HISTORY_TRANSCRIPT,
    buildDesignToolsCanvasSection,
  ),
  defineCanvas(
    "yc-interview",
    "YC interview tips",
    YC_INTERVIEW_TIPS_TRANSCRIPT,
    buildYcInterviewCanvasSection,
    YC_INTERVIEW_TIPS_VIDEO_URL,
  ),
  defineCanvas(
    "huberman-neuroplasticity",
    "Neuroplasticity — Huberman",
    HUBERMAN_NEUROPLASTICITY_TRANSCRIPT,
    buildHubermanCanvasSection,
    HUBERMAN_NEUROPLASTICITY_SOURCE_URL,
  ),
  defineCanvas(
    "rana-daggubati-infocus",
    "Rana Daggubati — InFocus",
    RANA_DAGGUBATI_INTERVIEW_TRANSCRIPT,
    buildRanaDaggubatiCanvasSection,
    RANA_DAGGUBATI_VIDEO_URL,
  ),
  defineCanvas(
    "jagadamba-theatre",
    "Jagadamba Theatre — Rooted Stories",
    JAGADAMBA_THEATRE_TRANSCRIPT,
    buildJagadambaCanvasSection,
    JAGADAMBA_THEATRE_VIDEO_URL,
  ),
  defineCanvas(
    "lightcone-emergent",
    "Emergent — The Lightcone",
    LIGHTCONE_EMERGENT_TRANSCRIPT,
    buildLightconeEmergentCanvasSection,
    LIGHTCONE_EMERGENT_VIDEO_URL,
  ),
  defineCanvas(
    "prashant-kishor-unfiltered",
    "Prashant Kishor — Unfiltered by Samdish",
    PRASHANT_KISHOR_INTERVIEW_TRANSCRIPT,
    buildPrashantKishorCanvasSection,
    PRASHANT_KISHOR_VIDEO_URL,
  ),
  defineCanvas(
    "huberman-raj-shamani",
    "Andrew Huberman — Figuring Out",
    HUBERMAN_RAJ_SHAMANI_TRANSCRIPT_EXCERPTS,
    buildHubermanRajShamaniCanvasSection,
    HUBERMAN_RAJ_SHAMANI_VIDEO_URL,
  ),
  defineCanvas(
    "cazual-talk-sahil-aggarwal",
    "Sahil Aggarwal — Cazual Talk",
    CAZUAL_TALK_SAHIL_AGGARWAL_TRANSCRIPT_EXCERPTS,
    buildCazualTalkSahilAggarwalCanvasSection,
    CAZUAL_TALK_SAHIL_AGGARWAL_VIDEO_URL,
  ),
  defineCanvas(
    "schoolcast-vanita-uppal",
    "Vanita Uppal — Schoolcast with Avyakt",
    SCHOOLCAST_VANITA_UPPAL_TRANSCRIPT_EXCERPTS,
    buildSchoolCastVanitaUppalCanvasSection,
    SCHOOLCAST_VANITA_UPPAL_VIDEO_URL,
  ),
  defineCanvas(
    "meenakshi-anantram-rooted",
    "Dr. Meenakshi Anantram — Rooted Stories",
    MEENAKSHI_ANANTRAM_TRANSCRIPT,
    buildMeenakshiAnantramCanvasSection,
    MEENAKSHI_ANANTRAM_VIDEO_URL,
  ),
  defineCanvas(
    "kunal-shah-hiring",
    "Hiring & retention — Kunal Shah",
    KUNAL_SHAH_HIRING_TRANSCRIPT,
    buildKunalShahHiringCanvasSection,
    KUNAL_SHAH_HIRING_VIDEO_URL,
  ),
  defineCanvas(
    "nithin-kamath-risk",
    "Moats & risk — Nithin Kamath",
    NITHIN_KAMATH_RISK_TRANSCRIPT,
    buildNithinKamathRiskCanvasSection,
    NITHIN_KAMATH_RISK_VIDEO_URL,
  ),
  defineCanvas(
    "allari-naresh-raw-talks",
    "Allari Naresh — Raw Talks with VK",
    ALLARI_NARESH_TRANSCRIPT,
    buildAllariNareshCanvasSection,
    ALLARI_NARESH_VIDEO_URL,
  ),
  defineCanvas(
    "freshmenu-backstage",
    "FreshMenu — Backstage with Millionaires",
    FRESHMENU_TRANSCRIPT,
    buildFreshMenuCanvasSection,
    FRESHMENU_VIDEO_URL,
  ),
  defineCanvas(
    "sam-altman-matthew-berman",
    "Sam Altman — Matthew Berman",
    SAM_ALTMAN_TRANSCRIPT,
    buildSamAltmanCanvasSection,
    SAM_ALTMAN_VIDEO_URL,
  ),
];

export const DEFAULT_TRANSCRIPT_IMPORT_CANVAS_ID =
  TRANSCRIPT_IMPORT_CANVASES[0]!.id;

export function getTranscriptImportCanvas(
  id: string,
): TranscriptImportCanvasDef {
  return (
    TRANSCRIPT_IMPORT_CANVASES.find((canvas) => canvas.id === id) ??
    TRANSCRIPT_IMPORT_CANVASES[0]!
  );
}
