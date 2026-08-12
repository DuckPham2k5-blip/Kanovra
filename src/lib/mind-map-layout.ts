import { MindMapType } from "@prisma/client";

import { nodeSize, type CanvasNode } from "@/lib/mind-map-canvas";

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
 *
 * **Every gap here is space between boxes, never a distance between centres.**
 * The first version used fixed centre-to-centre pitches, which is the same as
 * assuming every node is the same size — and node size is chosen freely, in
 * either direction, without limit. A rank-3 node is wider than the sibling pitch
 * that was supposed to separate it, so any map with one large node in it
 * silently overlapped, and the overlap looked like a rendering fault rather than
 * an arithmetic one. `mind-map-edges.test.ts` asserts the absence of overlap
 * across every type, which is how those cases were found rather than argued
 * about.
 */

/** Space between one column or level and the next. */
const COL_GAP = 110;
/** Space between two nodes sharing a column. */
const ROW_GAP = 46;
/** How far a bridge map's words sit clear of its line. */
const BRIDGE_GAP = 34;

/** A cycle in `parentId` cannot be reached from the root, but self-parenting can. */
const GUARD = 200;

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
  const step = (id: string, depth: number) => {
    if (depth > GUARD) return;
    visit(id, depth);
    for (const child of childrenOf(nodes, id)) {
      if (child.id === id) continue;
      step(child.id, depth + 1);
    }
  };
  step(rootId, 0);
}

/**
 * Stacks a list of nodes down a column, each one given room for its own
 * children, and returns the total height used.
 *
 * A branch's block is as tall as its children need *or* as tall as the branch
 * itself, whichever is more — a large branch with one small child would
 * otherwise be allotted the child's height and lean into its neighbour.
 */
function stackColumn(
  nodes: CanvasNode[],
  list: CanvasNode[],
  size: (id: string) => { w: number; h: number },
): { rows: { id: string; y: number; kids: { id: string; y: number }[] }[]; height: number } {
  const rows: { id: string; y: number; kids: { id: string; y: number }[] }[] = [];
  let cursor = 0;

  for (const branch of list) {
    const start = cursor;
    const kids: { id: string; y: number }[] = [];

    for (const kid of childrenOf(nodes, branch.id)) {
      const h = size(kid.id).h;
      cursor += h / 2;
      kids.push({ id: kid.id, y: cursor });
      cursor += h / 2 + ROW_GAP;
    }

    let height = kids.length ? cursor - ROW_GAP - start : 0;
    const own = size(branch.id).h;
    if (height < own) {
      const pad = (own - height) / 2;
      for (const kid of kids) kid.y += pad;
      cursor = start + own + ROW_GAP;
      height = own;
    }

    rows.push({ id: branch.id, y: start + height / 2, kids });
  }

  return { rows, height: Math.max(0, cursor - ROW_GAP) };
}

