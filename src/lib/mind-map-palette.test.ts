import { describe, expect, it } from "vitest";

import { MAP_PRESETS, MAP_TONES, readPalette, toneValues } from "@/lib/mind-map-palette";

/**
 * A palette arrives from two nullable columns, and both of them can hold
 * something this build does not understand: a row written before the columns
 * existed, or a tone added by a later version and then rolled back. Neither is
 * worth an error on screen — the map draws in its type's colour, which is what
 * it did before anybody could choose. The fallback is the feature.
 */
describe("reading a map's palette", () => {
  it("falls back to the type's own hue when the map has none", () => {
    expect(readPalette(88, null, null)).toEqual({ hue: 88, tone: "vivid" });
    expect(readPalette(88, undefined, undefined).hue).toBe(88);
  });

  it("takes the map's hue when it has one", () => {
    expect(readPalette(88, 268, "deep")).toEqual({ hue: 268, tone: "deep" });
  });

  it("wraps a hue into the circle rather than rejecting it", () => {
    // 0 and 360 are the same colour, and a slider that can reach both should not
    // produce a map that draws differently at each end.
    expect(readPalette(88, 360, null).hue).toBe(0);
    expect(readPalette(88, 400, null).hue).toBe(40);
    expect(readPalette(88, -20, null).hue).toBe(340);
  });

  it("ignores a tone it does not know, rather than drawing nothing", () => {
    expect(readPalette(88, 10, "iridescent").tone).toBe("vivid");
    expect(readPalette(88, 10, "").tone).toBe("vivid");
  });

  it("ignores a hue that is not a number", () => {
    expect(readPalette(88, Number.NaN, null).hue).toBe(88);
  });
});

describe("the tones and the presets", () => {
  it("gives every tone a full set of numbers", () => {
    for (const { tone } of MAP_TONES) {
      const values = toneValues(tone);
      expect(values.accent.s).toBeGreaterThanOrEqual(0);
      expect(values.ring.cap).toBeGreaterThan(values.ring.base);
      expect(values.ring.s).toBeGreaterThanOrEqual(values.ring.floor);
    }
  });

  it("offers presets that are all real palettes", () => {
    for (const preset of MAP_PRESETS) {
      expect(preset.palette.hue).toBeGreaterThanOrEqual(0);
      expect(preset.palette.hue).toBeLessThan(360);
      expect(MAP_TONES.some((t) => t.tone === preset.palette.tone)).toBe(true);
    }
  });

  it("gives every preset its own id and its own colour", () => {
    const ids = MAP_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const colours = MAP_PRESETS.map((p) => `${p.palette.hue}:${p.palette.tone}`);
    expect(new Set(colours).size).toBe(colours.length);
  });
});
