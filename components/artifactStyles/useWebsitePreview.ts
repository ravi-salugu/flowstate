import { useEffect, useState } from "react";
import { healWebsitePreview } from "@/lib/createUrlArtifact";

/**
 * A style pack's website hero, with a recovery path.
 *
 * The stored preview can be a path that never shipped (offline-built import
 * canvases) or a remote image that rotted. On error the card drops to its
 * no-image body at once, and one re-resolve of the site's real hero runs in
 * the background; when it lands, the store patch re-renders the card with it.
 */
export function useWebsitePreview(
  artifactId: string,
  url: string,
  previewImageUrl: string | undefined,
): { failed: boolean; onError: () => void } {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [previewImageUrl]);
  const onError = () => {
    setFailed(true);
    void healWebsitePreview(artifactId, url, previewImageUrl);
  };
  return { failed, onError };
}
