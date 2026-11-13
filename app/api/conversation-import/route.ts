import { getCurrentUser } from "@/lib/auth/currentUser.server";
import { resolveBillingOwner } from "@/lib/billing/owner";
import { guestGate } from "@/lib/billing/guestRequest.server";
import { runConversationImport } from "@/lib/conversationImport/runImport.server";

/*
 * "Continue on Flowstate" import for every user — signed in (credit guard) or
 * guest (guest wall). Turns an uploaded chat export or transcript into a
 * ConversationImportSpec; the client builds the canvas.
 */

export const maxDuration = 180;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const guest = await guestGate({
    req,
    signedIn: Boolean(user),
    surface: "conversation-import",
  });
  if (guest.blocked) return guest.blocked;

  return runConversationImport(req, {
    ownerId: user ? resolveBillingOwner(user.id).ownerId : null,
    email: user?.email ?? null,
    visitorId: guest.visitorId,
    ipHash: guest.ipHash,
  });
}
