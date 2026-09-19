import { isArtifactCatalogSessionActive } from "@/lib/artifactCatalogSession";
import { isLandingCanvasSessionActive } from "@/lib/landingCanvasSession";
import { isMobileSdlcSandboxSessionActive } from "@/lib/mobileSdlcSandboxSession";
import { isPerfFixtureSessionActive } from "@/lib/perf/perfFixtureSession";
import { isPublishedCanvasSessionActive } from "@/lib/publishedCanvasSession";
import { isSampleCanvasPreviewSessionActive } from "@/lib/sampleCanvases/sampleCanvasPreviewSession";
import { isTranscriptImportPlaygroundSessionActive } from "@/lib/transcriptImportPlaygroundSession";

/**
 * True while the store holds a canvas that must never be written to the cloud.
 *
 * This list existed twice in useCanvasPersistence with slightly different
 * members — the perf fixture was in the scheduleSave copy but not the
 * performSave copy — which is exactly how a surface ends up half-protected.
 * One definition, used by both.
 */
export function isEphemeralFixtureSessionActive(): boolean {
  return (
    isArtifactCatalogSessionActive() ||
    isLandingCanvasSessionActive() ||
    isMobileSdlcSandboxSessionActive() ||
    isPerfFixtureSessionActive() ||
    isPublishedCanvasSessionActive() ||
    isSampleCanvasPreviewSessionActive() ||
    isTranscriptImportPlaygroundSessionActive()
  );
}
