import { MindMapType } from "@prisma/client";
import { z } from "zod";

import { nodeFillSchema, RECENT_FILL_LIMIT } from "@/lib/mind-map-fill";
import { mindMapStyle } from "@/lib/mind-maps";

/**
 * A map as nodes on a canvas.
 *
 * One shape for all eight types. A node is a node whichever map it sits in;
 * what the type decides is the backdrop, the accent and the question in the
 * header, not the structure. Keeping one node type means dragging, linking,
 * editing and presence are written once rather than eight times.
 *
 * Coordinates are absolute pixels in a plane with no edges, and the centre
 * node sits at the origin. Nothing is clamped: a branch can run as far from
 * the middle as somebody wants it to, in any direction, including negative.
 *
 * An earlier version used a fixed 2400×1400 sheet that scrolled. Three
 * separate complaints came out of that one decision — nodes that stopped
 * moving at an invisible wall, zoom that jumped once the sheet was smaller
 * than the window and the scroll correction clamped to zero, and panning that
 * ran out at the edges. They were symptoms of the sheet, not three bugs.
 *
 * The bound below is a sanity limit against corrupt input, not a working
 * boundary: at 100,000 pixels a map is a hundred screens wide.
 */

const LIMIT = 100_000;

/**
 * What a fresh branch gets on a radial map. Exported so the schema's defaults and
 * every place that builds a node by hand cannot disagree — they did, briefly, and
 * a node built with no weight sorts as zero-width.
 */
export const DEFAULT_WEIGHT = 1;
export const DEFAULT_THICKNESS = 110;

/**
 * How much bigger one step of rank draws a node, and how far rank may go.
 *
 * Exported because the schema, the scale function and the resize drag all have to
 * agree on them. They were three separate literals — `1.22` in `rankScale` and
 * `-40, 40` written out again at the call site that clamps — which is exactly the
 * shape that drifts: widening the bound in the schema alone would let the drag
 * write a node the parser then refuses to read back.
 */
export const RANK_RATIO = 1.22;
export const RANK_MIN = -40;
export const RANK_MAX = 40;

export const canvasNodeSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().trim().max(160).default(""),
  x: z.number().finite().min(-LIMIT).max(LIMIT),
  y: z.number().finite().min(-LIMIT).max(LIMIT),
  /** null for the centre node; every other node hangs off exactly one parent. */
  parentId: z.string().min(1).max(64).nullable().default(null),
  /**
   * Size, as steps away from normal: 0 is standard, 1 is one step larger, -2
   * two steps smaller. A number rather than a fixed set of sizes, so it can go
   * as far as anyone wants in either direction.
   *
   * Chosen when the node is made, not derived from how deep it sits. Depth was
   * tried first and it decides for you: a note pinned to the centre is forced
   * to look as important as a main branch, and a genuinely minor aside three
   * levels down cannot be made small. The bound below is arithmetic hygiene —
   * beyond it the scale factor overflows — not a design limit.
   *
   * Fractional, deliberately. It was `.int()` while the only way to change size
   * was a menu item stepping by one, and a node is resized by dragging its
   * corner now — a continuous gesture. Rounding to whole steps would snap the
   * shape in 22% jumps under a pointer that is moving smoothly, which reads as
   * the drag stuttering rather than as sizes being tidy. Whole numbers are still
   * what the menu and a freshly added node produce, so nothing that existed
   * before this became untidy.
   */
  rank: z.number().finite().min(RANK_MIN).max(RANK_MAX).default(0),
  /**
   * A single glyph shown beside the text.
   *
   * Twelve characters, not one: a family emoji is eleven UTF-16 code units and a
   * flag is two, so anything tighter silently rejects the ones people actually
   * reach for. Wide enough to hold a short word too, which is cosmetic rather
   * than a hazard — it is the author's own map, and it renders at glyph size.
   */
  emoji: z.string().trim().max(12).nullish(),
  /**
   * Border colour as a hue. Superseded by `fill`, and kept because four nodes in
   * this database still carry one: dropping the field would fail their whole
   * node at parse time, and `parseCanvas` answers a lost node by leaving it out
   * of the drawing. A node with a `hue` and no `fill` still tints its border.
   */
  hue: z.number().int().min(0).max(359).nullish(),
  /**
   * This node's own colour: one colour, or several as a gradient with a
   * direction. Null means it takes the map's.
   *
   * `nullish` and not `.default(...)`: a defaulted field lands on `CanvasNode` as
   * required, and every place that builds a node by hand stops compiling — the
   * seed, add-child and the test helpers. That is recorded as a trap in
   * CLAUDE.md, and "this node has no colour of its own" is genuinely absent
   * rather than a default anyway.
   */
  fill: nodeFillSchema.nullish(),
  /**
   * How much of its parent's angular span this branch takes, relative to its
   * siblings. Only a radial map reads it.
   *
   * A *share* rather than a stored start-and-end angle. Absolute angles let a
   * child drift outside the parent it belongs to, and then every operation —
   * splitting, deleting, dragging a boundary — has to police an invariant that
   * ought to be structural. With weights, "the children exactly fill their
   * parent" is not something to check: it is the only thing the arithmetic can
   * produce.
   */
  weight: z.number().finite().min(0.05).max(200).default(DEFAULT_WEIGHT),
  /**
   * How far this branch reaches outward, in pixels — its own ring's thickness.
   *
   * Per node, not per ring, because a branch is dragged longer or shorter on its
   * own. A node's inner radius is the hub plus the thickness of everything it
   * hangs off, so one fat branch pushes only its own descendants outward.
   */
  thickness: z.number().finite().min(24).max(2000).default(DEFAULT_THICKNESS),
});

