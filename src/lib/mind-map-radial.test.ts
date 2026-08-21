import { describe, expect, it } from "vitest";

import { type CanvasNode, type RadialSettings } from "@/lib/mind-map-canvas";
import {
  HUB_RADIUS,
  labelPlacement,
  radialLayout,
  radialReach,
  sectorPath,
  shareBetween,
  shortestTurn,
} from "@/lib/mind-map-radial";

/**
 * A radial map's arithmetic.
 *
 * The whole point of storing a *share* of the parent's angle rather than a pair
 * of absolute angles is that "the children exactly fill their parent" stops
 * being a rule to enforce and becomes the only thing the arithmetic can produce.
 * These tests hold that claim to account, because it is the claim every other
 * operation — split, delete, drag a boundary — leans on.
 */

const WHEEL: RadialSettings = { start: -90, sweep: 360 };

function node(id: string, parentId: string | null, extra: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id,
    text: id,
    x: 0,
    y: 0,
    parentId,
    rank: 0,
    weight: 1,
    thickness: 110,
    ...extra,
  };
}

/** Root, three branches, and two sub-branches under the first. */
function wheel(): CanvasNode[] {
  return [
    node("hub", null),
    node("a", "hub"),
    node("a1", "a"),
    node("a2", "a"),
    node("b", "hub"),
    node("c", "hub"),
  ];
}

describe("radialLayout", () => {
  it("puts the title in the hub, with no angle of its own", () => {
    const sectors = radialLayout(wheel(), WHEEL);
    const hub = sectors.get("hub")!;

    expect(hub.depth).toBe(0);
    expect(hub.r0).toBe(0);
    expect(hub.r1).toBe(HUB_RADIUS);
  });

  it("shares the whole sweep between the top-level branches", () => {
    const sectors = radialLayout(wheel(), WHEEL);
    const spans = ["a", "b", "c"].map((id) => {
      const s = sectors.get(id)!;
      return s.a1 - s.a0;
    });

    for (const span of spans) expect(span).toBeCloseTo(120, 6);
    expect(spans.reduce((sum, s) => sum + s, 0)).toBeCloseTo(360, 6);
  });

  it("starts the first branch where the map says it starts", () => {
    expect(radialLayout(wheel(), WHEEL).get("a")!.a0).toBeCloseTo(-90, 6);
    expect(radialLayout(wheel(), { start: 30, sweep: 360 }).get("a")!.a0).toBeCloseTo(30, 6);
  });

  it("leaves the rest of the circle alone when the sweep is partial", () => {
    const sectors = radialLayout(wheel(), { start: -90, sweep: 270 });

    for (const id of ["a", "b", "c"]) {
      const s = sectors.get(id)!;
      expect(s.a0).toBeGreaterThanOrEqual(-90 - 1e-9);
      expect(s.a1).toBeLessThanOrEqual(180 + 1e-9);
    }
    expect(sectors.get("c")!.a1).toBeCloseTo(180, 6);
  });

  it("gives a branch twice the weight twice the angle", () => {
    const nodes = wheel().map((n) => (n.id === "a" ? { ...n, weight: 2 } : n));
    const sectors = radialLayout(nodes, WHEEL);

    const a = sectors.get("a")!;
    const b = sectors.get("b")!;
    expect(a.a1 - a.a0).toBeCloseTo((b.a1 - b.a0) * 2, 6);
  });

  it("has every child exactly fill its parent, leaving no gap and no overlap", () => {
    const nodes = wheel().map((n) => (n.id === "a1" ? { ...n, weight: 3 } : n));
    const sectors = radialLayout(nodes, WHEEL);

    const parent = sectors.get("a")!;
    const kids = ["a1", "a2"].map((id) => sectors.get(id)!);

    expect(kids[0].a0).toBeCloseTo(parent.a0, 6);
    expect(kids[kids.length - 1].a1).toBeCloseTo(parent.a1, 6);
    // Each one begins exactly where the last ended.
    expect(kids[1].a0).toBeCloseTo(kids[0].a1, 6);
  });

  it("stacks a child's ring directly outside its parent's", () => {
    const sectors = radialLayout(wheel(), WHEEL);

    const a = sectors.get("a")!;
    const a1 = sectors.get("a1")!;
    expect(a.r0).toBe(HUB_RADIUS);
    expect(a.r1).toBe(HUB_RADIUS + 110);
    expect(a1.r0).toBe(a.r1);
    expect(a1.depth).toBe(2);
  });

  it("pushes only its own descendants outward when one branch is made thicker", () => {
    const nodes = wheel().map((n) => (n.id === "a" ? { ...n, thickness: 300 } : n));
    const sectors = radialLayout(nodes, WHEEL);

    // a's children start beyond a's fatter ring…
    expect(sectors.get("a1")!.r0).toBe(HUB_RADIUS + 300);
    // …while its siblings are untouched.
    expect(sectors.get("b")!.r1).toBe(HUB_RADIUS + 110);
  });

  it("never overlaps two branches at the same depth", () => {
    const sectors = [...radialLayout(wheel(), WHEEL).values()].filter((s) => s.depth === 1);
    const sorted = [...sectors].sort((p, q) => p.a0 - q.a0);

    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].a0).toBeGreaterThanOrEqual(sorted[i - 1].a1 - 1e-9);
    }
  });

  it("survives a branch with no siblings and one with zero-ish weight", () => {
    const nodes = [node("hub", null), node("only", "hub", { weight: 0.05 })];
    const sectors = radialLayout(nodes, WHEEL);
    const only = sectors.get("only")!;

    // A lone child takes everything regardless of its weight — a share is only
    // meaningful against siblings.
    expect(only.a1 - only.a0).toBeCloseTo(360, 6);
  });

  it("ignores a node whose parent is not in the map rather than placing it at random", () => {
    const nodes = [node("hub", null), node("stray", "missing")];
    const sectors = radialLayout(nodes, WHEEL);
    expect(sectors.has("stray")).toBe(false);
  });

  it("does not recurse forever on a node that is its own parent", () => {
    const nodes = [node("hub", null), node("loop", "loop")];
    expect(() => radialLayout(nodes, WHEEL)).not.toThrow();
  });
});

