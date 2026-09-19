import { describe, expect, it } from "vitest";
import { normalizeIpForHash } from "@/lib/billing/guest.server";

describe("normalizeIpForHash", () => {
  it("passes IPv4 through whole", () => {
    expect(normalizeIpForHash("203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeIpForHash("  203.0.113.7 ")).toBe("203.0.113.7");
  });

  it("cuts IPv6 to the /64 prefix", () => {
    // The whole point: these two are the SAME subscriber after a privacy-
    // extension rotation, and must hash to the same bucket.
    const a = "2001:0db8:85a3:0000:1111:2222:3333:4444";
    const b = "2001:0db8:85a3:0000:9999:8888:7777:6666";
    expect(normalizeIpForHash(a)).toBe("2001:0db8:85a3:0000");
    expect(normalizeIpForHash(a)).toBe(normalizeIpForHash(b));
  });

  it("keeps genuinely different /64s apart", () => {
    expect(normalizeIpForHash("2001:db8:85a3:1::1")).not.toBe(
      normalizeIpForHash("2001:db8:85a3:2::1"),
    );
  });

  it("expands :: before slicing, so compressed and full forms agree", () => {
    expect(normalizeIpForHash("2001:db8::1")).toBe("2001:0db8:0000:0000");
    expect(normalizeIpForHash("2001:0db8:0000:0000:0000:0000:0000:0001")).toBe(
      "2001:0db8:0000:0000",
    );
    expect(normalizeIpForHash("2001:db8::1")).toBe(
      normalizeIpForHash("2001:0db8:0000:0000:0000:0000:0000:0001"),
    );
  });

  it("handles :: at either end", () => {
    expect(normalizeIpForHash("::1")).toBe("0000:0000:0000:0000");
    expect(normalizeIpForHash("2001:db8::")).toBe("2001:0db8:0000:0000");
  });

  it("uses the v4 address for IPv4-mapped forms", () => {
    // ::ffff:a.b.c.d shares one /64 across every mapped address on earth —
    // bucketing on the prefix would rate-limit the whole internet as one host.
    expect(normalizeIpForHash("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeIpForHash("::ffff:203.0.113.7")).toBe(
      normalizeIpForHash("203.0.113.7"),
    );
  });

  it("strips zone ids and bracket/port forms", () => {
    expect(normalizeIpForHash("fe80::1%eth0")).toBe("fe80:0000:0000:0000");
    expect(normalizeIpForHash("[2001:db8::1]:443")).toBe("2001:0db8:0000:0000");
  });

  it("is case-insensitive", () => {
    expect(normalizeIpForHash("2001:DB8:85A3::1")).toBe(
      normalizeIpForHash("2001:db8:85a3::1"),
    );
  });

  it("passes malformed input through rather than throwing", () => {
    // Fail-open is the rule on this whole path: a weird proxy header must
    // never 500 a request, it just gets bucketed as itself.
    expect(() => normalizeIpForHash("not-an-ip")).not.toThrow();
    expect(normalizeIpForHash("not-an-ip")).toBe("not-an-ip");
    expect(normalizeIpForHash("")).toBe("");
    expect(normalizeIpForHash("1:2:3:4:5:6:7:8:9::10")).toBe("1:2:3:4:5:6:7:8:9::10");
  });
});
