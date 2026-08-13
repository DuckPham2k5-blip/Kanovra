import { MindMapType } from "@prisma/client";

/**
 * The eight Thinking Maps.
 *
 * Each one answers a different question, and that is the whole point of having
 * eight rather than one free-form canvas: choosing the map is choosing how to
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
  DOUBLE_BUBBLE: {
    type: MindMapType.DOUBLE_BUBBLE,
    label: "Double bubble map",
    question: "How are these two alike, and how do they differ?",
    hue: 168, // teal
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
  BRIDGE: {
    type: MindMapType.BRIDGE,
    label: "Bridge map",
    question: "What is the relating factor, and what else follows it?",
    hue: 24, // orange
  },
};

export const MIND_MAP_ORDER: MindMapType[] = [
  MindMapType.CIRCLE,
  MindMapType.BUBBLE,
  MindMapType.DOUBLE_BUBBLE,
  MindMapType.TREE,
  MindMapType.FLOW,
  MindMapType.MULTI_FLOW,
  MindMapType.BRACE,
  MindMapType.BRIDGE,
];

/**
 * Border colours offered for a single node.
 *
 * Hues at the app's fixed saturation and lightness, so a node picked out in
 * red still belongs to the same drawing as one left on the map's own accent.
 * Free-form colour was the alternative and it lets somebody choose a border
 * indistinguishable from the backdrop, which reads as the border having
 * vanished.
 */
export const NODE_HUES: { hue: number; label: string }[] = [
  { hue: 0, label: "Red" },
  { hue: 24, label: "Orange" },
  { hue: 38, label: "Amber" },
  { hue: 88, label: "Lime" },
  { hue: 160, label: "Green" },
  { hue: 190, label: "Cyan" },
  { hue: 218, label: "Blue" },
  { hue: 268, label: "Violet" },
  { hue: 320, label: "Pink" },
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
export function radialShade(hue: number, depth: number) {
  const lightness = Math.min(74, 30 + depth * 11);
  const saturation = Math.max(34, 62 - depth * 6);
  return {
    fill: `hsl(${hue} ${saturation}% ${lightness}%)`,
    // The crossover sits where mid-grey text stops winning against the fill.
    ink: lightness < 52 ? `hsl(${hue} 30% 96%)` : `hsl(${hue} 60% 12%)`,
  };
}

/** A node's own border colour, or the map's accent when it has none. */
export function nodeBorderColor(type: MindMapType, hue: number | null | undefined, alpha: number) {
  if (hue === null || hue === undefined) return mindMapColor(type, alpha);
  return `hsl(${hue} 88% 60% / ${alpha})`;
}

/** Full colour for a map's accent, matching `page-accent.ts`'s formula. */
export function mindMapColor(type: MindMapType, alpha?: number) {
  const { hue } = MIND_MAP_META[type];
  return alpha === undefined ? `hsl(${hue} 88% 60%)` : `hsl(${hue} 88% 60% / ${alpha})`;
}

/**
 * The backdrop behind a map. Dark, low-contrast and built from the map's own
 * hue — a diagram is line work, and line work needs a quiet ground or the
 * strokes stop reading. Deliberately not the vivid accent itself, which is for
 * edges and highlights.
 */
export function mindMapBackdrop(type: MindMapType) {
  const { hue } = MIND_MAP_META[type];
  return (
    `radial-gradient(120% 100% at 15% 0%, hsl(${hue} 60% 22% / 0.55) 0%, transparent 60%), ` +
    `radial-gradient(100% 120% at 100% 100%, hsl(${(hue + 40) % 360} 55% 20% / 0.45) 0%, transparent 55%)`
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
export function mindMapCardBackground(type: MindMapType) {
  const { hue } = MIND_MAP_META[type];
  return {
    backgroundColor: `hsl(${hue} 45% 9%)`,
    backgroundImage:
      `radial-gradient(130% 110% at 12% 0%, hsl(${hue} 60% 24%) 0%, transparent 60%), ` +
      `radial-gradient(110% 130% at 100% 100%, hsl(${(hue + 40) % 360} 52% 20%) 0%, transparent 56%)`,
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
};

const STYLES: Record<MindMapType, MindMapStyle> = {
  // A thing, ringed by what is known about it — the ring being the enclosing
  // circle the notation draws, not one per node.
  [MindMapType.CIRCLE]: { node: "circle", ring: false, edge: "solid" },
  // Qualities float around a subject; the links are loose associations.
  [MindMapType.BUBBLE]: { node: "circle", ring: false, edge: "dashed" },
  // Two subjects, and the qualities each does or does not share.
  [MindMapType.DOUBLE_BUBBLE]: { node: "circle", ring: false, edge: "solid" },
  // Groups and members: hierarchy, so square corners and right-angled joins.
  [MindMapType.TREE]: { node: "box", ring: false, edge: "elbow" },
  // One thing after another.
  [MindMapType.FLOW]: { node: "pill", ring: false, edge: "arrow" },
  // Causes in, effects out — direction is the whole point.
  [MindMapType.MULTI_FLOW]: { node: "box", ring: false, edge: "arrow" },
  // A whole divided into parts, which is a bracket — an actual one, spanning
  // each group, rather than an elbow per part.
  [MindMapType.BRACE]: { node: "box", ring: false, edge: "elbow" },
  // Pairs strung along a line by one relating factor.
  [MindMapType.BRIDGE]: { node: "pill", ring: false, edge: "solid" },
};

export function mindMapStyle(type: MindMapType): MindMapStyle {
  return STYLES[type];
}
