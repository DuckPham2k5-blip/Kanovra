import { MindMapType } from "@prisma/client";

import { type MapPalette, toneValues } from "@/lib/mind-map-palette";

/**
 * The map types.
 *
 * Six of them. It began as the eight Thinking Maps; bridge and double bubble were
 * withdrawn and then removed outright, values and rows and all, so nothing in here
 * remembers them.
 *
 * Each one answers a different question, and that is the whole point of having
 * six rather than one free-form canvas: choosing the map is choosing how to
 * think about the thing. The descriptions below are written as that question,
 * not as a shape, so the picker helps someone decide rather than asking them to
 * recognise a diagram they may never have seen.
 *
 * Every type carries its own hue at the same saturation and lightness the rest
 * of the app uses for section accents, so a map's backdrop belongs to the same
 * family as every other page instead of arriving as a foreign palette.
 */

export type MindMapMeta = {
  type: MindMapType;
  label: string;
  /** The question this map exists to answer. */
  question: string;
  /** Hue only — saturation and lightness are fixed to match the app. */
  hue: number;
};

export const MIND_MAP_META: Record<MindMapType, MindMapMeta> = {
  CIRCLE: {
    type: MindMapType.CIRCLE,
    label: "Circle map",
    // Deliberately no longer "what do we already know, and where did we learn
    // it?". That was a ring with the detail loose inside it and a frame of
    // reference around the outside. This is a wheel of nested segments now, and
    // the question a wheel answers is how the whole divides up — with the angle a
    // branch occupies standing for how much of the whole it accounts for.
    question: "How does this break down, and how much of it is each part?",
    hue: 88, // lime
  },
  BUBBLE: {
    type: MindMapType.BUBBLE,
    label: "Bubble map",
    question: "What words describe it?",
    hue: 190, // cyan
  },
  TREE: {
    type: MindMapType.TREE,
    label: "Tree map",
    question: "What are the groups, and what belongs in each?",
    hue: 38, // amber
  },
  FLOW: {
    type: MindMapType.FLOW,
    label: "Flow map",
    question: "What happens, in what order?",
    hue: 202, // sky
  },
  MULTI_FLOW: {
    type: MindMapType.MULTI_FLOW,
    label: "Multi-flow map",
    question: "What caused this, and what does it cause?",
    hue: 268, // violet
  },
  BRACE: {
    type: MindMapType.BRACE,
    label: "Brace map",
    question: "What are the physical parts of this whole?",
    hue: 160, // green-teal
  },
};

export const MIND_MAP_ORDER: MindMapType[] = [
  MindMapType.CIRCLE,
  MindMapType.BUBBLE,
  MindMapType.TREE,
  MindMapType.FLOW,
  MindMapType.MULTI_FLOW,
  MindMapType.BRACE,
];

/**
 * The emoji offered on a node.
 *
 * A fixed set rather than a full picker: the point of an emoji on a node is to
 * mark it — this one is a question, that one is done, this one is a risk — and a
 * thousand choices makes marking slower than typing the word. Grouped so the
 * marking vocabulary comes first and the objects afterwards.
 */
export const NODE_EMOJI = [
  "⭐",
  "❓",
  "❗",
  "✅",
  "⚠️",
  "🔥",
  "💡",
  "🎯",
  "📌",
  "🧩",
  "🔒",
  "🕒",
  "📈",
  "📉",
  "💰",
  "🐛",
  "🧪",
  "🚀",
  "❤️",
  "👍",
  "👎",
  "🙏",
  "🌱",
  "🌍",
];

/**
 * A radial map's segment fill, and the ink that stays readable on it.
 *
 * The two are one function of the same lightness on purpose. Choosing them apart
 * is how a wheel ends up with dark labels on its dark inner rings — legible in
 * the outer rings where it was designed and unreadable in the middle, which is
 * where the branch names people navigate by actually live.
 *
 * Lightness steps outward so the hub is the darkest thing and each ring lifts
 * away from it, and saturation falls as it goes so ten rings do not fight.
 */
