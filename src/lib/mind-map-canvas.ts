import { MindMapType } from "@prisma/client";
import { z } from "zod";

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
   */
  rank: z.number().int().min(-40).max(40).default(0),
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
   * Border colour as a hue, matching how the rest of the app names a colour —
   * saturation and lightness stay fixed so a node cannot be tinted into
   * illegibility against its own backdrop. Null means the map's own accent.
   */
  hue: z.number().int().min(0).max(359).nullish(),
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

export const canvasSchema = z.object({
  nodes: z.array(canvasNodeSchema).max(200).default([]),
  radial: radialSchema.default({ start: -90, sweep: 360 }),
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
 */
export function parseCanvas(raw: unknown): CanvasData {
  const fallback: RadialSettings = { start: -90, sweep: 360 };
  const outer = z.object({
    nodes: z.array(z.unknown()).max(200).default([]),
    radial: z.unknown().optional(),
  });
  const result = outer.safeParse(raw ?? {});
  if (!result.success) return { nodes: [], radial: fallback };

  const nodes = result.data.nodes.flatMap((node) => {
    const parsed = canvasNodeSchema.safeParse(node);
    return parsed.success ? [parsed.data] : [];
  });
  const ids = new Set(nodes.map((node) => node.id));
  const root = nodes.find((node) => node.parentId === null);

  // Same reasoning as the nodes: a bad rotation is not a reason to lose a map,
  // so it falls back to a closed wheel starting at the top.
  const radial = radialSchema.safeParse(result.data.radial ?? {});

  return {
    radial: radial.success ? radial.data : fallback,
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
  return Math.pow(1.22, rank);
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
