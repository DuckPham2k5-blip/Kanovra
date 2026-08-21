import { z } from "zod";

/**
 * The colour a single node is painted in.
 *
 * The map's palette says what the *drawing* looks like; this says what one box
 * looks like. Until now a node could only tint its border, and the note beside
 * that code said why: colouring nine fills on one backdrop stopped the map
 * reading as a single drawing. That was true of nine fills chosen from a fixed
 * set of hues at a fixed lightness. It is not an argument against letting
 * somebody colour *one* box on purpose, which is what was asked for.
 *
 * ## Why hex here and hue everywhere else
 *
 * A hue is enough when the thing being coloured is derived — a wheel segment
 * computes its fill, its ink and its outline from one number, and keeps fixed
 * distances between them so the label stays readable. A node's fill is not
 * derived: it is chosen, and it can be two colours at once. So a colour arrives
 * whole, and the two things that must stay readable are computed *from* it —
 * `fillInk` picks the label colour from the fill's own luminance, and
 * `fillBorder` darkens the fill for the edge. That is the same guarantee, made
 * at the other end.
 *
 * One colour is solid. Two or more is a gradient, and `angle` is the direction
 * it runs in — 0 points right, 90 points down, matching CSS.
 */
export const nodeFillSchema = z.object({
  /**
   * Between one and four `#rrggbb` colours.
   *
   * Strict hex, and not "any CSS colour": this string is interpolated into a
   * `linear-gradient(...)` and into an SVG `stop-color`, and the map document is
   * a JSON blob anybody with edit rights can post. `hsl(0 0% 0%); …` is a valid
   * CSS colour followed by whatever the author fancies.
   *
   * Four is where a gradient stops reading as a colour and starts reading as a
   * rainbow — and each stop makes the label's contrast harder to promise.
   */
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(4),
  /** Direction of the gradient in degrees. Meaningless for one colour. */
  angle: z.number().int().min(0).max(359).default(135),
});

export type NodeFill = z.infer<typeof nodeFillSchema>;

/** What a node's `background` should be. */
export function fillCss(fill: NodeFill): string {
  if (fill.colors.length === 1) return fill.colors[0];
  return `linear-gradient(${fill.angle}deg, ${fill.colors.join(", ")})`;
}

function channels(hex: string) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ] as const;
}

/**
 * Perceived lightness, 0–1.
 *
 * The sRGB coefficients rather than a plain average: at equal numbers green
 * looks far brighter than blue, and averaging picks white text for a colour the
 * eye reads as light. `#0000ff` is the case that gives it away.
 */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * The label colour that stays readable on this fill.
 *
 * A gradient is judged by its *lightest* stop rather than its average, because
 * the words run across all of it: dark text chosen for an average that a pale
 * stop drags upward is unreadable exactly where that stop is.
 */
export function fillInk(fill: NodeFill): string {
  const lightest = Math.max(...fill.colors.map(luminance));
  return lightest > 0.55 ? "#101828" : "#f8fafc";
}

/**
 * The border for a node wearing this fill.
 *
 * A node whose fill happens to match the backdrop would have no visible extent
 * at all, and a chooser cannot be stopped from landing there. So the edge is
 * always drawn, and always a fixed distance from the fill rather than a fixed
 * colour — the same rule as a wheel segment's outline, and for the same reason:
 * what is behind the node is not a constant.
 */
export function fillBorder(fill: NodeFill): string {
  const first = fill.colors[0];
  const [r, g, b] = channels(first);
  const shift = luminance(first) > 0.5 ? -60 : 55;
  const clamp = (v: number) => Math.max(0, Math.min(255, v + shift));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * A gradient's direction as the two ends of an SVG `linearGradient`.
 *
 * SVG has no angle: it takes two points in the box's own coordinates. CSS
 * measures from "up" and turns clockwise, so the conversion is not the naive
 * one, and getting it wrong is invisible on a 45° gradient and obvious on a 90°.
 */
export function gradientEnds(angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  const x = Math.cos(radians) / 2;
  const y = Math.sin(radians) / 2;
  return { x1: 0.5 - x, y1: 0.5 - y, x2: 0.5 + x, y2: 0.5 + y };
}

/**
 * The colours offered.
 *
 * Twelve hues at four lightnesses, which is a table somebody can point at rather
 * than a space they have to navigate. The lightest row exists so a pale node is
 * reachable without a slider, and the darkest so a node can be nearly the
 * backdrop on purpose — `fillBorder` is what keeps that legible.
 */
export const FILL_SWATCHES: string[] = [
  "#fecaca", "#fed7aa", "#fef08a", "#d9f99d", "#bbf7d0", "#a5f3fc",
  "#bfdbfe", "#c7d2fe", "#ddd6fe", "#f5d0fe", "#fbcfe8", "#e5e7eb",
  "#f87171", "#fb923c", "#facc15", "#a3e635", "#4ade80", "#22d3ee",
  "#60a5fa", "#818cf8", "#a78bfa", "#e879f9", "#f472b6", "#9ca3af",
  "#dc2626", "#ea580c", "#ca8a04", "#65a30d", "#16a34a", "#0891b2",
  "#2563eb", "#4f46e5", "#7c3aed", "#c026d3", "#db2777", "#4b5563",
  "#7f1d1d", "#7c2d12", "#713f12", "#365314", "#14532d", "#164e63",
  "#1e3a8a", "#312e81", "#4c1d95", "#701a75", "#831843", "#1f2937",
];

/** How many colours a map remembers having used. */
export const RECENT_FILL_LIMIT = 18;

/**
 * Adds a fill to the front of a map's remembered colours.
 *
 * Kept as whole fills rather than as colours, so a gradient someone mixed can be
 * used again without mixing it a second time — which is the part that takes the
 * effort.
 */
export function rememberFill(recents: NodeFill[], fill: NodeFill): NodeFill[] {
  const key = (f: NodeFill) => `${f.colors.join(",")}@${f.colors.length > 1 ? f.angle : 0}`;
  const target = key(fill);
  return [fill, ...recents.filter((item) => key(item) !== target)].slice(0, RECENT_FILL_LIMIT);
}
