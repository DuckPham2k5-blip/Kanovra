import { MindMapType } from "@prisma/client";

import { nodeSize, type CanvasNode } from "@/lib/mind-map-canvas";

/**
 * Where the nodes of a structured map go.
 *
 * Four of the six maps are a shape before they are a drawing: a tree is levels,
 * a flow is a line, a multi-flow is causes on one side and effects on the other,
 * a brace is a whole and its parts. For those, position is a consequence of
 * structure and not a decision anybody should have to make — so they are laid out
 * here and dragging is switched off. Moving a node in a tree map can only ever
 * make it a worse tree map.
 *
 * Bubble is a free canvas, because it has no order to honour: it is qualities
 * orbiting a subject, and where each one sits is the author's business. Circle is
 * neither — it is a radial wheel with its own geometry in `mind-map-radial.ts`,
 * and nothing here places it.
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
/**
 * Space between two whole trees when a map holds more than one main item.
 *
 * A structured map can carry several roots now — "add a main item" makes a
 * second tree, a second brace — and they are laid out side by side (a tree
 * grows downward, so its neighbours sit to its right) or stacked (a brace grows
 * rightward, so its neighbours sit below). This is the clear space between one
 * whole tree's bounding box and the next, measured the same way every other gap
 * here is: between the boxes, never centre to centre.
 */
const ROOT_GAP = 140;

/** A cycle in `parentId` cannot be reached from the root, but self-parenting can. */
const GUARD = 200;

/**
 * Whether a type's positions are computed here rather than chosen by hand.
 *
 * A plain predicate on the type again. It briefly took the nodes as well, because
 * a double bubble only became structured once somebody named its second subject —
 * the one type whose shape depended on its contents. That type is gone, and with it
 * the reason for every caller to hand over the whole map to ask a question about a
 * single enum value.
 */
export function isStructured(type: MindMapType) {
  switch (type) {
    case MindMapType.CIRCLE:
    case MindMapType.BUBBLE:
    // Multi-flow was laid out here, alternating branches left and right by the
    // order they were added. That rule decided which of somebody's causes were
    // causes: add a third one and it lands on the effect side because it happens
    // to be third. Position carries the meaning on this type — the arrowhead is
    // already chosen from which side a node ended up on.
    case MindMapType.MULTI_FLOW:
      return false;
    default:
      return true;
  }
}

type Point = { x: number; y: number };

/**
 * Whether a laid-out type still lets a node be dragged.
 *
 * Laid out and draggable are not opposites. A tree arranges itself from its
 * structure, which is what keeps it tidy as branches are added, and the owner
 * also wants to pull a node somewhere by hand. So a drag there writes an *offset*
 * on top of the layout (`ox`/`oy`) rather than a position — see `applyOffsets`.
 * Brace keeps its fixed arrangement: its bracket is the whole notation.
 */
export function isMovableLayout(type: MindMapType) {
  return type === MindMapType.TREE;
}

/**
 * Laid-out positions with each node's hand-dragged offset added — its own plus
 * every ancestor's, so pulling a branch carries everything hanging off it.
 *
 * Memoised per node, and the walk up the parents is bounded, because rows can
 * arrive with a loop in `parentId` from an older build or a restore; a walk that
 * assumes there are none hangs the render that finds one.
 */
export function applyOffsets(placed: Map<string, Point>, nodes: CanvasNode[]): Map<string, Point> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const totals = new Map<string, Point>();

  const offsetOf = (id: string, depth: number): Point => {
    const hit = totals.get(id);
    if (hit) return hit;
    const node = byId.get(id);
    if (!node || depth > GUARD) return { x: 0, y: 0 };
    const above =
      node.parentId && node.parentId !== id ? offsetOf(node.parentId, depth + 1) : { x: 0, y: 0 };
    const value = { x: above.x + (node.ox ?? 0), y: above.y + (node.oy ?? 0) };
    totals.set(id, value);
    return value;
  };

  const out = new Map<string, Point>();
  for (const [id, point] of placed) {
    const offset = offsetOf(id, 0);
    out.set(id, { x: point.x + offset.x, y: point.y + offset.y });
  }
  return out;
}

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

/**
 * The arrangement a type would choose for these nodes.
 *
 * No longer gated on `isStructured`: multi-flow is a free canvas now and still
 * needs this once, to seed a map whose nodes have never been arranged. The types
 * with no case below simply place nothing, which is the same empty answer the
 * gate used to give. Callers that must not move a node still ask `isStructured`
 * first — the check belongs with the decision to *apply* a layout, not with the
 * ability to compute one.
 */
