import { MindMapType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { MIND_MAP_META, MIND_MAP_ORDER, mindMapStyle } from "@/lib/mind-maps";

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
