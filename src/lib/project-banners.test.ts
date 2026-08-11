import { describe, expect, it } from "vitest";

import { bannerPresetCss, sanitiseBannerUrl } from "@/lib/project-banners";

/**
 * The returned string is dropped into a CSS `url("…")` and stored in a row
 * every member of the project will load. Everything here is about what must
 * never survive that trip.
 */
describe("sanitiseBannerUrl", () => {
  it("accepts an ordinary https link", () => {
    expect(sanitiseBannerUrl("https://example.com/banner.png")).toBe(
      "https://example.com/banner.png",
    );
  });

  it("accepts a gif, since animated banners are allowed", () => {
    expect(sanitiseBannerUrl("https://example.com/loop.gif")).toBe(
      "https://example.com/loop.gif",
    );
  });

  it("trims surrounding whitespace from a pasted link", () => {
    expect(sanitiseBannerUrl("  https://example.com/a.png\n")).toBe(
      "https://example.com/a.png",
    );
  });

  it("rejects http, which a TLS page refuses to load anyway", () => {
    // Accepting it would store a link that silently never renders.
    expect(sanitiseBannerUrl("http://example.com/a.png")).toBeNull();
  });

  it("rejects javascript: and data: URLs", () => {
    expect(sanitiseBannerUrl("javascript:alert(1)")).toBeNull();
    expect(sanitiseBannerUrl("data:image/svg+xml,<svg onload='alert(1)'/>")).toBeNull();
  });

  it("rejects a link carrying credentials", () => {
    // Otherwise somebody's password ends up in the project row, and on the
    // screen of everyone who opens it.
    expect(sanitiseBannerUrl("https://user:hunter2@example.com/a.png")).toBeNull();
  });

  it("rejects text that is not a URL at all", () => {
    expect(sanitiseBannerUrl("example.com/a.png")).toBeNull();
    expect(sanitiseBannerUrl("")).toBeNull();
    expect(sanitiseBannerUrl("   ")).toBeNull();
  });

  it("encodes the characters that could close the CSS url() early", () => {
    const out = sanitiseBannerUrl('https://example.com/a.png?q=");background:red;("');
    expect(out).not.toBeNull();
    expect(out).not.toContain('"');
    expect(out).not.toContain("(");
    expect(out).not.toContain(")");
  });

  it("leaves no whitespace in the result", () => {
    const out = sanitiseBannerUrl("https://example.com/my banner.png");
    expect(out).not.toBeNull();
    expect(out).not.toMatch(/\s/);
  });
});

describe("bannerPresetCss", () => {
  it("returns a gradient for a known preset", () => {
    expect(bannerPresetCss("aurora")).toContain("linear-gradient");
  });

  it("returns null for anything else, so a stale id paints nothing", () => {
    expect(bannerPresetCss("does-not-exist")).toBeNull();
    expect(bannerPresetCss(null)).toBeNull();
    expect(bannerPresetCss(undefined)).toBeNull();
  });
});