export function layoutNodes(type: MindMapType, nodes: CanvasNode[]): Map<string, Point> {
  const roots = nodes.filter((node) => node.parentId === null);
  if (!roots.length) return new Map();

  const cache = new Map<string, { w: number; h: number }>();
  const size = (id: string) => {
    const hit = cache.get(id);
    if (hit) return hit;
    const node = nodes.find((n) => n.id === id);
    const value = nodeSize(type, node?.rank ?? 0);
    cache.set(id, value);
    return value;
  };

  /*
   * Each root's tree is laid out on its own — root at the origin — and then the
   * trees are placed beside one another so several main items can share a
   * canvas without overlapping. A map with one root reproduces the old output
   * exactly: the loop runs once, the first tree is never shifted, and the final
   * recentring inside `layoutSingleRoot` leaves its root at the origin.
   *
   * A tree grows downward, so its neighbours go to its right (the trees are
   * stacked along x); a brace and a multi-flow grow sideways, so theirs go below
   * (stacked along y). The axis is perpendicular to the way the type spreads, so
   * two trees never reach into each other.
   */
  const stackAxis: "x" | "y" = type === MindMapType.TREE ? "x" : "y";
  const placed = new Map<string, Point>();
  let used = -Infinity;

  roots.forEach((root, index) => {
    const local = layoutSingleRoot(type, nodes, root, size);
    if (!local.size) local.set(root.id, { x: 0, y: 0 });

    // The tree's bounding box, boxes included, in the stacking axis.
    let lo = Infinity;
    let hi = -Infinity;
    for (const [id, point] of local) {
      const half = (stackAxis === "x" ? size(id).w : size(id).h) / 2;
      const c = stackAxis === "x" ? point.x : point.y;
      lo = Math.min(lo, c - half);
      hi = Math.max(hi, c + half);
    }

    // The first tree is placed exactly where it laid itself out; each later one
    // is shifted so its near edge clears the last by `ROOT_GAP`.
    const shift = index === 0 ? 0 : used + ROOT_GAP - lo;
    for (const [id, point] of local) {
      placed.set(id, {
        x: stackAxis === "x" ? point.x + shift : point.x,
        y: stackAxis === "y" ? point.y + shift : point.y,
      });
    }
    used = index === 0 ? hi : hi + shift;
  });

  return placed;
}

/**
 * One root's tree, laid out with that root at the origin.
 *
 * This is the per-type arrangement — everything `layoutNodes` used to do for the
 * single root it assumed. Pulled out so a map with several roots can call it once
 * per root and place the results side by side; a map with one root gets the same
 * answer it always did.
 */
function layoutSingleRoot(
  type: MindMapType,
  nodes: CanvasNode[],
  root: CanvasNode,
  size: (id: string) => { w: number; h: number },
): Map<string, Point> {
  const placed = new Map<string, Point>();

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
      /*
       * The whole on the left, its parts to the right, their sub-parts further
       * right again — and *their* parts further still, to whatever depth the map
       * goes. This is the tree layout turned on its side: a node owns a vertical
       * block as tall as its whole subtree needs (or as tall as itself), sits at
       * the middle of it, and its children stack down inside it. Columns are
       * spaced by the widest node at each depth.
       *
       * It used to place exactly two levels — parts, then sub-parts — by hand,
       * so a part's own children landed on the origin, stacked on top of each
       * other and unreadable. Anything past a sub-part was, in effect, a limit on
       * how deep a brace could go. Allocating blocks the way the tree does removes
       * the limit: every parent with children gets its bracket (drawn by
       * `notationFor`, which already walks the whole map), at any depth.
       */
      const span = new Map<string, number>();
      const measure = (id: string, depth: number): number => {
        if (depth > GUARD) return size(id).h;
        const kids = childrenOf(nodes, id).filter((kid) => kid.id !== id);
        let total = 0;
        kids.forEach((kid, index) => {
          total += measure(kid.id, depth + 1) + (index ? ROW_GAP : 0);
        });
        const value = Math.max(size(id).h, total);
        span.set(id, value);
        return value;
      };
      measure(root.id, 0);

      // Columns spaced by the widest node on each of the two they separate, so
      // one wide node pushes its whole column across rather than into the next.
      const widest: number[] = [];
      walk(nodes, root.id, (id, depth) => {
        widest[depth] = Math.max(widest[depth] ?? 0, size(id).w);
      });
      const levelX: number[] = [0];
      for (let depth = 1; depth < widest.length; depth += 1) {
        levelX[depth] =
          levelX[depth - 1] + widest[depth - 1] / 2 + COL_GAP + widest[depth] / 2;
      }

      const assign = (id: string, top: number, depth: number) => {
        if (depth > GUARD) return;
        const block = span.get(id) ?? size(id).h;
        placed.set(id, { x: levelX[depth] ?? 0, y: top + block / 2 });

        const kids = childrenOf(nodes, id).filter((kid) => kid.id !== id);
        const total = kids.reduce(
          (sum, kid, index) => sum + (span.get(kid.id) ?? size(kid.id).h) + (index ? ROW_GAP : 0),
          0,
        );
        let cursor = top + (block - total) / 2;
        for (const kid of kids) {
          assign(kid.id, cursor, depth + 1);
          cursor += (span.get(kid.id) ?? size(kid.id).h) + ROW_GAP;
        }
      };
      assign(root.id, 0, 0);
      break;
    }

  }

  // The root is the origin of its own tree — the view opens looking at it, and
  // `layoutNodes` stacks trees relative to it. Layouts are free to build from a
  // corner and get recentred here rather than each one having to remember.
  const origin = placed.get(root.id);
  if (origin && (origin.x !== 0 || origin.y !== 0)) {
    for (const [id, point] of placed) {
      placed.set(id, { x: point.x - origin.x, y: point.y - origin.y });
    }
  }

  return placed;
}
