import { describe, expect, it } from "vitest";

import {
  expiryFromChoice,
  isShareTokenShape,
  randomShareToken,
  SHARE_TOKEN_LENGTH,
  SHARE_VIEW_STAMP_MS,
  shareLinkLive,
  shareUrl,
  shouldStampView,
} from "@/lib/share-link";

describe("randomShareToken", () => {
  it("produces a token of the fixed length, in the URL alphabet", () => {
    const token = randomShareToken();
    expect(token).toHaveLength(SHARE_TOKEN_LENGTH);
    expect(isShareTokenShape(token)).toBe(true);
  });

  it("survives a round trip through a URL without escaping", () => {
    const token = randomShareToken();
    expect(encodeURIComponent(token)).toBe(token);
  });

  /*
   * The alphabet has 64 symbols and a byte has 256 values, so `byte % 64` must
   * be exactly uniform. This asserts the mapping directly: bytes 0, 64, 128 and
   * 192 are four different draws that all have to land on the *same* symbol,
   * which is what "no bias" means here. A rejection loop or a `% 63` would
   * break one of these.
   */
  it("maps every byte onto the alphabet without bias", () => {
    const bytes = new Uint8Array(SHARE_TOKEN_LENGTH);
    bytes[0] = 0;
    bytes[1] = 64;
    bytes[2] = 128;
    bytes[3] = 192;
    bytes[4] = 63;
    bytes[5] = 255;

    const token = randomShareToken(bytes);
    expect(token[0]).toBe("A");
    expect(token[1]).toBe("A");
    expect(token[2]).toBe("A");
    expect(token[3]).toBe("A");
    expect(token[4]).toBe("_");
    expect(token[5]).toBe("_");
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 200 }, () => randomShareToken()));
    expect(seen.size).toBe(200);
  });
});

describe("isShareTokenShape", () => {
  it("rejects everything a scanner is likely to try", () => {
    for (const junk of [
      "",
      "wp-admin",
      "../../etc/passwd",
      "%2e%2e%2f",
      "a".repeat(SHARE_TOKEN_LENGTH - 1),
      "a".repeat(SHARE_TOKEN_LENGTH + 1),
      // Right length, wrong alphabet: a base64 token with padding and slashes
      // would reach the database on a loose check.
      `${"a".repeat(SHARE_TOKEN_LENGTH - 1)}/`,
      `${"a".repeat(SHARE_TOKEN_LENGTH - 1)}+`,
      `${"a".repeat(SHARE_TOKEN_LENGTH - 1)}=`,
      `${"a".repeat(SHARE_TOKEN_LENGTH - 1)} `,
    ]) {
      expect(isShareTokenShape(junk), junk).toBe(false);
    }
  });

  it("does not let a newline smuggle a valid token past the anchors", () => {
    // JavaScript's `$` does not match before a trailing newline, unlike the
    // same expression in Python or Perl — but add an `m` flag, or port this
    // check to a script, and it does. Pinned here because the difference is
    // invisible in the pattern itself.
    expect(isShareTokenShape(`${randomShareToken()}\n`)).toBe(false);
    expect(isShareTokenShape(`\n${randomShareToken()}`)).toBe(false);
  });
});

describe("shareLinkLive", () => {
  const now = new Date("2026-09-08T10:00:00Z");

  it("treats a missing link as not live", () => {
    expect(shareLinkLive(null, now)).toBe(false);
    expect(shareLinkLive(undefined, now)).toBe(false);
  });

  it("is live with no expiry", () => {
    expect(shareLinkLive({ expiresAt: null }, now)).toBe(true);
  });

  it("is live before the expiry and dead after it", () => {
    expect(shareLinkLive({ expiresAt: new Date("2026-09-08T10:00:01Z") }, now)).toBe(true);
    expect(shareLinkLive({ expiresAt: new Date("2026-09-08T09:59:59Z") }, now)).toBe(false);
  });

  it("is dead exactly on the boundary", () => {
    // A link that expires at 10:00 is not readable at 10:00. The other way
    // round is a second of access nobody asked for, and it is the kind of
    // off-by-one that only ever shows up in an argument about it.
    expect(shareLinkLive({ expiresAt: new Date(now) }, now)).toBe(false);
  });
});

describe("shouldStampView", () => {
  const now = new Date("2026-09-08T10:00:00Z");

  it("stamps a link nobody has opened yet", () => {
    expect(shouldStampView(null, now)).toBe(true);
  });

  it("holds off inside the window and stamps once past it", () => {
    expect(shouldStampView(new Date(now.getTime() - SHARE_VIEW_STAMP_MS + 1), now)).toBe(false);
    expect(shouldStampView(new Date(now.getTime() - SHARE_VIEW_STAMP_MS), now)).toBe(true);
  });

  /*
   * The point of the throttle, said as an assertion: a thousand hits in a
   * second must produce no writes after the first. Without this the page is a
   * write endpoint that anyone on the internet can call.
   */
  it("answers no for a burst of traffic", () => {
    const stamped = new Date(now.getTime() - 1000);
    const writes = Array.from({ length: 1000 }, (_, i) =>
      shouldStampView(stamped, new Date(now.getTime() + i)),
    ).filter(Boolean);
    expect(writes).toHaveLength(0);
  });
});

describe("shareUrl", () => {
  it("builds the address, with or without a trailing slash on the origin", () => {
    expect(shareUrl("https://kanovra.app", "abc")).toBe("https://kanovra.app/share/abc");
    expect(shareUrl("https://kanovra.app/", "abc")).toBe("https://kanovra.app/share/abc");
    expect(shareUrl("http://localhost:3000//", "abc")).toBe("http://localhost:3000/share/abc");
  });
});

describe("expiryFromChoice", () => {
  const now = new Date("2026-09-08T10:00:00Z");

  it("counts forward from now", () => {
    expect(expiryFromChoice("7d", now)?.toISOString()).toBe("2026-09-15T10:00:00.000Z");
    expect(expiryFromChoice("30d", now)?.toISOString()).toBe("2026-10-08T10:00:00.000Z");
    expect(expiryFromChoice("90d", now)?.toISOString()).toBe("2026-12-07T10:00:00.000Z");
  });

  it("returns null for the choice that has no end", () => {
    expect(expiryFromChoice("never", now)).toBeNull();
  });

  it("gives an unknown choice no expiry rather than an invalid date", () => {
    // The value arrives from a browser. `new Date(NaN)` stored in a nullable
    // column is a link that expires at an unreadable moment; null is at least
    // a state the rest of the code already handles.
    expect(expiryFromChoice("6 months" as never, now)).toBeNull();
  });
});
