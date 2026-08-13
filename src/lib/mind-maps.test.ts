import { MindMapType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  isRetiredMapType,
  MIND_MAP_META,
  MIND_MAP_ORDER,
  RETIRED_MAP_TYPES,
} from "@/lib/mind-maps";

/**
 * Which map types the product offers.
 *
 * Two of the original eight were withdrawn while rows of them still existed, so
 * the enum keeps them and the interface does not. That split is easy to undo by
 * accident — adding a type back to the picker is one line — which is why it is
 * asserted rather than left to the reader of a comment.
 */

describe("retired types", () => {
  it("offers nothing that has been withdrawn", () => {
    for (const type of MIND_MAP_ORDER) {
      expect(isRetiredMapType(type)).toBe(false);
    }
  });

  it("withdraws bridge and double bubble, and nothing else", () => {
    expect([...RETIRED_MAP_TYPES].sort()).toEqual(
      [MindMapType.BRIDGE, MindMapType.DOUBLE_BUBBLE].sort(),
    );
  });

  it("accounts for every type in the enum exactly once", () => {
    const all = Object.values(MindMapType);
    const offered = new Set(MIND_MAP_ORDER);

    expect(offered.size).toBe(MIND_MAP_ORDER.length);
    expect(offered.size + RETIRED_MAP_TYPES.size).toBe(all.length);

    for (const type of all) {
      // Either offered or withdrawn — never both, and never neither, which is
      // how a type ends up unreachable with nobody noticing.
      expect(offered.has(type) !== isRetiredMapType(type)).toBe(true);
    }
  });

  it("keeps a label and a question for a withdrawn type", () => {
    // The row survives, so anything that reports on it still needs words.
    for (const type of RETIRED_MAP_TYPES) {
      expect(MIND_MAP_META[type].label.length).toBeGreaterThan(0);
      expect(MIND_MAP_META[type].question.length).toBeGreaterThan(0);
    }
  });
});
