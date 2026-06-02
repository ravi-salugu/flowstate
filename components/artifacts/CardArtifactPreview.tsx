"use client";

import { ArtifactPreviewPill } from "@/components/artifacts/ArtifactPreviewPill";
import { payloadToArtifactKind } from "@/lib/artifactTypes";
import {
  artifactDisplayTitle,
  getLatestVersion,
  getVersionById,
} from "@/lib/sessionArtifacts";
import type { Card } from "@/lib/store";
import { useCanvasStore } from "@/lib/store";

export function CardArtifactPreview({ card }: { card: Card }) {
  const sessionArtifacts = useCanvasStore((s) => s.sessionArtifacts);
  const canvasArtifactNodes = useCanvasStore((s) => s.canvasArtifactNodes);

  // R7d — suppress the in-card preview pill when the artifact is already
  // visible as a standalone CanvasArtifactNode on the canvas. The pill is
  // redundant in that case AND its 70–90 px height was pushing follow-up
  // cards way below the parent. Keep the pill while the card is still
  // streaming / thinking so the user gets generation feedback inline.
  const generating =
    card.status === "streaming" || card.status === "thinking";
  if (card.outputArtifactId && !generating) {
    const hasCanvasNode = Object.values(canvasArtifactNodes).some(
      (n) => n.artifactId === card.outputArtifactId,
    );
    if (hasCanvasNode) return null;
  }

  if (card.outputArtifactId) {
    const art = sessionArtifacts[card.outputArtifactId];
    if (!art) return null;
    const ver =
      (card.outputArtifactVersionId &&
        getVersionById(art, card.outputArtifactVersionId)) ||
      getLatestVersion(art);
    const generating =
      card.status === "streaming" || card.status === "thinking";
    return (
      <ArtifactPreviewPill
        kind={art.kind}
        title={artifactDisplayTitle(art, ver)}
        versionNumber={ver.number}
        artifactId={art.id}
        versionId={ver.id}
        generating={generating && !card.outputArtifactVersionId}
      />
    );
  }

  if (card.artifactPayload && card.status !== "empty") {
    const kind = payloadToArtifactKind(card.artifactPayload);
    const title =
      kind === "code" && card.artifactPayload.type === "code"
        ? card.artifactPayload.data.files[0]?.path ?? card.artifactPayload.title
        : card.artifactPayload.title;
    const generating =
      card.status === "streaming" || card.status === "thinking";
    if (card.outputArtifactId) {
      const art = sessionArtifacts[card.outputArtifactId];
      if (art) {
        const ver = getLatestVersion(art);
        return (
          <ArtifactPreviewPill
            kind={art.kind}
            title={artifactDisplayTitle(art, ver)}
            versionNumber={ver.number}
            artifactId={art.id}
            versionId={ver.id}
            generating={generating}
          />
        );
      }
    }
    return (
      <div className="pointer-events-none max-w-md opacity-90">
        <ArtifactPreviewPill
          kind={kind}
          title={title}
          versionNumber={1}
          artifactId=""
          generating
        />
      </div>
    );
  }

  if (
    card.images &&
    card.images.length > 0 &&
    (card.responseType === "image" || card.responseType === "images")
  ) {
    const generating =
      !card.outputArtifactId &&
      (card.status === "streaming" || card.status === "thinking");
    if (card.outputArtifactId) {
      const art = sessionArtifacts[card.outputArtifactId];
      if (art) {
        const ver = getLatestVersion(art);
        return (
          <ArtifactPreviewPill
            kind="images"
            title={artifactDisplayTitle(art, ver)}
            versionNumber={ver.number}
            artifactId={art.id}
            versionId={ver.id}
            generating={generating}
          />
        );
      }
    }
    return (
      <div className="pointer-events-none max-w-md opacity-90">
        <ArtifactPreviewPill
          kind="images"
          title="Images"
          versionNumber={1}
          artifactId=""
          generating
        />
      </div>
    );
  }

  return null;
}