describe("radialReach", () => {
  it("measures the outermost edge of the drawing", () => {
    expect(radialReach(radialLayout(wheel(), WHEEL))).toBe(HUB_RADIUS + 220);
  });

  it("is the hub alone for a map with nothing but a title", () => {
    const sectors = radialLayout([node("hub", null)], WHEEL);
    expect(radialReach(sectors)).toBe(HUB_RADIUS);
  });
});

describe("labelPlacement", () => {
  /** A wide, shallow segment at the top of the wheel. */
  const wide = { a0: -120, a1: -60, r0: 200, r1: 260 };
  /** A narrow, deep one on the right. */
  const narrow = { a0: -4, a1: 4, r0: 200, r1: 400 };

  it("runs the text along the arc when it fits there", () => {
    expect(labelPlacement(wide, 60).orientation).toBe("tangential");
  });

  it("runs it outward instead when the arc is too short but the ring is deep", () => {
    expect(labelPlacement(narrow, 120).orientation).toBe("radial");
  });

  it("says so when the words fit neither way", () => {
    expect(labelPlacement({ a0: 0, a1: 3, r0: 100, r1: 130 }, 400).orientation).toBe("none");
  });

  it("keeps a label at the top of the wheel horizontal", () => {
    // Mid angle -90 is twelve o'clock; text along that arc is level.
    const { rotation } = labelPlacement(wide, 60);
    expect(((rotation % 360) + 360) % 360).toBeCloseTo(0, 6);
  });

  it("never leaves a label upside down, anywhere on the wheel", () => {
    for (let mid = -180; mid < 180; mid += 7) {
      for (const ring of [
        { a0: mid - 30, a1: mid + 30, r0: 200, r1: 260 },
        { a0: mid - 3, a1: mid + 3, r0: 200, r1: 400 },
      ]) {
        const { rotation, orientation } = labelPlacement(ring, 60);
        if (orientation === "none") continue;
        const normalised = ((rotation % 360) + 360) % 360;
        // Anything strictly between 90 and 270 reads back to front.
        const readable = normalised <= 90 + 1e-9 || normalised >= 270 - 1e-9;
        expect(readable).toBe(true);
      }
    }
  });

  it("sits in the middle of the segment it labels", () => {
    const { x, y } = labelPlacement({ a0: -90, a1: -90, r0: 100, r1: 200 }, 10);
    // Twelve o'clock at mid-radius 150 is straight up from the centre.
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(-150, 6);
  });
});

