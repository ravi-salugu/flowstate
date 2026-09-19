import { createHash } from "node:crypto";
import { isBillingWriteEnabled } from "@/lib/billing/enforcement";
import { GUEST_CREDITS } from "@/lib/billing/plans";
import type { Surface } from "@/lib/billing/types";
import {
  createServiceRoleClient,
  isServiceRoleConfigured,
} from "@/lib/supabase/serviceRole";

/**
 * Anti-abuse ceiling for a shared address, set at ~3x the per-visitor
 * allowance so an office or mobile carrier NAT is not locked out by its first
 * few visitors. This is the ONE place a rolling time window survives: it is an
 * abuse ceiling, not a user's entitlement, and making it permanent would ban a
 * whole building forever.
 */
const IP_WINDOW_HOURS = 24;

/**
 * The guest allowance in force, honouring GUEST_CREDITS_OVERRIDE.
 *
 * 240 is a calibration from a single measured canvas, not a settled number, so
 * it needs to be tunable without a deploy — and testable without asking 15
 * questions. Server-side only: plans.ts stays client-safe.
 */
export function guestCreditAllowance(): number {
  const raw = process.env.GUEST_CREDITS_OVERRIDE?.trim();
  const n = raw ? Number.parseFloat(raw) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : GUEST_CREDITS;
}

/**
 * Anti-abuse ceiling for a shared address, at 3x the per-visitor allowance so
 * an office or carrier NAT is not locked out by its first few visitors.
 */
export function guestIpAllowance(): number {
  return guestCreditAllowance() * 3;
}

/** `guests` enables the wall independently of BILLING_ENFORCEMENT, because the
 *  guest wall and signed-in limits ship at different times. */
export function isGuestWallEnabled(): boolean {
  return process.env.GUEST_ENFORCEMENT?.trim().toLowerCase() === "on";
}

/**
 * Reduces an address to the unit we actually want to rate-limit, BEFORE hashing.
 *
 * IPv4 is used whole. IPv6 is cut to its /64 prefix, because privacy extensions
 * (RFC 4941) rotate the host half of a v6 address regularly — often daily, and
 * on some stacks per-connection. Hashing the full address therefore mints a
 * fresh ip_hash every rotation and the backstop silently never fires, which
 * matters because most mobile traffic is now IPv6. The /64 is the smallest unit
 * an ISP assigns to a single subscriber, so it is the right grain: stable
 * across rotation, and never wider than one customer.
 *
 * Anything unparseable is passed through unchanged — worst case it behaves
 * exactly as it did before this function existed.
 */
export function normalizeIpForHash(raw: string): string {
  let addr = raw.trim().toLowerCase();
  if (!addr) return "";

  // [::1]:443 → ::1
  if (addr.startsWith("[")) {
    const close = addr.indexOf("]");
    if (close > 0) addr = addr.slice(1, close);
  }
  // fe80::1%eth0 → fe80::1
  const zone = addr.indexOf("%");
  if (zone !== -1) addr = addr.slice(0, zone);

  if (!addr.includes(":")) return addr; // IPv4, or not an address at all

  // IPv4-mapped/-compatible (::ffff:1.2.3.4). The network really uses the v4
  // address, so limit on that rather than on a prefix shared by every mapping.
  const lastGroup = addr.slice(addr.lastIndexOf(":") + 1);
  if (lastGroup.includes(".")) return lastGroup;

  // Expand "::" so the first four groups are genuinely the /64 prefix.
  let groups: string[];
  const doubleColon = addr.indexOf("::");
  if (doubleColon === -1) {
    groups = addr.split(":");
  } else {
    const head = addr.slice(0, doubleColon).split(":").filter(Boolean);
    const tail = addr.slice(doubleColon + 2).split(":").filter(Boolean);
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return addr; // malformed — leave it alone
    groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  }

  if (groups.length < 4) return addr; // malformed — leave it alone

  return groups
    .slice(0, 4)
    .map((g) => (g || "0").padStart(4, "0"))
    .join(":");
}

