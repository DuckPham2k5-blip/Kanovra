import { describe, expect, it } from "vitest";

import {
  bloomBox,
  insideBloom,
  moteAlpha,
  moteAt,
  moteCount,
  moteInk,
  motePath,
} from "@/lib/ambient-motes";

/**
 * The ambient motes, checked as arithmetic because they cannot be checked as a
 * picture.
 *
 * They are painted by a `requestAnimationFrame` loop onto a canvas, which does
 * not run in a hidden tab and leaves nothing a test can read. The one fault this
 * code has already had was invisible in a still frame anyway: the dark theme
 * spawned motes on the bloom's rim and then interpolated them *back into* the
 * bloom, so the effect ran, drew, and went the wrong way.
 *
 * So the direction is what these assert, rather than any particular coordinate.
 */

const REM = 16;
const WIDTH = 1440;
const HEIGHT = 900;
const REACH = Math.max(WIDTH, HEIGHT);

const ANGLES = [0, Math.PI / 3, Math.PI, (4 * Math.PI) / 3, 5.9];

describe("motePath", () => {
  it("falls inward on the light theme: outside the bloom, ending at it", () => {
    const bloom = bloomBox(WIDTH, REM);
    for (const angle of ANGLES) {
      const path = motePath(bloom, angle, REACH, false);
      expect(insideBloom(bloom, path.from)).toBe(false);
      expect(path.to).toEqual({ x: bloom.x, y: bloom.y });
    }
  });

  it("spreads outward on the dark theme: the same journey, reversed", () => {
    const bloom = bloomBox(WIDTH, REM);
    for (const angle of ANGLES) {
      const path = motePath(bloom, angle, REACH, true);
      expect(insideBloom(bloom, path.from)).toBe(true);
      expect(insideBloom(bloom, path.to)).toBe(false);
    }
  });

  /*
   * The actual regression. Both themes used to share a destination, so this pair
   * of distances was identical instead of opposite, and the dark theme ran
   * backwards while looking entirely plausible in a screenshot.
   */
  it("moves away from the bloom in the dark and toward it in the light", () => {
    const bloom = bloomBox(WIDTH, REM);
    const gap = (point: { x: number; y: number }) =>
      Math.hypot(point.x - bloom.x, point.y - bloom.y);

    for (const angle of ANGLES) {
      const light = motePath(bloom, angle, REACH, false);
      const dark = motePath(bloom, angle, REACH, true);

      expect(gap(moteAt(light, 0.9))).toBeLessThan(gap(moteAt(light, 0.1)));
      expect(gap(moteAt(dark, 0.9))).toBeGreaterThan(gap(moteAt(dark, 0.1)));
    }
  });

  it("ends where it says it ends", () => {
    const bloom = bloomBox(WIDTH, REM);
    const path = motePath(bloom, 1.2, REACH, false);
    expect(moteAt(path, 0)).toEqual(path.from);
    expect(moteAt(path, 1)).toEqual(path.to);
  });
});

describe("bloomBox", () => {
  it("sits where the bloom's own CSS puts it, not at the middle of the screen", () => {
    const bloom = bloomBox(WIDTH, REM);
    expect(bloom.x).toBe(WIDTH / 2);
    // 9rem down, against a viewport middle of 450px — aiming at the geometric
    // centre would miss by a third of the screen.
    expect(bloom.y).toBe(144);
    expect(HEIGHT / 2 - bloom.y).toBeGreaterThan(250);
  });
});

describe("moteAlpha", () => {
  it("is invisible at both ends of the path and lit in between", () => {
    for (const dark of [true, false]) {
      expect(moteAlpha(0, dark)).toBe(0);
      expect(moteAlpha(1, dark)).toBe(0);
      expect(moteAlpha(0.5, dark)).toBeGreaterThan(0);
    }
  });

  it("never exceeds its ceiling or drops below nothing", () => {
    for (let t = -0.5; t <= 1.5; t += 0.05) {
      const value = moteAlpha(t, true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0.95);
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  /*
   * These are meant to read as stars. At the brightness they started with, a
   * mote over a near-black backdrop was a smudge — the complaint that produced
   * this number. Light stays lower because black ink on a pale page is already
   * high contrast and matching it there gives a field of hard dots competing
   * with the text.
   */
  it("is brighter on the dark theme than on the light one", () => {
    expect(moteAlpha(0.5, true)).toBeGreaterThan(moteAlpha(0.5, false));
    expect(moteAlpha(0.5, true)).toBeGreaterThan(0.9);
  });

  it("answers a nonsense position with nothing rather than NaN", () => {
    // A frame delta of zero, a resize mid-flight — anything that divides badly
    // upstream arrives here, and `NaN` as a canvas alpha silently paints nothing
    // while looking like a layer that is simply switched off.
    expect(moteAlpha(Number.NaN, true)).toBe(0);
    expect(moteAlpha(Number.POSITIVE_INFINITY, false)).toBe(0);
  });
});

describe("moteInk", () => {
  /*
   * The light theme is black, flatly — not a dark mix of the accent. Against a
   * pale backdrop the accent at any weight reads as a smudge of colour rather
   * than as a point of ink, and the effect is meant to be points. Pinned because
   * this is the kind of rule that gets "tidied" into a mix by somebody making
   * the two themes look consistent.
   */
  it("is black on the light theme whatever the accent is", () => {
    for (const accent of ["rgb(108, 63, 243)", "#14b8a6", "hsl(38 95% 44%)"]) {
      expect(moteInk(false, accent)).toBe("#000000");
    }
  });

  it("takes the page's own accent on the dark theme", () => {
    expect(moteInk(true, "rgb(108, 63, 243)")).toBe("rgb(108, 63, 243)");
  });
});

describe("moteCount", () => {
  it("scales with area but refuses to run away with a big screen", () => {
    expect(moteCount(390, 780)).toBe(28);
    expect(moteCount(1440, 900)).toBeGreaterThan(28);
    expect(moteCount(3840, 2160)).toBe(150);
  });
});
