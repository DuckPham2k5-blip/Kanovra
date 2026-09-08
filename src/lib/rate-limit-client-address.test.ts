import { describe, expect, it } from "vitest";

import { clientAddress, consumeToken, PUBLIC_READ_LIMIT, resetRateLimits } from "@/lib/rate-limit";

/**
 * Which address an anonymous request is charged to.
 *
 * This is the whole of the per-caller limit on the public share route: get the
 * address wrong and the bucket is wrong, and a bucket the caller chooses is not
 * a bucket at all. It had this bug — the first hop rather than the last — and
 * the spoofing case below is the one that fails when it comes back.
 */

describe("clientAddress", () => {
  it("uses X-Real-IP when the proxy sets it", () => {
    expect(clientAddress(null, "203.0.113.7")).toBe("203.0.113.7");
  });

  it("prefers X-Real-IP over the forwarded list", () => {
    // Our Nginx replaces X-Real-IP outright, so it cannot carry caller data;
    // the forwarded list can, and does in the test below.
    expect(clientAddress("9.9.9.9, 203.0.113.7", "203.0.113.7")).toBe("203.0.113.7");
  });

  it("takes the LAST hop of X-Forwarded-For, which is the one our proxy added", () => {
    expect(clientAddress("203.0.113.7")).toBe("203.0.113.7");
    expect(clientAddress("198.51.100.1, 203.0.113.7")).toBe("203.0.113.7");
    expect(clientAddress("a, b, c, 203.0.113.7")).toBe("203.0.113.7");
  });

  /*
   * The bug, stated as the attack.
   *
   * `$proxy_add_x_forwarded_for` appends, so a caller who sends their own
   * header gets it kept in front of the real address. Reading the front reads
   * whatever they typed — a fresh key per request, and therefore a fresh
   * allowance per request.
   */
  it("cannot be steered by a caller sending their own X-Forwarded-For", () => {
    const real = "203.0.113.7";
    const spoofed = ["9.9.9.9", "1.1.1.1", "evil", "", "   "].map(
      (attempt) => `${attempt}, ${real}`,
    );

    for (const header of spoofed) {
      expect(clientAddress(header), header).toBe(real);
    }
  });

  it("falls back to a shared key rather than to something a caller picked", () => {
    expect(clientAddress(null)).toBe("unknown");
    expect(clientAddress("")).toBe("unknown");
    expect(clientAddress("   ")).toBe("unknown");
    expect(clientAddress(",,,")).toBe("unknown");
    expect(clientAddress(null, "   ")).toBe("unknown");
  });

  it("handles an IPv6 address and stray whitespace", () => {
    expect(clientAddress("  2001:db8::1  ")).toBe("2001:db8::1");
    expect(clientAddress("198.51.100.1,   2001:db8::1 ")).toBe("2001:db8::1");
  });
});

/**
 * The consequence, rather than the parsing.
 *
 * A caller rotating the header must exhaust one allowance, not one per value
 * they invent. This is what the limit is for and what the first-hop version
 * quietly did not do.
 */
describe("a caller rotating X-Forwarded-For", () => {
  it("still runs out of tokens", () => {
    resetRateLimits();
    const real = "203.0.113.99";

    let allowed = 0;
    for (let i = 0; i < PUBLIC_READ_LIMIT.limit + 25; i += 1) {
      const header = `${i}.${i}.${i}.${i}, ${real}`;
      if (consumeToken(`share:${clientAddress(header)}`, PUBLIC_READ_LIMIT).ok) allowed += 1;
    }

    expect(allowed).toBe(PUBLIC_READ_LIMIT.limit);
    resetRateLimits();
  });
});
