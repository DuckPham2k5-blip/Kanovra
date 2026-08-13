import { MindMapType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_THICKNESS,
  DEFAULT_WEIGHT,
  nodeSize,
  type CanvasNode,
} from "@/lib/mind-map-canvas";
import {
  edgeAxis,
  hitsRect,
  pathFromPoints,
  pathLength,
  routeEdge,
  segments,
  type Rect,
} from "@/lib/mind-map-edges";
import { isStructured, layoutNodes } from "@/lib/mind-map-layout";

/**
 * Edge routing, as geometry rather than as a look.
 *
 * "The line goes round the box" is checkable arithmetic, and checking it is the
 * whole reason this lives in its own module instead of inside the component:
 * a path built in JSX can only be judged by looking at it, and looking at it is
 * what let a line run straight under a node for two passes without anybody
 * calling it a bug.
 *
 * Two properties matter and both are asserted here against every laid-out map,
 * not against hand-picked coordinates:
 *
 *   - no node overlaps another node, and
 *   - no edge passes through a node that is not one of its own two ends.
 */

function node(id: string, parentId: string | null, rank = 0): CanvasNode {
  return {
    id,
    text: id,
    x: 0,
    y: 0,
    parentId,
    rank,
    weight: DEFAULT_WEIGHT,
    thickness: DEFAULT_THICKNESS,
  };
}

/** A map of `type` with a shape chosen to stress that type's layout. */
function fixture(type: MindMapType): CanvasNode[] {
  switch (type) {
    case MindMapType.TREE:
      // Deliberately lopsided: one bushy branch beside a bare one is what
      // tangles a naive level-by-level layout. The ranks are deliberately wide
      // apart too — a fixed sibling gap is only ever as safe as the largest
      // node it has to separate, and rank 3 is already wider than the gap.
      return [
        node("root", null, 1),
        node("a", "root", 2),
        node("a1", "a", 3),
        node("a2", "a"),
        node("a3", "a", 3),
        node("b", "root"),
        node("c", "root"),
        node("c1", "c", 4),
        node("c1x", "c1"),
      ];

    case MindMapType.FLOW:
      // Mixed ranks, so the boxes are not all the same size.
      return [
        node("root", null, 1),
        node("s1", "root"),
        node("s2", "s1", 2),
        node("s3", "s2", -1),
        node("s4", "s3"),
      ];

    case MindMapType.MULTI_FLOW:
      // Four branches, most of them with children of their own — the case
      // where two columns of grandchildren have to share one vertical run.
      return [
        node("event", null, 1),
        node("c1", "event"),
        node("c1a", "c1"),
        node("c1b", "c1", 3),
        node("e1", "event"),
        node("e1a", "e1"),
        node("e1b", "e1"),
        node("c2", "event", 2),
        node("c2a", "c2"),
        node("e2", "event"),
        node("e2a", "e2", 2),
        node("e2b", "e2"),
      ];

    case MindMapType.BRACE:
      return [
        node("whole", null, 1),
        node("p1", "whole"),
        node("p1a", "p1", 3),
        node("p1b", "p1"),
        node("p2", "whole", 4),
        node("p3", "whole"),
        node("p3a", "p3"),
        node("p3b", "p3", 2),
        node("p3c", "p3"),
      ];

    case MindMapType.BRIDGE:
      return [
        node("factor", null, 1),
        node("t1", "factor", 3),
        node("b1", "t1"),
        node("t2", "factor"),
        node("b2", "t2", 2),
        node("t3", "factor"),
        node("b3", "t3"),
      ];

    default:
      return [node("root", null, 1), node("a", "root"), node("b", "root")];
  }
}

/** Every node of a laid-out map as a rectangle, keyed by id. */
function rectsFor(type: MindMapType, nodes: CanvasNode[]): Map<string, Rect> {
  const layout = layoutNodes(type, nodes);
  const rects = new Map<string, Rect>();
  for (const n of nodes) {
    const point = layout.get(n.id) ?? { x: n.x, y: n.y };
    const { w, h } = nodeSize(type, n.rank);
    rects.set(n.id, { x: point.x, y: point.y, w, h });
  }
  return rects;
}

const STRUCTURED = [
  MindMapType.TREE,
  MindMapType.FLOW,
  MindMapType.MULTI_FLOW,
  MindMapType.BRACE,
  MindMapType.BRIDGE,
] as const;

