import { MindMapType } from "@prisma/client";

import type { CanvasNode } from "@/lib/mind-map-canvas";
import { trimStraight, type Rect } from "@/lib/mind-map-edges";
import { otherSubject } from "@/lib/mind-map-layout";

/**
 * The marks that make a type look like itself.
 *
 * Three of the eight maps are not "boxes joined by lines" at all, and drawing
 * them that way is what made eight maps read as one drawing with eight colour
 * schemes:
 *
 *   - A **brace map** is a bracket. One bracket per group, spanning the whole
 *     group — not one line per part. Drawn as edges it says "these three things
 *     each relate to that one thing", which is a tree map's sentence. A brace
 *     says "that thing *is* these three things", and the single spanning
 *     bracket is what carries the difference.
 *   - A **bridge map** is one long line with words astride it. The pairing is
 *     conveyed by standing above and below the same stretch of line, and adding
 *     connectors between the words asserts a link between the pairs that a
 *     bridge map does not claim.
 *   - A **circle map** is a circle inside a frame. The detail is *inside* the
 *     ring, not joined to the middle by spokes; the outer frame is where the
 *     frame of reference goes — how you know what you know.
 *
 * Bubble, tree, flow and multi-flow really are nodes joined by lines, and get
 * no marks. Double bubble is not here yet: its notation needs to know which
 * node is the second subject and which qualities are shared by both, and there
 * is nowhere to say so yet.
 */

export type Mark =
  /** A curly bracket, spanning `y0`..`y1`, its cusp pointing back at `for`. */
  | { kind: "brace"; id: string; for: string; d: string; x: number; y0: number; y1: number }
  | { kind: "line"; id: string; x0: number; x1: number; y: number }
  /** A straight join between two bubbles, trimmed to both boundaries. */
  | { kind: "link"; id: string; x1: number; y1: number; x2: number; y2: number };

/** How far the curl of a bracket reaches. */
const CURL = 16;
/** How far a bridge map's line runs past its last pair. */
const LINE_OVERHANG = 40;

/**
 * True when a type expresses connection through its marks, so the per-edge
 * routes should not be drawn at all. Drawing both is the worst of the two: a
 * bracket with lines through it reads as a mistake rather than as either
 * notation.
 */
export function replacesEdges(type: MindMapType, nodes?: CanvasNode[]): boolean {
  if (type === MindMapType.DOUBLE_BUBBLE) {
    // Only once there is a second subject. Before that the map is an ordinary
    // bubble map and its parent-to-child edges are exactly right.
    return !!nodes && !!otherSubject(nodes);
  }
  // Circle is not in this list any more and is not absent by oversight: it is
  // drawn as a wheel of ring segments now (`mind-map-radial.ts`), which does not
  // go through edges or marks at all.
  return type === MindMapType.BRACE || type === MindMapType.BRIDGE;
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

    case MindMapType.BRIDGE: {
      const factor = rects.get(root.id);
      const pairs = childrenOf(nodes, root.id);
      if (!factor || !pairs.length) return [];

      const spanned = [
        ...pairs.map((p) => rects.get(p.id)),
        ...pairs.flatMap((p) => childrenOf(nodes, p.id).map((c) => rects.get(c.id))),
      ].filter((r): r is Rect => !!r);
      if (!spanned.length) return [];

      return [
        {
          kind: "line",
          id: "bridge-line",
          x0: factor.x + factor.w / 2 + 8,
          x1: Math.max(...spanned.map((r) => r.x + r.w / 2)) + LINE_OVERHANG,
          // The layout puts the factor at the origin and stands every pair
          // astride y = 0, so the line is the axis the map was built on.
          y: 0,
        },
      ];
    }

    case MindMapType.DOUBLE_BUBBLE: {
      const other = otherSubject(nodes);
      if (!other) return [];

      const a = rects.get(root.id);
      const b = rects.get(other.id);
      if (!a || !b) return [];

      const marks: Mark[] = [];
      const join = (id: string, from: Rect, to: Rect) => {
        const [p, q] = trimStraight(from, to, true);
        marks.push({ kind: "link", id, x1: p.x, y1: p.y, x2: q.x, y2: q.y });
      };

      const shared = nodes.filter(
        (node) =>
          node.role === "shared" && (node.parentId === root.id || node.parentId === other.id),
      );
      const sharedIds = new Set(shared.map((node) => node.id));

      // A shared quality touches *both* bubbles. That second line is the whole
      // reason this map cannot be drawn from parenthood alone, and it is the
      // difference between a double bubble and two bubble maps side by side.
      for (const node of shared) {
        const rect = rects.get(node.id);
        if (!rect) continue;
        join(`db-a-${node.id}`, a, rect);
        join(`db-b-${node.id}`, b, rect);
      }

      for (const node of nodes) {
        if (sharedIds.has(node.id) || node.id === other.id || node.id === root.id) continue;
        const rect = rects.get(node.id);
        if (!rect) continue;

        // Whichever subject it hangs off. Nothing joins the two subjects to each
        // other: a double bubble compares them, it does not claim a relationship
        // between them.
        if (node.parentId === root.id) join(`db-a-${node.id}`, a, rect);
        else if (node.parentId === other.id) join(`db-b-${node.id}`, b, rect);
      }

      return marks;
    }

    default:
      return [];
  }
}