/**
 * Where a radial map's whole wheel sits.
 *
 * `start` is where the first branch begins and `sweep` is how much of the circle
 * the branches share out between them — 360 for a closed wheel, less to leave a
 * deliberate gap. Both belong to the map rather than to any node: rotating the
 * drawing must not mean rewriting every branch, and a gap is a property of the
 * arrangement, not of whichever branch happens to sit beside it.
 */
export const radialSchema = z.object({
  start: z.number().finite().default(-90),
  sweep: z.number().finite().min(20).max(360).default(360),
});

/**
 * The most nodes one document may hold.
 *
 * Exported for the reason `RANK_MIN` and `RANK_MAX` are: the schema that
 * *writes* a document and the parse that *reads* one have to agree, and this was
 * two separate literals. Raising it on the write side alone would store a map
 * the reader then trims without saying so.
 */
export const NODE_LIMIT = 200;

export const canvasSchema = z.object({
  nodes: z.array(canvasNodeSchema).max(NODE_LIMIT).default([]),
  radial: radialSchema.default({ start: -90, sweep: 360 }),
  /**
   * Colours used on this map, most recent first.
   *
   * In the document rather than in a column of its own, because it is written by
   * exactly the write that saves the drawing — a colour is remembered at the
   * moment it is applied to a node, and both land in the same save. A column
   * would be a second write path for one list, and the comment table exists as a
   * separate table for the opposite reason: it is written when nobody is saving
   * the document.
   *
   * Per map, which is what was asked for: the colours in front of you are the
   * ones this drawing uses, not every colour you have ever picked anywhere.
   */
  recents: z.array(nodeFillSchema).max(RECENT_FILL_LIMIT).default([]),
});

export type RadialSettings = z.infer<typeof radialSchema>;

export type CanvasNode = z.infer<typeof canvasNodeSchema>;
export type CanvasData = z.infer<typeof canvasSchema>;

let seed = 0;
/** Ids only have to be unique inside one map, and are generated client-side. */
export function newNodeId() {
  seed += 1;
  return `n${Date.now().toString(36)}${seed.toString(36)}`;
}

/**
 * The node a map opens with: the title, alone in the middle.
 *
 * Earlier this seeded a few placeholders arranged in the shape of the chosen
 * type — a chain for a flow map, causes and effects for a multi-flow. It was
 * removed on purpose. Placeholders have to be read, understood as not-content,
 * and then deleted or overwritten before the map is yours, and that is work
 * done before any thinking starts. An empty centre asks the only question
 * worth asking first: what is this about?
 *
 * The type still shapes the map — it decides the backdrop, the colour and the
 * question in the header — it just no longer arrives with furniture.
 */
