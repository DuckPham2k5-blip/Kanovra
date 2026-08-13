import { MindMapType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_THICKNESS,
  DEFAULT_WEIGHT,
  nodeSize,
  type CanvasNode,
} from "@/lib/mind-map-canvas";
import type { Rect } from "@/lib/mind-map-edges";
import { isStructured, layoutNodes } from "@/lib/mind-map-layout";
import { notationFor, replacesEdges } from "@/lib/mind-map-notation";

/**
 * The marks that make a type look like itself.
 *
 * Some of the eight are not "boxes joined by lines" at all, and drawing them that
 * way is what made eight maps read as one map with eight colour schemes. A brace
 * map is a bracket. A bridge map is a line with words astride it. Neither is an
 * edge.
 *
 * A circle map used to be here too, as a ring with a dashed frame around it. It
 * is drawn as a wheel of ring segments now and has left this module entirely —
 * see `mind-map-radial.ts`.
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
  it("is true only for the types whose connection is the mark itself", () => {
    expect(replacesEdges(MindMapType.BRACE)).toBe(true);
    expect(replacesEdges(MindMapType.BRIDGE)).toBe(true);

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

describe("double bubble map", () => {
  /** Cat vs Dog: two subjects, two shared qualities, one unique to each. */
  function comparison(withSubject: boolean): CanvasNode[] {
    const dog: CanvasNode = { ...node("Dog", "Cat", 1), role: withSubject ? "subject" : null };
    return [
      node("Cat", null, 1),
      dog,
      { ...node("has fur", "Cat"), role: "shared" },
      { ...node("a pet", "Cat"), role: "shared" },
      node("purrs", "Cat"),
      node("barks", "Dog"),
    ];
  }

  it("stays an ordinary bubble map until a second subject is named", () => {
    const nodes = comparison(false);
    expect(isStructured(MindMapType.DOUBLE_BUBBLE, nodes)).toBe(false);
    expect(replacesEdges(MindMapType.DOUBLE_BUBBLE, nodes)).toBe(false);
    expect(notationFor(MindMapType.DOUBLE_BUBBLE, nodes, rectsFor(MindMapType.DOUBLE_BUBBLE, nodes))).toEqual([]);
  });

  it("becomes a comparison the moment one is", () => {
    const nodes = comparison(true);
    expect(isStructured(MindMapType.DOUBLE_BUBBLE, nodes)).toBe(true);
    expect(replacesEdges(MindMapType.DOUBLE_BUBBLE, nodes)).toBe(true);
  });

  it("puts the shared qualities between the two subjects", () => {
    const nodes = comparison(true);
    const rects = rectsFor(MindMapType.DOUBLE_BUBBLE, nodes);

    const cat = rects.get("Cat")!;
    const dog = rects.get("Dog")!;
    for (const id of ["has fur", "a pet"]) {
      const shared = rects.get(id)!;
      expect(shared.x).toBeGreaterThan(cat.x);
      expect(shared.x).toBeLessThan(dog.x);
    }

    // And each subject's own quality out on its own side.
    expect(rects.get("purrs")!.x).toBeLessThan(cat.x);
    expect(rects.get("barks")!.x).toBeGreaterThan(dog.x);
  });

  it("stands the two subjects level with each other", () => {
    const rects = rectsFor(MindMapType.DOUBLE_BUBBLE, comparison(true));
    expect(rects.get("Cat")!.y).toBe(rects.get("Dog")!.y);
  });

  it("joins a shared quality to both subjects and the subjects to neither", () => {
    const nodes = comparison(true);
    const rects = rectsFor(MindMapType.DOUBLE_BUBBLE, nodes);
    const links = notationFor(MindMapType.DOUBLE_BUBBLE, nodes, rects).filter(
      (m) => m.kind === "link",
    );

    // Two shared × two subjects, plus one unique each.
    expect(links).toHaveLength(6);
    expect(links.filter((m) => m.id.endsWith("has fur"))).toHaveLength(2);
    expect(links.filter((m) => m.id.endsWith("purrs"))).toHaveLength(1);

    // Nothing runs between Cat and Dog: the map compares them, it does not
    // claim a relationship between them.
    const cat = rects.get("Cat")!;
    const dog = rects.get("Dog")!;
    const subjectToSubject = links.some(
      (m) =>
        m.kind === "link" &&
        Math.abs(m.y1 - cat.y) < 1 &&
        Math.abs(m.y2 - dog.y) < 1 &&
        Math.abs(m.x1 - (cat.x + cat.w / 2)) < 1 &&
        Math.abs(m.x2 - (dog.x - dog.w / 2)) < 1,
    );
    expect(subjectToSubject).toBe(false);
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
