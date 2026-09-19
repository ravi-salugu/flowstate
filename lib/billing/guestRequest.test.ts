import { afterEach, describe, expect, it, vi } from "vitest";
import { guestGate, guestIdentityFor } from "@/lib/billing/guestRequest.server";

vi.mock("@/lib/billing/guest.server", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/billing/guest.server")
  >();
  return { ...actual, guardGuestCredits: vi.fn() };
});
const { guardGuestCredits } = await import("@/lib/billing/guest.server");
const guard = vi.mocked(guardGuestCredits);

const ALLOW = { ok: true, usage: null } as const;
const DENY = {
  ok: false,
  usage: { creditsUsed: 240, requests: 12 },
  response: Response.json({ code: "guest_limit_reached" }, { status: 402 }),
} as const;

const reqWith = (cookie: string | null) =>
  new Request("https://flowstate.test/api/chat", {
    method: "POST",
    headers: cookie ? { cookie } : {},
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("guestIdentityFor", () => {
  it("pulls fs_vid out of the cookie header", () => {
    const id = guestIdentityFor(reqWith("fs_vid=abc-123"), false);
    expect(id.visitorId).toBe("abc-123");
  });

  it("finds fs_vid among other cookies without matching a lookalike name", () => {
    // A bare /fs_vid=/ would match "not_fs_vid" and attribute spend to the
    // wrong identity, so the leading-boundary anchor matters.
    expect(
      guestIdentityFor(reqWith("not_fs_vid=wrong; fs_vid=right"), false)
        .visitorId,
    ).toBe("right");
    expect(
      guestIdentityFor(reqWith("sb-token=x; fs_vid=right; other=y"), false)
        .visitorId,
    ).toBe("right");
  });

  it("is null for a signed-in user and for a missing cookie", () => {
    expect(guestIdentityFor(reqWith("fs_vid=abc"), true).visitorId).toBeNull();
    expect(guestIdentityFor(reqWith(null), false).visitorId).toBeNull();
  });

  it("returns no ip hash while GUEST_IP_SALT is unset", () => {
    // Documents the live default: the IP backstop is inert until the salt is
    // configured, which is why setting it is a launch step.
    vi.stubEnv("GUEST_IP_SALT", "");
    const id = guestIdentityFor(reqWith("fs_vid=abc"), false);
    expect(id.ipHash).toBeNull();
  });
});

describe("guestGate", () => {
  it("never consults the wall for a signed-in user", async () => {
    const res = await guestGate({
      req: reqWith("fs_vid=abc"),
      signedIn: true,
      surface: "summarize",
    });
    expect(res.blocked).toBeNull();
    expect(guard).not.toHaveBeenCalled();
  });

  it("passes a guest through while they are within the allowance", async () => {
    guard.mockResolvedValue(ALLOW);
    const res = await guestGate({
      req: reqWith("fs_vid=abc"),
      signedIn: false,
      surface: "summarize",
    });
    expect(res.blocked).toBeNull();
    expect(res.visitorId).toBe("abc");
    expect(guard).toHaveBeenCalledWith(
      expect.objectContaining({ visitorId: "abc", surface: "summarize" }),
    );
  });

  it("hands back the 402 once a guest is over the allowance", async () => {
    guard.mockResolvedValue(DENY);
    const res = await guestGate({
      req: reqWith("fs_vid=abc"),
      signedIn: false,
      surface: "summarize",
    });
    expect(res.blocked).not.toBeNull();
    expect(res.blocked?.status).toBe(402);
    await expect(res.blocked?.json()).resolves.toMatchObject({
      code: "guest_limit_reached",
    });
  });

  it("reports the surface it was asked about, so the ledger attributes right", async () => {
    guard.mockResolvedValue(ALLOW);
    for (const surface of ["chat", "custom-ui", "quick-explain", "gist"] as const) {
      await guestGate({ req: reqWith("fs_vid=abc"), signedIn: false, surface });
      expect(guard).toHaveBeenLastCalledWith(
        expect.objectContaining({ surface }),
      );
    }
  });
});
