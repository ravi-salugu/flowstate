import { useCanvasStore } from "@/lib/store";

/**
 * Client-side half of the guest wall.
 *
 * Lives here rather than inside claudeClient because claudeClient is not the
 * only caller of a metered route: quick-explain and summarize can hit the same
 * 402, and before this existed their 402 surfaced as a generic "request failed"
 * or as nothing at all. Any client calling a metered endpoint should run its
 * failed response through this before reporting an error.
 *
 * Consumes the response body, which is safe for every current caller — they
 * report failures from `res.status` alone.
 */
export async function raiseGuestWallIfLimited(res: Response): Promise<boolean> {
  if (res.status !== 402) return false;

  const body = (await res.json().catch(() => null)) as {
    code?: string;
    billing?: { questionsAsked?: number };
  } | null;

  if (body?.code !== "guest_limit_reached") return false;

  useCanvasStore.getState().openGuestWall(body.billing?.questionsAsked ?? null);
  return true;
}
