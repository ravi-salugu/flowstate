import {
  defineCanvas,
  type TranscriptImportCanvasDef,
} from "@/lib/buildTranscriptImportPlaygroundSnapshot";
import { buildConversationImportCanvasSection } from "@/lib/conversationImport/buildConversationImportCanvasSection";
import type { ConversationImportSpec } from "@/lib/conversationImport/spec";

let importCount = 0;

/**
 * A playground canvas definition for an uploaded conversation. The section is
 * built once and reused, so Fit, Publish and re-selecting the chip all see the
 * same nodes (artifact ids are minted fresh on every build).
 */
export function defineImportedCanvas(
  spec: ConversationImportSpec,
  sourceText: string,
): TranscriptImportCanvasDef {
  importCount += 1;
  const section = buildConversationImportCanvasSection(spec);
  return defineCanvas(
    `import-${Date.now().toString(36)}-${importCount}`,
    spec.title,
    sourceText,
    () => section,
  );
}