describe("shortestTurn", () => {
  it("leaves a small turn alone", () => {
    expect(shortestTurn(20)).toBe(20);
    expect(shortestTurn(-20)).toBe(-20);
  });

  it("takes the short way round instead of nearly a full turn", () => {
    // What `atan2` reports when a drag crosses the nine o'clock line.
    expect(shortestTurn(359)).toBe(-1);
    expect(shortestTurn(-359)).toBe(1);
  });

  it("never reports more than half a turn either way", () => {
    for (let d = -1080; d <= 1080; d += 7) {
      const turn = shortestTurn(d);
      expect(turn).toBeGreaterThan(-180.000001);
      expect(turn).toBeLessThanOrEqual(180);
    }
  });
});

describe("shareBetween", () => {
  it("keeps the pair's total weight, so nothing outside the pair moves", () => {
    const { mine, theirs } = shareBetween(30, 90, 4);
    expect(mine + theirs).toBeCloseTo(4, 9);
  });

  it("puts the shared edge where the pointer is", () => {
    // A third of the way across a 90° pair is a third of the weight.
    const { mine, theirs } = shareBetween(30, 90, 3);
    expect(mine).toBeCloseTo(1, 9);
    expect(theirs).toBeCloseTo(2, 9);
  });

  it("leaves a sliver rather than collapsing a branch to nothing", () => {
    for (const offset of [-500, 0, 90, 500]) {
      const { mine, theirs } = shareBetween(offset, 90, 4);
      expect(mine).toBeGreaterThan(0);
      expect(theirs).toBeGreaterThan(0);
      expect(mine + theirs).toBeCloseTo(4, 9);
    }
  });

  it("does not divide by zero on a pair with no angle at all", () => {
    const { mine, theirs } = shareBetween(10, 0, 2);
    expect(Number.isFinite(mine)).toBe(true);
    expect(Number.isFinite(theirs)).toBe(true);
  });
});

describe("sectorPath", () => {
  it("draws a closed ring segment", () => {
    const d = sectorPath({ a0: 0, a1: 90, r0: 100, r1: 200 });
    expect(d.startsWith("M ")).toBe(true);
    expect(d.trim().endsWith("Z")).toBe(true);
    expect(d).toContain("A");
  });

  it("closes a full turn without collapsing into nothing", () => {
    const d = sectorPath({ a0: 0, a1: 360, r0: 100, r1: 200 });
    // A single arc from an angle back to itself draws zero length, so a full
    // ring has to be built from more than one.
    expect((d.match(/A /g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("keeps its corners on the radii it was given", () => {
    const d = sectorPath({ a0: 0, a1: 90, r0: 100, r1: 200 });

    // Endpoints only. An arc command carries its two radii before its
    // destination, and reading those as a coordinate pair is how this test first
    // accused the geometry of being wrong.
    const points: number[] = [];
    for (const [, command, rest] of d.matchAll(/([MLA]) ([^MLAZ]+)/g)) {
      const numbers = rest.trim().split(/\s+/).map(Number);
      const [x, y] = numbers.slice(-2);
      expect(command === "A" ? numbers.length === 7 : numbers.length === 2).toBe(true);
      points.push(Math.hypot(x, y));
    }

    expect(points.length).toBeGreaterThan(0);
    for (const r of points) {
      const onInner = Math.abs(r - 100) < 1.5;
      const onOuter = Math.abs(r - 200) < 1.5;
      expect(onInner || onOuter).toBe(true);
    }
  });

  it("produces nothing for a segment with no thickness or no angle", () => {
    expect(sectorPath({ a0: 10, a1: 10, r0: 100, r1: 200 })).toBe("");
    expect(sectorPath({ a0: 0, a1: 90, r0: 200, r1: 200 })).toBe("");
  });
});
