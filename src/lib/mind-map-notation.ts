import { MindMapType } from "@prisma/client";

import type { CanvasNode } from "@/lib/mind-map-canvas";
import type { Rect } from "@/lib/mind-map-edges";

/**
 * The marks that make a type look like itself.
 *
 * One type needs them now. A **brace map** is a bracket: one bracket per group,
 * spanning the whole group, not one line per part. Drawn as edges it says "these
 * three things each relate to that one thing", which is a tree map's sentence. A
 * brace says "that thing *is* these three things", and the single spanning bracket
 * is what carries the difference.
 *
 * Bubble, tree, flow and multi-flow really are nodes joined by lines and get no
 * marks. Circle is a radial wheel with its own module (`mind-map-radial.ts`) and
 * never comes through here.
 *
 * This module also drew a bridge map's long line and a double bubble's twin joins.
 * Both types were removed from the product, and their `line` and `link` marks went
 * with them rather than staying in the vocabulary unused.
 */

export type Mark =
  /** A curly bracket, spanning `y0`..`y1`, its cusp pointing back at `for`. */
  { kind: "brace"; id: string; for: string; d: string; x: number; y0: number; y1: number };

/** How far the curl of a bracket reaches. */
const CURL = 16;

/**
 * True when a type expresses connection through its marks, so the per-edge
 * routes should not be drawn at all. Drawing both is the worst of the two: a
 * bracket with lines through it reads as a mistake rather than as either
 * notation.
 *
 * Brace is the only one left. Circle is absent by design rather than by oversight:
 * it is a wheel of ring segments, which goes through neither edges nor marks.
 */
export function replacesEdges(type: MindMapType): boolean {
  return type === MindMapType.BRACE;
}

function childrenOf(nodes: CanvasNode[], id: string) {
  return nodes.filter((node) => node.parentId === id && node.id !== id);
}

/**
 * A curly bracket with its body vertical, arms reaching right toward the list
 * and a cusp poking left at the thing being divided.
 *
 * Built from quadratics rather than arcs so the shape survives being scaled by
 * the canvas transform without the corner radii going strange.
 */
function bracePath(x: number, y0: number, y1: number): string {
  const mid = (y0 + y1) / 2;
  // A short bracket must not have curls longer than its own half-height, or the
  // arms cross over each other and it draws as a bow tie.
  const r = Math.max(2, Math.min(CURL, (y1 - y0) / 4));

  return [
    `M ${x + r} ${y0}`,
    `Q ${x} ${y0} ${x} ${y0 + r}`,
    `L ${x} ${mid - r}`,
    `Q ${x} ${mid} ${x - r} ${mid}`,
    `Q ${x} ${mid} ${x} ${mid + r}`,
    `L ${x} ${y1 - r}`,
    `Q ${x} ${y1} ${x + r} ${y1}`,
  ].join(" ");
}

export function notationFor(
  type: MindMapType,
  nodes: CanvasNode[],
  rects: Map<string, Rect>,
): Mark[] {
  const root = nodes.find((node) => node.parentId === null);
  if (!root) return [];

  switch (type) {
    case MindMapType.BRACE: {
      const marks: Mark[] = [];

      for (const parent of nodes) {
        const kids = childrenOf(nodes, parent.id);
        if (!kids.length) continue;

        const parentRect = rects.get(parent.id);
        const kidRects = kids.map((kid) => rects.get(kid.id)).filter((r): r is Rect => !!r);
        if (!parentRect || !kidRects.length) continue;

        const y0 = Math.min(...kidRects.map((r) => r.y - r.h / 2));
        const y1 = Math.max(...kidRects.map((r) => r.y + r.h / 2));
        const left = Math.min(...kidRects.map((r) => r.x - r.w / 2));
        const right = parentRect.x + parentRect.w / 2;

        // Centred in the gap, then pulled back far enough that the cusp still
        // clears the thing it points at.
        const x = Math.min(Math.max((right + left) / 2, right + CURL + 6), left - 6);

        marks.push({
          kind: "brace",
          id: `brace-${parent.id}`,
          for: parent.id,
          d: bracePath(x, y0, y1),
          x,
          y0,
          y1,
        });
      }

      return marks;
    }

    default:
      return [];
  }
}
