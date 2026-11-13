import { getAdminUser } from "@/lib/adminAccess.server";
import { resolveBillingOwner } from "@/lib/billing/owner";
import { runConversationImport } from "@/lib/conversationImport/runImport.server";

/*
 * Admin-playground entry to the "Continue on Flowstate" import. Same import as
 * the public /api/conversation-import, behind the admin check so the playground
 * keeps working exactly as it did.
 */

export const maxDuration = 180;

export async function POST(req: Request) {
  const user = await getAdminUser();
  if (!user) {
    return Response.json({ error: "Admins only." }, { status: 403 });
  }
  return runConversationImport(req, {
    ownerId: resolveBillingOwner(user.id).ownerId,
    email: user.email ?? null,
  });
}
