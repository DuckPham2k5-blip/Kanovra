import { MindMapType } from "@prisma/client";

import type { CanvasNode } from "@/lib/mind-map-canvas";

/**
 * Where the nodes of a structured map go.
 *
 * Five of the eight maps are a shape before they are a drawing: a tree is
 * levels, a flow is a line, a multi-flow is causes on one side and effects on
 * the other. For those, position is a consequence of structure and not a
 * decision anybody should have to make — so they are laid out here and dragging
 * is switched off. Moving a node in a tree map can only ever make it a worse
 * tree map.
 *
 * The other three — circle, bubble, double bubble — are free canvases, because
 * they have no order to honour: a bubble map is qualities orbiting a subject,
 * and where each one sits is the author's business.
 *
 * Stored coordinates are ignored for the structured types, not overwritten.
 * Turning a map's type would otherwise destroy an arrangement that is still
 * meaningful to the type it came from.
 */

const LEVEL_GAP = 170;
const SIBLING_GAP = 230;
const CHAIN_GAP = 280;

export function isStructured(type: MindMapType) {
  switch (type) {
    case MindMapType.CIRCLE:
    case MindMapType.BUBBLE:
    case MindMapType.DOUBLE_BUBBLE:
      return false;
    default:
      return true;
  }
}

type Point = { x: number; y: number };

function childrenOf(nodes: CanvasNode[], id: string | null) {
  return nodes.filter((node) => node.parentId === id);
}

/** Depth-first order, which is the order somebody added things in. */
function walk(nodes: CanvasNode[], rootId: string, visit: (id: string, depth: number) => void) {
  const step = (id: string, depth: number, guard: number) => {
    if (guard > 200) return;
    visit(id, depth);
    for (const child of childrenOf(nodes, id)) step(child.id, depth + 1, guard + 1);
  };
  step(rootId, 0, 0);
}

export function layoutNodes(type: MindMapType, nodes: CanvasNode[]): Map<string, Point> {
  const placed = new Map<string, Point>();
  const root = nodes.find((node) => node.parentId === null);
  if (!root || !isStructured(type)) return placed;

  switch (type) {
    case MindMapType.TREE: {
      /*
       * Classic top-down tree. Leaves are dealt out left to right and every
       * parent is centred over its own children, which is what stops the
       * branches crossing — the naive version, spacing siblings evenly at each
       * level independently, tangles as soon as one branch is bushier.
       */
      let nextLeaf = 0;
      const place = (id: string, depth: number): number => {
        const kids = childrenOf(nodes, id);
        const y = depth * LEVEL_GAP;

        if (!kids.length) {
          const x = nextLeaf * SIBLING_GAP;
          nextLeaf += 1;
          placed.set(id, { x, y });
          return x;
        }

        const xs = kids.map((kid) => place(kid.id, depth + 1));
        const x = (Math.min(...xs) + Math.max(...xs)) / 2;
        placed.set(id, { x, y });
        return x;
      };
      place(root.id, 0);
      break;
    }

    case MindMapType.FLOW: {
      // One thing after another, in the order they were added.
      let index = 0;
      walk(nodes, root.id, (id) => {
        placed.set(id, { x: index * CHAIN_GAP, y: 0 });
        index += 1;
      });
      break;
    }

    case MindMapType.MULTI_FLOW: {
      /*
       * The event in the middle, causes to the left, effects to the right.
       *
       * Which side a branch lands on is decided by the order it was added —
       * first goes left, second right, and so on alternately. A map about
       * causes and effects needs both columns to fill as you type, and asking
       * for a side before a thought is written down interrupts the thought.
       */
      placed.set(root.id, { x: 0, y: 0 });
      const branches = childrenOf(nodes, root.id);
      const left = branches.filter((_, i) => i % 2 === 0);
      const right = branches.filter((_, i) => i % 2 === 1);

      const column = (list: CanvasNode[], side: -1 | 1) => {
        list.forEach((branch, i) => {
          const y = (i - (list.length - 1) / 2) * LEVEL_GAP;
          placed.set(branch.id, { x: side * CHAIN_GAP, y });
          childrenOf(nodes, branch.id).forEach((kid, j) => {
            placed.set(kid.id, { x: side * CHAIN_GAP * 2, y: y + (j - 0.5) * (LEVEL_GAP * 0.7) });
          });
        });
      };
      column(left, -1);
      column(right, 1);
      break;
    }

    case MindMapType.BRACE: {
      // The whole on the left, its parts stacked to the right, their sub-parts
      // further right again — the bracket reads outward from the thing.
      placed.set(root.id, { x: 0, y: 0 });
      const parts = childrenOf(nodes, root.id);
      let row = 0;
      parts.forEach((part) => {
        const kids = childrenOf(nodes, part.id);
        const span = Math.max(1, kids.length);
        const y = (row + (span - 1) / 2) * (LEVEL_GAP * 0.75);
        placed.set(part.id, { x: CHAIN_GAP, y });
        kids.forEach((kid, j) => {
          placed.set(kid.id, { x: CHAIN_GAP * 2, y: (row + j) * (LEVEL_GAP * 0.75) });
        });
        row += span;
      });
      // Re-centre the whole stack on the root.
      const ys = [...placed.values()].map((p) => p.y);
      const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
      for (const [id, point] of placed) placed.set(id, { x: point.x, y: point.y - mid });
      break;
    }

    case MindMapType.BRIDGE: {
      /*
       * The relating factor on the left, then pairs along a line. A pair is a
       * node and its first child: the top word and the bottom one, which is
       * exactly what a bridge map is — the same relationship, repeated.
       */
      placed.set(root.id, { x: 0, y: 0 });
      childrenOf(nodes, root.id).forEach((top, i) => {
        const x = (i + 1) * CHAIN_GAP;
        placed.set(top.id, { x, y: -60 });
        childrenOf(nodes, top.id).forEach((bottom, j) => {
          placed.set(bottom.id, { x, y: 60 + j * 90 });
        });
      });
      break;
    }
  }

  return placed;
}