/** sha256(normalized ip + salt). The raw IP is never stored, matching visitor_events. */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const salt = process.env.GUEST_IP_SALT?.trim();
  if (!salt) return null; // no salt configured => skip the IP backstop entirely
  const normalized = normalizeIpForHash(ip);
  if (!normalized) return null;
  return createHash("sha256").update(`${normalized}${salt}`).digest("hex");
}

/** Best-effort client IP from the proxy headers Vercel sets. */
export function clientIpFrom(headers: Headers): string | null {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || null;
  return headers.get("x-real-ip");
}

export interface GuestUsage {
  creditsUsed: number;
  requests: number;
}

export type GuestGuard =
  | { ok: true; usage: GuestUsage | null }
  | { ok: false; usage: GuestUsage; response: Response };

const ALLOW: GuestGuard = { ok: true, usage: null };

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number.parseFloat(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Decides whether a signed-out visitor may make another AI request.
 *
 * FAILS OPEN on every error path — a broken counter table must never become an
 * outage for anonymous visitors, who are the top of the funnel.
 *
 * Only applies to guests: callers pass this nothing when a user is signed in.
 */
export async function guardGuestCredits(args: {
  visitorId: string | null;
  ipHash: string | null;
  surface: Surface;
}): Promise<GuestGuard> {
  if (!isGuestWallEnabled()) return ALLOW;
  if (!args.visitorId || !isServiceRoleConfigured()) return ALLOW;

  try {
    const supabase = createServiceRoleClient();

    const { data } = await supabase
      .from("guest_credit_counters")
      .select("credits_used, requests")
      .eq("visitor_id", args.visitorId)
      .maybeSingle();

    const usage: GuestUsage = {
      creditsUsed: num(
        (data as { credits_used?: number | string } | null)?.credits_used,
      ),
      requests: Math.trunc(
        num((data as { requests?: number | string } | null)?.requests),
      ),
    };

    const allowance = guestCreditAllowance();
    let overLimit = usage.creditsUsed >= allowance;

    // IP backstop — only when a salt is configured, and only within the window.
    if (!overLimit && args.ipHash) {
      const since = new Date(
        Date.now() - IP_WINDOW_HOURS * 3_600_000,
      ).toISOString();
      const { data: rows } = await supabase
        .from("guest_credit_counters")
        .select("credits_used")
        .eq("ip_hash", args.ipHash)
        .gte("window_start", since)
        .limit(500);
      const ipTotal = (rows ?? []).reduce(
        (sum, r) =>
          sum + num((r as { credits_used: number | string }).credits_used),
        0,
      );
      overLimit = ipTotal >= guestIpAllowance();
    }

    if (!overLimit) return { ok: true, usage };

    return {
      ok: false,
      usage,
      response: Response.json(
        {
          error: "Sign in to keep going.",
          code: "guest_limit_reached",
          billing: {
            creditsUsed: usage.creditsUsed,
            creditsLimit: allowance,
            questionsAsked: usage.requests,
            signInRequired: true,
          },
        },
        { status: 402 },
      ),
    };
  } catch (err) {
    console.error("[billing/guest] failed open", err);
    return ALLOW;
  }
}

/**
 * Adds actual spend to a guest's lifetime counter. Called after the request
 * completes, from the same place the ledger row is written, so the counter can
 * never drift from what was really consumed.
 *
 * The visitor_id row is a LIFETIME total — the guest allowance never refills,
 * per the no-daily-limits rule. Only window_start (the IP path) is time-based.
 */
export async function addGuestUsage(args: {
  visitorId: string | null;
  ipHash: string | null;
  credits: number;
}): Promise<void> {
  if (!args.visitorId || args.credits <= 0) return;
  if (!isBillingWriteEnabled() || !isServiceRoleConfigured()) return;

  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("guest_credit_counters")
      .select("credits_used, requests")
      .eq("visitor_id", args.visitorId)
      .maybeSingle();

    const prev = data as {
      credits_used?: number | string;
      requests?: number | string;
    } | null;

    await supabase.from("guest_credit_counters").upsert(
      {
        visitor_id: args.visitorId,
        ip_hash: args.ipHash,
        credits_used: num(prev?.credits_used) + args.credits,
        requests: Math.trunc(num(prev?.requests)) + 1,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "visitor_id" },
    );
  } catch (err) {
    console.error("[billing/guest] counter update failed", err);
  }
}
