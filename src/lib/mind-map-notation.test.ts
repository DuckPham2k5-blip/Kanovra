import { MindMapType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_KIND,
  DEFAULT_THICKNESS,
  DEFAULT_WEIGHT,
  nodeSize,
  type CanvasNode,
} from "@/lib/mind-map-canvas";
import type { Rect } from "@/lib/mind-map-edges";
import { layoutNodes } from "@/lib/mind-map-layout";
import { notationFor, replacesEdges } from "@/lib/mind-map-notation";

/**
 * The marks that make a type look like itself.
 *
 * One type still needs them. A brace map is a bracket, not boxes joined by lines,
 * and drawing it as edges is what made every map read as the same drawing in a
 * different colour.
 *
 * Two others have left. A circle map is a wheel now (`mind-map-radial.ts`). A
 * bridge map's long line and a double bubble's twin joins went when those types
 * were removed from the product altogether.
 */

function node(id: string, parentId: string | null, rank = 0, x = 0, y = 0): CanvasNode {
  return {
    id,
    text: id,
    x,
    y,
    parentId,
    rank,
    weight: DEFAULT_WEIGHT,
    thickness: DEFAULT_THICKNESS,
    kind: DEFAULT_KIND,
  };
}

function rectsFor(type: MindMapType, nodes: CanvasNode[]): Map<string, Rect> {
  const layout = layoutNodes(type, nodes);
  const out = new Map<string, Rect>();
  for (const n of nodes) {
    const point = layout.get(n.id) ?? { x: n.x, y: n.y };
    const { w, h } = nodeSize(type, n.rank);
    out.set(n.id, { x: point.x, y: point.y, w, h });
  }
  return out;
}

describe("replacesEdges", () => {
  it("is true only for the type whose connection is the mark itself", () => {
    expect(replacesEdges(MindMapType.BRACE)).toBe(true);

    // Circle is false here and that is not an oversight: it does not go through
    // edges *or* marks any more, because it is a wheel.
    expect(replacesEdges(MindMapType.CIRCLE)).toBe(false);
    expect(replacesEdges(MindMapType.TREE)).toBe(false);
    expect(replacesEdges(MindMapType.FLOW)).toBe(false);
    expect(replacesEdges(MindMapType.MULTI_FLOW)).toBe(false);
    expect(replacesEdges(MindMapType.BUBBLE)).toBe(false);
  });
});

describe("brace map", () => {
  const nodes = [
    node("whole", null, 1),
    node("p1", "whole"),
    node("p1a", "p1"),
    node("p1b", "p1"),
    node("p2", "whole", 3),
    node("p3", "whole"),
    node("p3a", "p3"),
  ];

  it("draws one bracket per group, not one line per part", () => {
    const rects = rectsFor(MindMapType.BRACE, nodes);
    const marks = notationFor(MindMapType.BRACE, nodes, rects);
    const braces = marks.filter((m) => m.kind === "brace");

    // whole{p1,p2,p3}, p1{p1a,p1b}, p3{p3a} — three parents with children.
    expect(braces).toHaveLength(3);
  });

  it("spans every part of its group and sits between the whole and the parts", () => {
    const rects = rectsFor(MindMapType.BRACE, nodes);
    const marks = notationFor(MindMapType.BRACE, nodes, rects);

    const root = marks.find((m) => m.kind === "brace" && m.for === "whole");
    expect(root).toBeDefined();
    if (root?.kind !== "brace") throw new Error("expected a brace");

    const parts = ["p1", "p2", "p3"].map((id) => rects.get(id)!);
    const top = Math.min(...parts.map((r) => r.y - r.h / 2));
    const bottom = Math.max(...parts.map((r) => r.y + r.h / 2));

    // Reaches the outermost parts, give or take its own corner rounding.
    expect(root.y0).toBeLessThanOrEqual(top + 20);
    expect(root.y1).toBeGreaterThanOrEqual(bottom - 20);

    const whole = rects.get("whole")!;
    expect(root.x).toBeGreaterThan(whole.x + whole.w / 2);
    expect(root.x).toBeLessThan(Math.min(...parts.map((r) => r.x - r.w / 2)));
  });

  it("leaves a lone part without a bracket of its own", () => {
    const lone = [node("whole", null, 1), node("only", "whole")];
    const rects = rectsFor(MindMapType.BRACE, lone);
    const marks = notationFor(MindMapType.BRACE, lone, rects);
    expect(marks.filter((m) => m.kind === "brace")).toHaveLength(1);
  });
});

describe("circle map", () => {
  it("has no marks at all, because it is not drawn as a circle any more", () => {
    // A circle map is a wheel of ring segments now (`mind-map-radial.ts`). It
    // used to draw an enclosing ring and a dashed frame of reference from here,
    // and this test exists so that reappearing counts as a regression rather
    // than as a feature nobody remembered removing.
    const nodes = [node("Volcano", null, 1), node("erupts", "Volcano", 0, -250, -150)];
    const rects = rectsFor(MindMapType.CIRCLE, nodes);

    expect(notationFor(MindMapType.CIRCLE, nodes, rects)).toEqual([]);
    expect(replacesEdges(MindMapType.CIRCLE)).toBe(false);
  });
});