export function seedNodes(_type: MindMapType, title: string): CanvasNode[] {
  return [
    {
      id: newNodeId(),
      text: title,
      x: 0,
      y: 0,
      parentId: null,
      rank: 1,
      weight: DEFAULT_WEIGHT,
      thickness: DEFAULT_THICKNESS,
    },
  ];
}

/**
 * Reads stored JSON as a canvas, and never throws.
 *
 * Rows written by the earlier slot-based editor have no `nodes` at all; they
 * come back as an empty canvas rather than an error page, and the caller seeds
 * them. Orphans — a node whose parent was deleted in a half-saved edit — are
 * reattached to the centre instead of vanishing, because a node nobody can see
 * is worse than one in the wrong place.
 *
 * **Nodes are validated one at a time, not as an array.** Validating the array
 * meant a single bad value anywhere failed the whole parse, and the caller
 * answers an empty canvas by seeding a fresh centre node — so "one node had a
 * hue out of range" and "this map has been wiped" looked identical to whoever
 * opened it. Losing one node loudly beats appearing to lose all of them.
 *
 * That argument has a second half, and `unreadable` is it. Dropping every node
 * still hands the caller an empty canvas, the caller still seeds a centre node,
 * and autosave still commits it about a second later — so a document this build
 * cannot read is *destroyed by being opened*, silently, by whoever opened it.
 * One row in this database is already in that state, in the shape the circle map
 * used before it became a wheel. The flag is what lets the caller tell "nobody
 * has drawn here yet" apart from "there is something here I cannot show you".
 */
export type ParsedCanvas = CanvasData & {
  /** The stored document held something, and none of it could be read. */
  unreadable: boolean;
};

export function parseCanvas(raw: unknown): ParsedCanvas {
  const fallback: RadialSettings = { start: -90, sweep: 360 };

  /*
   * Both questions are asked of the *raw* value, not of the parsed one, because
   * the parse can fail outright and "did this document claim to hold anything?"
   * still has to be answerable afterwards.
   */
  const record = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const declared = record && Array.isArray(record.nodes) ? record.nodes : null;
  const anyKeys = record ? Object.keys(record).length > 0 : false;

  const outer = z.object({
    nodes: z.array(z.unknown()).default([]),
    radial: z.unknown().optional(),
    recents: z.array(z.unknown()).default([]),
  });
  const result = outer.safeParse(raw ?? {});
  if (!result.success) {
    return { nodes: [], radial: fallback, recents: [], unreadable: anyKeys };
  }

  /*
   * Sliced, not capped. `.max()` on these arrays failed the *whole* document
   * over one array being too long — which is precisely the failure the per-node
   * parse below exists to avoid. That argument does not stop at the array's
   * edge: an over-long list should cost its tail, not the map.
   */
  const nodes = result.data.nodes.slice(0, NODE_LIMIT).flatMap((node) => {
    const parsed = canvasNodeSchema.safeParse(node);
    return parsed.success ? [parsed.data] : [];
  });
  const ids = new Set(nodes.map((node) => node.id));
  const root = nodes.find((node) => node.parentId === null);

  // Same reasoning as the nodes: a bad rotation is not a reason to lose a map,
  // so it falls back to a closed wheel starting at the top.
  const radial = radialSchema.safeParse(result.data.radial ?? {});

  // One at a time, like the nodes: a colour nobody can read is one swatch
  // missing from a row, not a reason to forget every colour this map has used.
  const recents = result.data.recents.slice(0, RECENT_FILL_LIMIT).flatMap((entry) => {
    const parsed = nodeFillSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });

  return {
    radial: radial.success ? radial.data : fallback,
    recents,
    /*
     * A document that named its nodes and lost every one of them is unreadable;
     * one that named none is simply new. A document in a shape with no `nodes`
     * at all is unreadable if it holds anything — `{}` is what `createMindMap`
     * writes, and is the one empty that means "nobody has drawn here yet".
     */
    unreadable: declared ? declared.length > 0 && nodes.length === 0 : anyKeys,
    nodes: nodes.map((node) =>
      node.parentId && !ids.has(node.parentId)
        ? { ...node, parentId: root?.id ?? null }
        : node,
    ),
  };
}

