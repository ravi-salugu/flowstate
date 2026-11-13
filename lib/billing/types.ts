/** Every route that spends money on an upstream provider. */
export type Surface =
  | "chat"
  | "custom-ui"
  | "quick-explain"
  | "gist"
  | "summarize"
  | "memory-extract"
  | "skills-analyze"
  | "github-summary"
  | "github-summary-stream"
  | "conversation-import";

export type PlanId = "free" | "pro" | "max";

export type EntitlementStatus =
  "active" | "trialing" | "past_due" | "canceled" | "paused";

export type LedgerKind =
  | "record" // Phase 1: metering only, no hold/settle cycle
  | "hold"
  | "settle"
  | "refund"
  | "grant"
  | "adjustment";

export type TurnOutcome = "success" | "error" | "timeout" | "cancelled";

/**
 * The billing subject. Today always the auth user; `ownerType` exists so an
 * organisation can be swapped in without touching a single call site.
 */
export interface BillingOwner {
  ownerId: string;
  ownerType: "user" | "org";
}

export interface Entitlement {
  ownerId: string;
  ownerType: "user" | "org";
  planId: PlanId;
  status: EntitlementStatus;
  creditsPerPeriod: number;
  bonusCredits: number;
  periodStart: string;
  periodEnd: string;
  cancelAtPeriodEnd: boolean;
  pendingPlanId: PlanId | null;
  provider: string;
  providerSubscriptionId: string | null;
}

/** What the UI shows. Derived, never authoritative. */
export interface CreditSnapshot {
  planId: PlanId;
  status: EntitlementStatus;
  used: number;
  limit: number;
  remaining: number;
  periodStart: string;
  periodEnd: string;
  upgradeAvailable: boolean;
}
