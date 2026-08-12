import { MindMapType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { nodeSize, type CanvasNode } from "@/lib/mind-map-canvas";
import type { Rect } from "@/lib/mind-map-edges";
import { layoutNodes } from "@/lib/mind-map-layout";
import { notationFor, replacesEdges } from "@/lib/mind-map-notation";

/**
 * The marks that make a type look like itself.
 *
 * Three of the eight are not "boxes joined by lines" at all, and drawing them
 * that way is what made eight maps read as one map with eight colour schemes.
 * A brace map is a bracket. A bridge map is a line with words astride it. A
 * circle map is a circle inside a frame. None of those are edges.
 */

function node(id: string, parentId: string | null, rank = 0, x = 0, y = 0): CanvasNode {
  return { id, text: id, x, y, parentId, rank };
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
  it("is true only for the types whose connection is the mark itself", () => {
    expect(replacesEdges(MindMapType.BRACE)).toBe(true);
    expect(replacesEdges(MindMapType.BRIDGE)).toBe(true);
    expect(replacesEdges(MindMapType.CIRCLE)).toBe(true);

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

describe("bridge map", () => {
  const nodes = [
    node("as", null, 1),
    node("Paris", "as"),
    node("France", "Paris"),
    node("Hanoi", "as", 2),
    node("Vietnam", "Hanoi"),
  ];

  it("draws exactly one line, whatever the number of pairs", () => {
    const rects = rectsFor(MindMapType.BRIDGE, nodes);
    const marks = notationFor(MindMapType.BRIDGE, nodes, rects);
    expect(marks.filter((m) => m.kind === "line")).toHaveLength(1);
  });

  it("runs the line from the relating factor past the last pair", () => {
    const rects = rectsFor(MindMapType.BRIDGE, nodes);
    const line = notationFor(MindMapType.BRIDGE, nodes, rects).find((m) => m.kind === "line");
    if (line?.kind !== "line") throw new Error("expected a line");

    const factor = rects.get("as")!;
    const last = rects.get("Vietnam")!;

    expect(line.y).toBe(0);
    expect(line.x0).toBeGreaterThanOrEqual(factor.x + factor.w / 2);
    expect(line.x1).toBeGreaterThan(last.x + last.w / 2);
  });

  it("has no line at all when there are no pairs yet", () => {
    const alone = [node("as", null, 1)];
    const rects = rectsFor(MindMapType.BRIDGE, alone);
    expect(notationFor(MindMapType.BRIDGE, alone, rects)).toEqual([]);
  });
});

describe("circle map", () => {
  const nodes = [
    node("Ocean", null, 1, 0, 0),
    node("vast", "Ocean", 0, -260, -170),
    node("salty", "Ocean", 0, 250, -180),
    node("deep", "Ocean", 0, 20, 300),
  ];

  it("encloses the detail in a circle, inside a frame of reference", () => {
    const rects = rectsFor(MindMapType.CIRCLE, nodes);
    const marks = notationFor(MindMapType.CIRCLE, nodes, rects);

    const circle = marks.find((m) => m.kind === "circle");
    const frame = marks.find((m) => m.kind === "frame");
    if (circle?.kind !== "circle" || frame?.kind !== "frame") {
      throw new Error("expected a circle and a frame");
    }

    // Every node fits inside the circle.
    for (const [, rect] of rects) {
      const reach = Math.hypot(rect.x - circle.cx, rect.y - circle.cy) + rect.w / 2;
      expect(reach).toBeLessThanOrEqual(circle.r);
    }

    // The circle fits inside the frame.
    expect(frame.x).toBeLessThan(circle.cx - circle.r);
    expect(frame.x + frame.w).toBeGreaterThan(circle.cx + circle.r);
    expect(frame.y).toBeLessThan(circle.cy - circle.r);
    expect(frame.y + frame.h).toBeGreaterThan(circle.cy + circle.r);
  });

  it("still draws a circle for a map with nothing but its topic", () => {
    const alone = [node("Ocean", null, 1, 0, 0)];
    const rects = rectsFor(MindMapType.CIRCLE, alone);
    const marks = notationFor(MindMapType.CIRCLE, alone, rects);

    const circle = marks.find((m) => m.kind === "circle");
    if (circle?.kind !== "circle") throw new Error("expected a circle");
    expect(circle.r).toBeGreaterThan(rects.get("Ocean")!.w / 2);
  });
});