export function radialShade(palette: MapPalette, depth: number) {
  const { hue } = palette;
  const ring = toneValues(palette.tone).ring;
  const lightness = Math.min(ring.cap, ring.base + depth * ring.step);
  const saturation = Math.max(ring.floor, ring.s - depth * ring.fade);
  return {
    fill: `hsl(${hue} ${saturation}% ${lightness}%)`,
    // The crossover sits where mid-grey text stops winning against the fill.
    ink: lightness < 52 ? `hsl(${hue} 30% 96%)` : `hsl(${hue} 60% 12%)`,
    // The segment's own outline: the same hue, a fixed distance *darker than
    // this segment*, so the contrast is against the thing being outlined and
    // not against whatever happens to lie behind it.
    //
    // It was a pale line before, on the reasoning that a wheel of one hue should
    // not gain a second colour. The colour was right and the direction was wrong:
    // pale reads only while the ground is dark, and the ground is not a constant
    // — the light theme puts a near-white backdrop behind the same wheel, and
    // even within one theme the map backdrop is a gradient that runs dark at one
    // corner and pale at the other. Darker than the fill holds everywhere,
    // because half the stroke lies on the fill.
    outline: `hsl(${hue} ${Math.min(90, saturation + 12)}% ${Math.max(8, lightness - 24)}% / 0.9)`,
  };
}

/** The palette a map of this type starts from, before anybody changes it. */
export function defaultPalette(type: MindMapType): MapPalette {
  return { hue: MIND_MAP_META[type].hue, tone: "vivid" };
}

/**
 * A node's own border colour, or the map's accent when it has none.
 *
 * Only four nodes in this database still carry a `hue`; nothing sets one any
 * more, because a node's colour is a `fill` now and fills the node rather than
 * outlining it. It keeps the vivid tone whatever the map is set to — the point
 * of colouring one node is to pick it out of the map around it, so following the
 * map's tone would take the difference away exactly where it was asked for.
 */
export function nodeBorderColor(
  palette: MapPalette,
  hue: number | null | undefined,
  alpha: number,
) {
  if (hue === null || hue === undefined) return mindMapColor(palette, alpha);
  return `hsl(${hue} 88% 60% / ${alpha})`;
}

/** Full colour for a map's accent, matching `page-accent.ts`'s formula. */
export function mindMapColor(palette: MapPalette, alpha?: number) {
  const { s, l } = toneValues(palette.tone).accent;
  const base = `${palette.hue} ${s}% ${l}%`;
  return alpha === undefined ? `hsl(${base})` : `hsl(${base} / ${alpha})`;
}

/**
 * The backdrop behind a map. Dark, low-contrast and built from the map's own
 * hue — a diagram is line work, and line work needs a quiet ground or the
 * strokes stop reading. Deliberately not the vivid accent itself, which is for
 * edges and highlights.
 */
export function mindMapBackdrop(palette: MapPalette) {
  const { hue } = palette;
  const { s, l } = toneValues(palette.tone).ground;
  return (
    `radial-gradient(120% 100% at 15% 0%, hsl(${hue} ${s}% ${l}% / 0.55) 0%, transparent 60%), ` +
    `radial-gradient(100% 120% at 100% 100%, hsl(${(hue + 40) % 360} ${s - 5}% ${l - 2}% / 0.45) 0%, transparent 55%)`
  );
}

/**
 * A card's background, as two separate properties rather than one shorthand.
 *
 * Split deliberately. Packing a colour and two gradients into `background`
 * leaves the opaque layer at the mercy of how the whole declaration parses, and
 * when that went wrong the symptom was not an error — it was the page's glyph
 * showing straight through the cards, which reads as a design choice rather
 * than a bug. `backgroundColor` on its own cannot be partially applied.
 *
 * The base is a deeply darkened version of the map's own hue, not the neutral
 * card colour: it blocks what is behind *and* makes each of the eight legible
 * as itself, instead of eight variations on one dark grey.
 */
