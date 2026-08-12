import { MindMapType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { nodeSize, parseCanvas, rankScale } from "@/lib/mind-map-canvas";

/**
 * Reading a map back out of the database.
 *
 * A map lives in one JSON column, so this function is the only thing standing
 * between a row and a blank page. What it must never do is answer a single bad
 * value with an empty canvas: the caller seeds an empty canvas with a fresh
 * centre node, so "one node had a bad hue" and "this map has been wiped" look
 * identical to whoever opens it.
 */

const good = { id: "a", text: "Root", x: 0, y: 0, parentId: null, rank: 1 };

describe("parseCanvas", () => {
  it("keeps a node's emoji and border hue", () => {
    const canvas = parseCanvas({ nodes: [{ ...good, emoji: "🔥", hue: 268 }] });
    expect(canvas.nodes[0].emoji).toBe("🔥");
    expect(canvas.nodes[0].hue).toBe(268);
  });

  it("keeps a multi-codepoint emoji whole", () => {
    const family = "👨‍👩‍👧‍👦";
    const canvas = parseCanvas({ nodes: [{ ...good, emoji: family }] });
    expect(canvas.nodes[0].emoji).toBe(family);
  });

  it("drops only the offending node, never the whole map", () => {
    const canvas = parseCanvas({
      nodes: [
        good,
        { ...good, id: "b", parentId: "a", hue: 4000 },
        { ...good, id: "c", parentId: "a" },
      ],
    });

    expect(canvas.nodes.map((n) => n.id)).toEqual(["a", "c"]);
  });

  it("survives a node that is not an object at all", () => {
    const canvas = parseCanvas({ nodes: [good, null, "nope", 7] });
    expect(canvas.nodes.map((n) => n.id)).toEqual(["a"]);
  });

  it("reattaches a node whose parent is gone rather than losing it", () => {
    const canvas = parseCanvas({
      nodes: [good, { ...good, id: "b", parentId: "vanished" }],
    });

    expect(canvas.nodes.find((n) => n.id === "b")?.parentId).toBe("a");
  });

  it("reads a row from the older shape as an empty canvas", () => {
    expect(parseCanvas({}).nodes).toEqual([]);
    expect(parseCanvas(null).nodes).toEqual([]);
    expect(parseCanvas({ slots: ["old"] }).nodes).toEqual([]);
  });

  it("does not confuse an empty map with a broken one", () => {
    expect(parseCanvas({ nodes: [] }).nodes).toEqual([]);
  });
});

describe("nodeSize", () => {
  it("keeps a round node round, so it is a circle and not an ellipse", () => {
    const { w, h } = nodeSize(MindMapType.BUBBLE, 0);
    expect(w).toBe(h);
  });

  it("draws the line-running types wider than they are tall", () => {
    const pill = nodeSize(MindMapType.FLOW, 0);
    const box = nodeSize(MindMapType.TREE, 0);
    expect(pill.w).toBeGreaterThan(pill.h);
    expect(box.w).toBeGreaterThan(box.h);
  });

  it("scales by rank in both directions without limit", () => {
    const small = nodeSize(MindMapType.TREE, -3);
    const normal = nodeSize(MindMapType.TREE, 0);
    const large = nodeSize(MindMapType.TREE, 3);

    expect(small.w).toBeLessThan(normal.w);
    expect(large.w).toBeGreaterThan(normal.w);
    // Geometric, so a step is the same proportion at every size — a linear step
    // is a modest change on a large node and wipes out a small one.
    expect(large.w / normal.w).toBeCloseTo(normal.w / small.w, 6);
  });

  it("stays a positive size at the extremes the schema allows", () => {
    for (const rank of [-40, 40]) {
      const { w, h } = nodeSize(MindMapType.TREE, rank);
      expect(w).toBeGreaterThan(0);
      expect(Number.isFinite(w)).toBe(true);
      expect(Number.isFinite(h)).toBe(true);
    }
  });
});

describe("rankScale", () => {
  it("is 1 at rank 0 and symmetric about it", () => {
    expect(rankScale(0)).toBe(1);
    expect(rankScale(2) * rankScale(-2)).toBeCloseTo(1, 10);
  });
});
