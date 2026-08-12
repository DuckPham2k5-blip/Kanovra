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
    question: "What do we already know about this, and where did we learn it?",
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
 * `ring` — a second outline inside the first. Only the circle map has it,
 * because a circle map *is* a circle within a circle: the thing in the middle
 * and everything known about it around the outside.
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
  // A thing, ringed by what is known about it.
  [MindMapType.CIRCLE]: { node: "circle", ring: true, edge: "solid" },
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
  // A whole divided into parts, which is a bracket, which is an elbow.
  [MindMapType.BRACE]: { node: "box", ring: true, edge: "elbow" },
  // Pairs strung along a line by one relating factor.
  [MindMapType.BRIDGE]: { node: "pill", ring: false, edge: "solid" },
};

export function mindMapStyle(type: MindMapType): MindMapStyle {
  return STYLES[type];
}
