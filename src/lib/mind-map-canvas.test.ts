import { MindMapType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  RANK_MAX,
  RANK_MIN,
  RANK_RATIO,
  clampRank,
  controlScale,
  nodeSize,
  parseCanvas,
  rankFromRatio,
  rankScale,
} from "@/lib/mind-map-canvas";

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

  /*
   * `rank` was an integer while the only way to change size was a menu stepping
   * by one. A resize drag writes whatever proportion the pointer travelled, so a
   * schema that still insisted on whole numbers would drop every node anybody
   * resized — silently, one node at a time, on the reload after the save.
   */
  it("keeps the fractional rank a resize drag writes", () => {
    const canvas = parseCanvas({ nodes: [{ ...good, rank: 1.37 }] });
    expect(canvas.nodes[0].rank).toBeCloseTo(1.37, 10);
  });

  it("still refuses a rank outside the bounds", () => {
    expect(parseCanvas({ nodes: [good, { ...good, id: "b", rank: 900 }] }).nodes).toHaveLength(1);
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

/**
 * The arithmetic of dragging a node's corner.
 *
 * The gesture is: press the grip, and whatever proportion the pointer moves away
 * from the node's centre, the node grows by. So the property worth pinning is not
 * a formula but that promise — drag to 1.5× the distance, get a node 1.5× the
 * size — because that is the whole of what makes the drag feel attached to the
 * pointer rather than merely correlated with it.
 */
describe("rankFromRatio", () => {
  it("leaves the node alone when the pointer has not moved", () => {
    expect(rankFromRatio(2, 1)).toBeCloseTo(2, 10);
  });

  it("grows the node by exactly the proportion the pointer moved out", () => {
    for (const start of [-6, 0, 3.4]) {
      for (const ratio of [0.4, 1.5, 3]) {
        const before = nodeSize(MindMapType.TREE, start).w;
        const after = nodeSize(MindMapType.TREE, rankFromRatio(start, ratio)).w;
        expect(after / before).toBeCloseTo(ratio, 6);
      }
    }
  });

  it("is one whole step at the ratio a menu step means", () => {
    expect(rankFromRatio(0, RANK_RATIO)).toBeCloseTo(1, 10);
    expect(rankFromRatio(0, 1 / RANK_RATIO)).toBeCloseTo(-1, 10);
  });

  it("moves smoothly rather than in whole steps, which is why rank is not an int", () => {
    const rank = rankFromRatio(0, 1.1);
    expect(Number.isInteger(rank)).toBe(false);
    expect(rank).toBeGreaterThan(0);
    expect(rank).toBeLessThan(1);
  });

  /*
   * A drag flung to the edge of the plane must not write a rank the parser will
   * then refuse, because the node would come back as one dropped node — and
   * `parseCanvas` drops nodes silently by design.
   */
  it("cannot be dragged outside the range the schema reads back", () => {
    expect(rankFromRatio(RANK_MAX - 1, 1e6)).toBe(RANK_MAX);
    expect(rankFromRatio(RANK_MIN + 1, 1e-6)).toBe(RANK_MIN);

    const node = { id: "a", text: "", x: 0, y: 0, parentId: null };
    for (const rank of [rankFromRatio(RANK_MAX, 1e6), rankFromRatio(RANK_MIN, 1e-6)]) {
      expect(parseCanvas({ nodes: [{ ...node, rank }] }).nodes).toHaveLength(1);
    }
  });

  /*
   * A ratio of zero has no logarithm. Left unguarded it puts NaN into the node,
   * which renders as a box with no size and is then saved over the real value —
   * a drag that destroys the node it was meant to resize.
   */
  it("answers a ratio with no logarithm by leaving the rank where it was", () => {
    for (const ratio of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(rankFromRatio(3, ratio)).toBe(3);
    }
  });
});

/**
 * The controls that hang off a node: the `+`, the `…`, the comment badge, the
 * resize grip.
 *
 * This has been wrong twice in opposite directions, and is now settled a third
 * way — by the owner, who asked for controls that follow the node's size after
 * using the compromise. A hard ceiling froze them on any node past about rank 6.
 * A square root fixed that and left them looking detached on a large node, which
 * is the complaint that arrived next.
 *
 * They keep pace with the node now, and the cap is all that survives of the
 * middle position: past roughly six times, an overlay large enough to be measured
 * in hundreds of pixels covers the shape it belongs to, hides the resize grip and
 * anchors its menu away from the pointer. That failure was reported once and the
 * cap is where it starts.
 *
 * So the invariant, rather than the formula, is what these hold.
 */
describe("controlScale", () => {
  it("grows with the node, so it never freezes into a speck", () => {
    expect(controlScale(6)).toBeGreaterThan(controlScale(0));
    expect(controlScale(12)).toBeGreaterThan(controlScale(6));
  });

  /*
   * The one that matters now. A control has to stay the same *fraction* of its
   * node between the floor and the cap, or it reads as belonging to the canvas
   * rather than to the node it hangs off — which is what was reported.
   */
  it("keeps pace with the node between the floor and the cap", () => {
    for (const rank of [1, 2, 4, 6]) {
      const node = rankScale(rank);
      if (node > 6 || node < 0.85) continue;
      expect(controlScale(rank)).toBeCloseTo(node, 6);
    }
  });

  it("stays clickable on a node shrunk to a dot, and bounded on a huge one", () => {
    for (const rank of [-40, -12, -1, 0, 1, 12, 40]) {
      const scale = controlScale(rank);
      expect(scale).toBeGreaterThanOrEqual(0.85);
      expect(scale).toBeLessThanOrEqual(6);
      expect(Number.isFinite(scale)).toBe(true);
    }
  });

  it("answers nonsense with the ordinary size rather than NaN", () => {
    expect(controlScale(Number.NaN)).toBe(controlScale(0));
  });
});

describe("clampRank", () => {
  it("holds the schema's own bounds", () => {
    expect(clampRank(RANK_MAX + 10)).toBe(RANK_MAX);
    expect(clampRank(RANK_MIN - 10)).toBe(RANK_MIN);
    expect(clampRank(2.5)).toBe(2.5);
    expect(clampRank(Number.NaN)).toBe(0);
  });
});
