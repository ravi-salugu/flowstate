/**
 * Register all built-in component kinds with the KindRegistry.
 *
 * Import this module **once** at app startup (or rely on the side-effect
 * import in any consumer file) to populate the registry. Auto-registration
 * runs at module load.
 *
 * R2 ships specs for the 8 kinds the v1 canvas already produces (chat, text,
 * image, gallery, table, code, 3d, ui). The remaining two — chart, browser —
 * land in R5 alongside their generators.
 *
 * Import order is not significant: each kind owns its slot via `kind` discriminator.
 */

import { kindRegistry } from "@/lib/components/KindRegistry";
import { chatKindSpec } from "./chatKind";
import { textKindSpec } from "./textKind";
import { imageKindSpec } from "./imageKind";
import { galleryKindSpec } from "./galleryKind";
import { tableKindSpec } from "./tableKind";
import { codeKindSpec } from "./codeKind";
import { threeDKindSpec } from "./threeDKind";
import { uiKindSpec } from "./uiKind";

let registered = false;

export function registerBuiltinKinds(): void {
  if (registered) return;
  kindRegistry.register(chatKindSpec);
  kindRegistry.register(textKindSpec);
  kindRegistry.register(imageKindSpec);
  kindRegistry.register(galleryKindSpec);
  kindRegistry.register(tableKindSpec);
  kindRegistry.register(codeKindSpec);
  kindRegistry.register(threeDKindSpec);
  kindRegistry.register(uiKindSpec);
  registered = true;
}

// Auto-register on import so any consumer pulling from "@/lib/components/kinds"
// gets a populated registry without an explicit init call.
registerBuiltinKinds();

export {
  chatKindSpec,
  textKindSpec,
  imageKindSpec,
  galleryKindSpec,
  tableKindSpec,
  codeKindSpec,
  threeDKindSpec,
  uiKindSpec,
};