export function mindMapCardBackground(palette: MapPalette) {
  const { hue } = palette;
  const { s, l } = toneValues(palette.tone).ground;
  return {
    backgroundColor: `hsl(${hue} ${Math.max(6, s - 15)}% ${Math.max(6, l - 13)}%)`,
    backgroundImage:
      `radial-gradient(130% 110% at 12% 0%, hsl(${hue} ${s}% ${l + 2}%) 0%, transparent 60%), ` +
      `radial-gradient(110% 130% at 100% 100%, hsl(${(hue + 40) % 360} ${s - 8}% ${l - 2}%) 0%, transparent 56%)`,
  };
}

/**
 * How each map is drawn.
 *
 * Shape is not decoration here — it is the notation. A bubble map is bubbles:
 * round, equal, orbiting a centre. Drawing it as rectangles says "boxes and
 * hierarchy", which is a tree map's sentence, not a bubble map's. Eight maps
 * that look alike are one map with eight names.
 *
 * Three axes carry the difference, and no two types share all three:
 *
 * `node` — the outline. Round for the three that compare and describe; boxes
 * for the ones that group; pills for the ones that run in a line.
 *
 * `ring` — a second outline inside the first. Nothing has it any more, and the
 * axis is kept because it is cheap and the next notation may want it.
 *
 * Circle and brace used to. Both were standing in for a mark the drawing did
 * not have yet: a circle map *is* a circle within a circle, so every node wore a
 * little ring of its own, and a brace map is a bracket, so every box wore a
 * hint of one. `mind-map-notation.ts` draws the real enclosing circle and the
 * real bracket now, and the per-node rings became decoration that competes with
 * them — eight small rings inside one big one reads as a rendering fault.
 *
 * `edge` — how a connection is drawn. Dashed where the link is association
 * rather than structure, elbowed where it is hierarchy, arrowed where it is
 * sequence or causation.
 */
export type MindMapStyle = {
  node: "circle" | "box" | "pill";
  ring: boolean;
  edge: "solid" | "dashed" | "elbow" | "arrow";
  /**
   * Whether a box's corners are rounded off.
   *
   * Only a flow map asks for square ones, and it asks for a reason: a flow map is
   * a sequence of discrete states, and a rounded box reads as softer and less
   * definite than the step it stands for. Kept as a flag on the style rather than
   * a second `node` value, because "sharp" is not a different shape — the box is
   * the same box, laid out and routed around identically.
   */
  corner?: "sharp";
};

const STYLES: Record<MindMapType, MindMapStyle> = {
  // A thing, ringed by what is known about it — the ring being the enclosing
  // circle the notation draws, not one per node.
  [MindMapType.CIRCLE]: { node: "circle", ring: false, edge: "solid" },
  // Qualities float around a subject; the links are loose associations.
  [MindMapType.BUBBLE]: { node: "circle", ring: false, edge: "dashed" },
  // Groups and members: hierarchy, so square corners and right-angled joins.
  [MindMapType.TREE]: { node: "box", ring: false, edge: "elbow" },
  // One thing after another, as discrete states: square boxes and right-angled
  // arrows. It was a pill, which reads as softer than a step in a procedure.
  [MindMapType.FLOW]: { node: "box", ring: false, edge: "arrow", corner: "sharp" },
  // Causes in, effects out — direction is the whole point.
  [MindMapType.MULTI_FLOW]: { node: "box", ring: false, edge: "arrow" },
  // A whole divided into parts, which is a bracket — an actual one, spanning
  // each group, rather than an elbow per part.
  [MindMapType.BRACE]: { node: "box", ring: false, edge: "elbow" },
};

export function mindMapStyle(type: MindMapType): MindMapStyle {
  return STYLES[type];
}
