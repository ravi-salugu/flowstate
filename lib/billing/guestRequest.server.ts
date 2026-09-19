import {
  clientIpFrom,
  guardGuestCredits,
  hashIp,
  type GuestGuard,
} from "@/lib/billing/guest.server";
import type { Surface } from "@/lib/billing/types";

/**
 * The per-route guest boilerplate, in one place.
 *
 * Every metered AI route needs the same three things: pull fs_vid off the
 * cookie, hash the client IP, and refuse the request when the guest allowance
 * is spent. That was inlined in /api/chat and simply missing from the other
 * four, which is how a guest past their limit could still drive /api/summarize
 * (Sonnet, 100k chars of input) for free.
 */

const VISITOR_COOKIE_RE = /(?:^|;\s*)fs_vid=([^;]+)/;

export interface GuestIdentity {
  visitorId: string | null;
  ipHash: string | null;
}

/**
 * Guest identity for a request. Both fields are null for a signed-in user —
 * the guest wall applies only to visitors, whose spend has no account to bill.
 */
export function guestIdentityFor(
  req: Request,
  signedIn: boolean,
): GuestIdentity {
  if (signedIn) return { visitorId: null, ipHash: null };
  return {
    visitorId: req.headers.get("cookie")?.match(VISITOR_COOKIE_RE)?.[1] ?? null,
    ipHash: hashIp(clientIpFrom(req.headers)),
  };
}

/**
 * Resolves guest identity and applies the wall in one step.
 *
 * `blocked` is the 402 to return when the allowance is spent; it is null for a
 * signed-in user and for a guest still within their allowance. Fails open, like
 * everything else on this path.
 */
export async function guestGate(args: {
  req: Request;
  signedIn: boolean;
  surface: Surface;
}): Promise<GuestIdentity & { blocked: Response | null }> {
  const identity = guestIdentityFor(args.req, args.signedIn);
  if (args.signedIn) return { ...identity, blocked: null };

  const guard: GuestGuard = await guardGuestCredits({
    visitorId: identity.visitorId,
    ipHash: identity.ipHash,
    surface: args.surface,
  });

  return { ...identity, blocked: guard.ok ? null : guard.response };
}
