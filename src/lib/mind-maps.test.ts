import { MindMapType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { MIND_MAP_META, MIND_MAP_ORDER, mindMapStyle, radialShade } from "@/lib/mind-maps";

/**
 * The map types the product offers.
 *
 * This file used to guard a split between types that existed in the enum and
 * types the interface would show, because bridge and double bubble were withdrawn
 * while rows of them still existed. They have since been removed outright, so the
 * split is gone and the invariant worth holding is the simpler one: the picker and
 * the enum agree exactly.
 *
 * It is worth asserting rather than assuming. Adding a type to the enum and
 * forgetting the picker produces a type that can exist in the database and cannot
 * be made or found — which is precisely the state bridge and double bubble were
 * left in on purpose, and precisely the state nothing should reach by accident.
 */

describe("map types", () => {
  it("offers every type in the enum, exactly once", () => {
    const all = Object.values(MindMapType);
    const offered = new Set(MIND_MAP_ORDER);

    expect(MIND_MAP_ORDER.length).toBe(offered.size);
    expect(offered.size).toBe(all.length);
    for (const type of all) expect(offered.has(type)).toBe(true);
  });

  it("no longer knows anything about bridge or double bubble", () => {
    // Reads as a string comparison because the enum members are gone. That is the
    // point: if either is ever reintroduced, this fails and asks for a decision.
    const names = Object.values(MindMapType) as string[];
    expect(names).not.toContain("BRIDGE");
    expect(names).not.toContain("DOUBLE_BUBBLE");
  });

  it("gives every type a label, a question and a style", () => {
    for (const type of MIND_MAP_ORDER) {
      expect(MIND_MAP_META[type].label.length).toBeGreaterThan(0);
      // The picker asks somebody to choose how to think, so the question is the
      // part that has to be there — not the shape.
      expect(MIND_MAP_META[type].question).toMatch(/\?$/);
      expect(mindMapStyle(type)).toBeDefined();
    }
  });

  it("gives each type its own hue, so no two maps share a wash", () => {
    const hues = MIND_MAP_ORDER.map((type) => MIND_MAP_META[type].hue);
    expect(new Set(hues).size).toBe(hues.length);
  });
});

/**
 * A wheel segment's outline has to be visible on a backdrop nobody controls: the
 * theme flips it from near-black to near-white, and the map's own backdrop is a
 * gradient that is dark at one corner and pale at the other within a single
 * theme. So the promise is not a colour, it is a *distance from the fill* — half
 * the stroke lies on the segment, which is the one surface always behind it.
 *
 * The first outline was chosen against the ground instead, pale and one pixel
 * wide, and measuring a real boundary found exactly one pixel of it beside a gap
 * seven to nine pixels wide. It was drawn and it could not be seen.
 */
describe("radial segment outline", () => {
  const lightnessOf = (colour: string) => {
    const match = colour.match(/hsl\(\d+ \d+% (\d+(?:\.\d+)?)%/);
    if (!match) throw new Error(`not an hsl colour: ${colour}`);
    return Number(match[1]);
  };

  it("stays well darker than the fill it outlines, at every depth", () => {
    for (let depth = 1; depth <= 12; depth++) {
      const { fill, outline } = radialShade(120, depth);
      expect(lightnessOf(fill) - lightnessOf(outline)).toBeGreaterThanOrEqual(20);
    }
  });

  it("keeps the segment's own hue, so one wheel stays one colour", () => {
    for (const hue of [0, 88, 210, 359]) {
      expect(radialShade(hue, 3).outline.startsWith(`hsl(${hue} `)).toBe(true);
    }
  });

  it("never asks for a lightness outside the range a colour has", () => {
    for (let depth = 1; depth <= 12; depth++) {
      const lightness = lightnessOf(radialShade(200, depth).outline);
      expect(lightness).toBeGreaterThanOrEqual(0);
      expect(lightness).toBeLessThanOrEqual(100);
    }
  });
});