export function layoutNodes(type: MindMapType, nodes: CanvasNode[]): Map<string, Point> {
  const placed = new Map<string, Point>();
  const root = nodes.find((node) => node.parentId === null);
  if (!root || !isStructured(type)) return placed;

  const cache = new Map<string, { w: number; h: number }>();
  const size = (id: string) => {
    const hit = cache.get(id);
    if (hit) return hit;
    const node = nodes.find((n) => n.id === id);
    const value = nodeSize(type, node?.rank ?? 0);
    cache.set(id, value);
    return value;
  };

  switch (type) {
    case MindMapType.TREE: {
      /*
       * Classic top-down tree, allocated as blocks rather than dealt out leaf by
       * leaf.
       *
       * Each node owns a horizontal block as wide as its whole subtree needs, or
       * as wide as itself if that is more, and sits at the middle of it. Because
       * the blocks are laid side by side and never overlap, no two nodes can
       * either — and every parent is centred over its own children, which is
       * what stops the branches crossing. Spacing siblings evenly at each level
       * independently tangles as soon as one branch is bushier.
       */
      const span = new Map<string, number>();
      const measure = (id: string, depth: number): number => {
        if (depth > GUARD) return size(id).w;
        const kids = childrenOf(nodes, id).filter((kid) => kid.id !== id);
        let total = 0;
        kids.forEach((kid, index) => {
          total += measure(kid.id, depth + 1) + (index ? ROW_GAP : 0);
        });
        const value = Math.max(size(id).w, total);
        span.set(id, value);
        return value;
      };
      measure(root.id, 0);

      // Levels are spaced by the tallest node on each of the two rows they
      // separate, so one large node pushes its whole level down rather than
      // reaching into the one above.
      const tallest: number[] = [];
      walk(nodes, root.id, (id, depth) => {
        tallest[depth] = Math.max(tallest[depth] ?? 0, size(id).h);
      });
      const levelY: number[] = [0];
      for (let depth = 1; depth < tallest.length; depth += 1) {
        levelY[depth] =
          levelY[depth - 1] + tallest[depth - 1] / 2 + COL_GAP + tallest[depth] / 2;
      }

      const assign = (id: string, left: number, depth: number) => {
        if (depth > GUARD) return;
        const block = span.get(id) ?? size(id).w;
        placed.set(id, { x: left + block / 2, y: levelY[depth] ?? 0 });

        const kids = childrenOf(nodes, id).filter((kid) => kid.id !== id);
        const total = kids.reduce(
          (sum, kid, index) => sum + (span.get(kid.id) ?? size(kid.id).w) + (index ? ROW_GAP : 0),
          0,
        );
        let cursor = left + (block - total) / 2;
        for (const kid of kids) {
          assign(kid.id, cursor, depth + 1);
          cursor += (span.get(kid.id) ?? size(kid.id).w) + ROW_GAP;
        }
      };
      assign(root.id, 0, 0);
      break;
    }

    case MindMapType.FLOW: {
      // One thing after another, in the order they were added, each step clear
      // of the last by its own half-width rather than by a fixed pitch.
      let x = 0;
      let previous: number | null = null;
      walk(nodes, root.id, (id) => {
        const w = size(id).w;
        if (previous !== null) x += previous / 2 + COL_GAP + w / 2;
        placed.set(id, { x, y: 0 });
        previous = w;
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
       *
       * Each side is stacked as blocks, so a branch with three children is
       * given room for three. The earlier version spaced branches evenly and
       * hung children half a gap either side of their branch, which put one
       * branch's last child on top of the next branch's first — visible only
       * once a map had two populated branches in a row, which is most of them.
       */
      placed.set(root.id, { x: 0, y: 0 });
      const branches = childrenOf(nodes, root.id).filter((node) => node.id !== root.id);

      const column = (list: CanvasNode[], side: -1 | 1) => {
        if (!list.length) return;

        const branchWidth = Math.max(...list.map((b) => size(b.id).w));
        const kids = list.flatMap((b) => childrenOf(nodes, b.id));
        const kidWidth = kids.length ? Math.max(...kids.map((k) => size(k.id).w)) : 0;

        const x1 = size(root.id).w / 2 + COL_GAP + branchWidth / 2;
        const x2 = x1 + branchWidth / 2 + COL_GAP + kidWidth / 2;

        const { rows, height } = stackColumn(nodes, list, size);
        const shift = -height / 2;

        for (const row of rows) {
          placed.set(row.id, { x: side * x1, y: row.y + shift });
          for (const kid of row.kids) placed.set(kid.id, { x: side * x2, y: kid.y + shift });
        }
      };

      column(
        branches.filter((_, index) => index % 2 === 0),
        -1,
      );
      column(
        branches.filter((_, index) => index % 2 === 1),
        1,
      );
      break;
    }

    case MindMapType.BRACE: {
      // The whole on the left, its parts stacked to the right, their sub-parts
      // further right again — the bracket reads outward from the thing. The
      // stack is centred on the whole, rather than the whole being moved to the
      // middle of the stack: the root is the origin of the map.
      placed.set(root.id, { x: 0, y: 0 });
      const parts = childrenOf(nodes, root.id).filter((node) => node.id !== root.id);
      if (!parts.length) break;

      const partWidth = Math.max(...parts.map((p) => size(p.id).w));
      const subParts = parts.flatMap((p) => childrenOf(nodes, p.id));
      const subWidth = subParts.length ? Math.max(...subParts.map((s) => size(s.id).w)) : 0;

      const x1 = size(root.id).w / 2 + COL_GAP + partWidth / 2;
      const x2 = x1 + partWidth / 2 + COL_GAP + subWidth / 2;

      const { rows, height } = stackColumn(nodes, parts, size);
      const shift = -height / 2;

      for (const row of rows) {
        placed.set(row.id, { x: x1, y: row.y + shift });
        for (const kid of row.kids) placed.set(kid.id, { x: x2, y: kid.y + shift });
      }
      break;
    }

    case MindMapType.BRIDGE: {
      /*
       * The relating factor on the left, then pairs along a line. A pair is a
       * node and its first child: the top word and the bottom one, which is
       * exactly what a bridge map is — the same relationship, repeated.
       *
       * Each pair is given a column as wide as its widest word, so a long phrase
       * on top does not sit over the next pair's.
       */
      placed.set(root.id, { x: 0, y: 0 });
      let x = size(root.id).w / 2 + COL_GAP;

      for (const top of childrenOf(nodes, root.id).filter((node) => node.id !== root.id)) {
        const bottoms = childrenOf(nodes, top.id).filter((node) => node.id !== top.id);
        const width = Math.max(size(top.id).w, ...bottoms.map((b) => size(b.id).w));
        const centre = x + width / 2;

        placed.set(top.id, { x: centre, y: -(BRIDGE_GAP + size(top.id).h / 2) });

        let below = BRIDGE_GAP;
        for (const bottom of bottoms) {
          const h = size(bottom.id).h;
          placed.set(bottom.id, { x: centre, y: below + h / 2 });
          below += h + ROW_GAP;
        }

        x = centre + width / 2 + COL_GAP;
      }
      break;
    }
  }

  // The centre node is the origin of the map — the view opens looking at it.
  // Layouts are free to build from a corner and get recentred here rather than
  // each one having to remember.
  const origin = placed.get(root.id);
  if (origin && (origin.x !== 0 || origin.y !== 0)) {
    for (const [id, point] of placed) {
      placed.set(id, { x: point.x - origin.x, y: point.y - origin.y });
    }
  }

  return placed;
}
