/**
 * A map's colour.
 *
 * Every colour on a map page — the accent, the backdrop, a node's border, the
 * card in the list, and every shade of a wheel segment — used to come from one
 * number: the hue its *type* was given. That made a map's colour a property of
 * the kind of thinking it holds, which is a good default and a poor rule: six
 * types is six colours, and a workspace with fifty maps has fifty drawings in
 * six outfits.
 *
 * So a map carries its own palette, and the type's hue becomes the default it
 * starts from.
 *
 * ## Why a hue and a tone rather than a colour
 *
 * A free colour picker was the obvious thing to offer and it is the one thing
 * this drawing cannot take. The shades are *derived*: `radialShade` computes a
 * segment's fill, the ink on it and its outline from one hue, keeping each a
 * fixed distance from the others so the words stay readable and the boundary
 * stays visible. Hand it an arbitrary colour and those distances are whatever
 * the chooser happened to pick — a fill that swallows its own label, a border
 * indistinguishable from the backdrop. `NODE_HUES` exists for the same reason.
 *
 * Hue is safe to hand over completely, because it never changes contrast: every
 * one of the 360 keeps the same lightness relationships. Tone moves saturation
 * and lightness *together*, in steps that were chosen and looked at, so a pastel
 * map is pale everywhere rather than pale in the fills and vivid in the edges.
 *
 * The two axes give 360 × 4 combinations, which is the "any colour you like" the
 * owner asked for, minus the corner of the space where the map stops working.
 */

/** How saturated and how light a palette runs, across everything it touches. */
export type MapTone = "vivid" | "soft" | "deep" | "mono";

export type MapPalette = {
  /** 0–359. */
  hue: number;
  tone: MapTone;
};

export const MAP_TONES: { tone: MapTone; label: string }[] = [
  { tone: "vivid", label: "Vivid" },
  { tone: "soft", label: "Soft" },
  { tone: "deep", label: "Deep" },
  { tone: "mono", label: "Mono" },
];

/**
 * The numbers each tone runs on.
 *
 * `accent` is the vivid colour used for edges, arrowheads and highlights.
 * `ground` is the backdrop and the card behind a map, which has to stay quiet —
 * a diagram is line work and line work needs a still ground.
 * `ring` is the wheel: a base lightness, how much each ring outward lifts, and
 * the saturation it starts from and loses as it goes.
 *
 * `mono` keeps a trace of saturation rather than none. At zero the hue is
 * meaningless and the four grey maps in a list are indistinguishable from each
 * other; at 8 the family is still legible as "the blue-grey one".
 */
const TONE_VALUES: Record<
  MapTone,
  {
    accent: { s: number; l: number };
    ground: { s: number; l: number };
    ring: { base: number; step: number; cap: number; s: number; fade: number; floor: number };
  }
> = {
  vivid: {
    accent: { s: 88, l: 60 },
    ground: { s: 60, l: 22 },
    ring: { base: 30, step: 11, cap: 74, s: 62, fade: 6, floor: 34 },
  },
  soft: {
    accent: { s: 64, l: 72 },
    ground: { s: 42, l: 30 },
    ring: { base: 46, step: 9, cap: 84, s: 46, fade: 4, floor: 26 },
  },
  deep: {
    accent: { s: 82, l: 46 },
    ground: { s: 66, l: 15 },
    ring: { base: 22, step: 10, cap: 66, s: 72, fade: 6, floor: 38 },
  },
  mono: {
    accent: { s: 8, l: 62 },
    ground: { s: 10, l: 18 },
    ring: { base: 26, step: 11, cap: 76, s: 9, fade: 1, floor: 4 },
  },
};

export function toneValues(tone: MapTone) {
  return TONE_VALUES[tone];
}

/**
 * Colours offered as ready-made choices.
 *
 * A picker with 360 hues on it answers "what colour" and not "which colour is
 * good", and most people want the second. These are the named starting points;
 * the wheel is there for anyone who wants the first.
 */
export const MAP_PRESETS: { id: string; label: string; palette: MapPalette }[] = [
  { id: "neon-cyan", label: "Neon glow", palette: { hue: 186, tone: "vivid" } },
  { id: "purple-galaxy", label: "Purple galaxy", palette: { hue: 268, tone: "deep" } },
  { id: "blue-minimal", label: "Blue minimal", palette: { hue: 218, tone: "soft" } },
  { id: "green-nature", label: "Green nature", palette: { hue: 132, tone: "vivid" } },
  { id: "warm-sunset", label: "Warm sunset", palette: { hue: 24, tone: "vivid" } },
  { id: "pastel-rose", label: "Pastel rose", palette: { hue: 330, tone: "soft" } },
  { id: "dark-mono", label: "Dark mono", palette: { hue: 220, tone: "mono" } },
  { id: "earth-tone", label: "Earth tone", palette: { hue: 38, tone: "deep" } },
  { id: "ocean-deep", label: "Ocean deep", palette: { hue: 200, tone: "deep" } },
  { id: "lime-fresh", label: "Lime fresh", palette: { hue: 88, tone: "vivid" } },
  { id: "violet-soft", label: "Violet soft", palette: { hue: 280, tone: "soft" } },
  { id: "ruby", label: "Ruby", palette: { hue: 352, tone: "vivid" } },
];

/**
 * Reads a palette off whatever the database holds.
 *
 * Both columns are nullable and both fall back on their own: a map saved before
 * this existed has neither, a map whose tone was written by a future version has
 * a string this one does not know. Neither is an error worth showing — the map
 * draws in its type's own colour, which is exactly what it did before.
 */
export function readPalette(
  fallbackHue: number,
  hue: number | null | undefined,
  tone: string | null | undefined,
): MapPalette {
  const known = MAP_TONES.some((t) => t.tone === tone);
  return {
    hue: typeof hue === "number" && Number.isFinite(hue) ? ((hue % 360) + 360) % 360 : fallbackHue,
    tone: known ? (tone as MapTone) : "vivid",
  };
}