describe("routeEdge", () => {
  const from: Rect = { x: 0, y: 0, w: 100, h: 50 };

  it("leaves and arrives on a node's boundary, not its centre", () => {
    const to: Rect = { x: 400, y: 0, w: 100, h: 50 };
    const points = routeEdge(from, to, "h", []);

    expect(points[0]).toEqual({ x: 50, y: 0 });
    expect(points[points.length - 1]).toEqual({ x: 350, y: 0 });
  });

  it("arrives from the correct side when the target is to the left", () => {
    const to: Rect = { x: -400, y: 0, w: 100, h: 50 };
    const points = routeEdge(from, to, "h", []);

    expect(points[0]).toEqual({ x: -50, y: 0 });
    expect(points[points.length - 1]).toEqual({ x: -350, y: 0 });
  });

  it("leaves top or bottom on the vertical axis", () => {
    const to: Rect = { x: 0, y: 400, w: 100, h: 50 };
    const points = routeEdge(from, to, "v", []);

    expect(points[0]).toEqual({ x: 0, y: 25 });
    expect(points[points.length - 1]).toEqual({ x: 0, y: 375 });
  });

  it("emits only axis-aligned segments", () => {
    const to: Rect = { x: 400, y: 260, w: 100, h: 50 };
    for (const [a, b] of segments(routeEdge(from, to, "h", []))) {
      const straight = Math.abs(a.x - b.x) < 1e-9 || Math.abs(a.y - b.y) < 1e-9;
      expect(straight).toBe(true);
    }
  });

  it("runs straight when the ends share a row and nothing is in the way", () => {
    const to: Rect = { x: 400, y: 0, w: 100, h: 50 };
    expect(routeEdge(from, to, "h", [])).toHaveLength(2);
  });

  it("detours around a node sitting on the straight line", () => {
    const to: Rect = { x: 400, y: 0, w: 100, h: 50 };
    const blocker: Rect = { x: 200, y: 0, w: 120, h: 60 };

    const points = routeEdge(from, to, "h", [blocker]);

    expect(points.length).toBeGreaterThan(2);
    for (const [a, b] of segments(points)) {
      expect(hitsRect(a, b, blocker)).toBe(false);
    }
  });

  it("keeps clear of a node blocking the corridor between two rows", () => {
    const to: Rect = { x: 400, y: 300, w: 100, h: 50 };
    // Straddles the midway channel a Z route would otherwise pick.
    const blocker: Rect = { x: 200, y: 150, w: 260, h: 80 };

    const points = routeEdge(from, to, "h", [blocker]);

    for (const [a, b] of segments(points)) {
      expect(hitsRect(a, b, blocker)).toBe(false);
    }
  });

  it("gives up gracefully rather than looping when a node is boxed in", () => {
    const to: Rect = { x: 400, y: 0, w: 100, h: 50 };
    // A wall with no gap: there is no clear orthogonal route at all.
    const wall = Array.from({ length: 40 }, (_, i) => ({
      x: 200,
      y: (i - 20) * 100,
      w: 120,
      h: 120,
    }));

    const points = routeEdge(from, to, "h", wall);

    expect(points.length).toBeGreaterThanOrEqual(2);
    expect(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

describe("pathFromPoints", () => {
  it("writes a straight run as a single line", () => {
    const d = pathFromPoints([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(d).toBe("M 0 0 L 100 0");
  });

  it("keeps the endpoints exactly where they were after rounding corners", () => {
    const d = pathFromPoints([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ]);
    expect(d.startsWith("M 0 0")).toBe(true);
    expect(d.endsWith("50 100")).toBe(true);
    expect(d).toContain("Q");
  });

  it("measures an elbow along its own corners, not end to end", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ];
    expect(pathLength(points)).toBe(150);
  });
});

describe("laid-out maps", () => {
  it.each(STRUCTURED)("lays %s out with no two nodes overlapping", (type) => {
    const nodes = fixture(type);
    const rects = [...rectsFor(type, nodes).entries()];

    const collisions: string[] = [];
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const [idA, a] = rects[i];
        const [idB, b] = rects[j];
        const overlapX = Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 1;
        const overlapY = Math.abs(a.y - b.y) < (a.h + b.h) / 2 - 1;
        if (overlapX && overlapY) collisions.push(`${idA}/${idB}`);
      }
    }

    expect(collisions).toEqual([]);
  });

  it.each(STRUCTURED)("routes %s without any edge crossing another node", (type) => {
    const nodes = fixture(type);
    const rects = rectsFor(type, nodes);
    const crossings: string[] = [];
    for (const child of nodes) {
      if (!child.parentId) continue;
      const from = rects.get(child.parentId);
      const to = rects.get(child.id);
      if (!from || !to) continue;

      // Per edge, not per type: a bridge map runs along one axis and stacks its
      // pairs across the other.
      const axis = edgeAxis(type, from, to);
      expect(axis).not.toBe("free");

      const obstacles = [...rects.entries()]
        .filter(([id]) => id !== child.id && id !== child.parentId)
        .map(([, rect]) => rect);

      const points = routeEdge(from, to, axis as "h" | "v", obstacles);

      for (const [a, b] of segments(points)) {
        for (const [id, rect] of rects) {
          if (id === child.id || id === child.parentId) continue;
          if (hitsRect(a, b, rect)) crossings.push(`${child.parentId}->${child.id} through ${id}`);
        }
      }
    }

    expect(crossings).toEqual([]);
  });

  it("treats the three free canvases as free", () => {
    for (const type of [MindMapType.CIRCLE, MindMapType.BUBBLE, MindMapType.DOUBLE_BUBBLE]) {
      expect(isStructured(type)).toBe(false);
      expect(edgeAxis(type)).toBe("free");
    }
  });
});