/**
 * How much bigger or smaller a node is drawn, from its rank.
 *
 * Geometric rather than linear: each step is a fixed *proportion* of the last,
 * so "one step smaller" looks like the same amount of smaller at every size.
 * A linear step of, say, 20px is a modest change on a large node and wipes out
 * a small one.
 */
export function rankScale(rank: number) {
  return Math.pow(RANK_RATIO, rank);
}

/**
 * How much bigger the controls hanging off a node are drawn.
 *
 * These are overlays — the `+`, the `…`, the comment badge, the resize grip —
 * and the rule they must obey is that they grow *slower* than the node they hang
 * off. Fixed-size, they shrink to specks on a large node. One-for-one, they grow
 * until they cover it: a 10× node wore a 10× cluster that sat over the shape,
 * hid the grip in its corner and gave the `…` a bounding box so large that its
 * menu opened somewhere the pointer could not follow. Both failures have been
 * reported, in that order.
 *
 * It was a square root for exactly that reason, and the owner has since asked for
 * the opposite: controls that follow the node's size. So they do, one for one —
 * and the cap is what remains of the old argument rather than a preference. Past
 * it the failure above is real and was reported: a control large enough to be
 * measured in hundreds of pixels stops reading as a control, hides the resize
 * grip under itself, and anchors its menu somewhere the pointer is not.
 *
 * Six is where that starts, not where it was going to look untidy. The floor
 * keeps them clickable on a node somebody has shrunk to a dot.
 */
export function controlScale(rank: number): number {
  const scale = rankScale(Number.isFinite(rank) ? rank : 0);
  return Math.min(Math.max(0.85, scale), 6);
}

/**
 * The rank that draws a node `ratio` times the size `from` draws it — the inverse
 * of `rankScale`, and the whole arithmetic of the resize drag.
 *
 * The grip is dragged away from the node's centre, and the node grows by exactly
 * the proportion the pointer moved out: drag to twice the distance and the node
 * is twice the size. Anything else — a fixed pixels-per-rank, say — behaves
 * differently on a large node than on a small one, because rank is geometric.
 *
 * A ratio that is zero, negative or not a number has no logarithm and would put
 * `NaN` into the node, which survives the render as a box with no size at all and
 * is then saved. The guard answers with the rank it started from instead: a drag
 * that cannot be interpreted leaves the node alone.
 */
export function rankFromRatio(from: number, ratio: number) {
  if (!Number.isFinite(ratio) || ratio <= 0) return clampRank(from);
  return clampRank(from + Math.log(ratio) / Math.log(RANK_RATIO));
}

/** Held inside the range the schema will read back. */
export function clampRank(rank: number) {
  if (!Number.isFinite(rank)) return 0;
  return Math.min(RANK_MAX, Math.max(RANK_MIN, rank));
}

/**
 * How wide and tall a node is drawn.
 *
 * Round nodes are sized, not stretched — a circle that grows with its text is
 * an ellipse, and an ellipse is a different notation. Long text wraps inside.
 */
export const NODE_WIDTH = 190;
export const CIRCLE_SIZE = 150;
const BOX_HEIGHT = 64;
const PILL_HEIGHT = 52;

/**
 * The exact box a node occupies, in map coordinates.
 *
 * This exists so that the geometry which is *drawn* and the geometry which is
 * *routed around* are the same numbers. Height used to be left to the content —
 * no `height` in the style at all — which meant edge routing had nothing to
 * work from and any attempt at avoiding a node would have been avoiding a
 * guess. Fixing the height is the price of being able to prove a line misses a
 * box, and it is a price worth paying: the alternative is measuring the DOM and
 * feeding the measurements back into the render that produced them.
 *
 * Text that outgrows the box scrolls inside it rather than pushing the box out
 * of shape, so a long note cannot silently invalidate every route on the map.
 */
export function nodeSize(type: MindMapType, rank: number): { w: number; h: number } {
  const scale = rankScale(rank);
  const shape = mindMapStyle(type).node;

  if (shape === "circle") return { w: CIRCLE_SIZE * scale, h: CIRCLE_SIZE * scale };
  return { w: NODE_WIDTH * scale, h: (shape === "pill" ? PILL_HEIGHT : BOX_HEIGHT) * scale };
}
