import type * as React from "react";

import type { CanvasNode } from "@/lib/mind-map-canvas";

/**
 * How a node's words are set — the Word-style controls, kept small.
 *
 * A node carries `bold`, `italic`, `underline`, a `font` and a `fontScale`. This
 * turns those into the CSS a textarea, an input or an SVG `<text>` all understand,
 * so the box canvas and the wheel style their labels the same way from one place.
 *
 * `font` is a **key**, never a family string. It is looked up in `FONTS` and the
 * *stack* is what reaches `font-family`; an unknown key (an older document, a
 * hand-edited one) falls back to the default rather than being passed through.
 * That is the same reason the icon registry maps names instead of importing by
 * string: the value comes from a JSON blob anybody with edit rights can post.
 */

export type FontOption = { key: string; label: string; stack: string };

/**
 * The fonts on offer. Web-safe stacks only — no font is fetched, so nothing is
 * added to the bundle or blocked by the map's content policy, and every one of
 * these renders on the machine it is read on.
 */
export const FONTS: FontOption[] = [
  { key: "sans", label: "Sans", stack: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { key: "serif", label: "Serif", stack: "Georgia, 'Times New Roman', serif" },
  { key: "mono", label: "Mono", stack: "'Courier New', ui-monospace, monospace" },
  { key: "rounded", label: "Round", stack: "'Trebuchet MS', 'Segoe UI', sans-serif" },
  { key: "hand", label: "Hand", stack: "'Comic Sans MS', 'Segoe Print', cursive" },
  { key: "slab", label: "Slab", stack: "'Rockwell', 'Courier New', serif" },
];

export const DEFAULT_FONT = FONTS[0];

/** The steps the A− / A+ buttons move through, and where "normal" sits. */
export const FONT_SCALES = [0.5, 0.65, 0.8, 1, 1.25, 1.6, 2, 2.5] as const;

/** The stack for a stored font key, or the default for an absent or unknown one. */
export function fontStack(key: string | null | undefined): string {
  return (FONTS.find((font) => font.key === key) ?? DEFAULT_FONT).stack;
}

/** A node's size multiplier, clamped to the range the schema reads back. */
export function fontScaleOf(node: Pick<CanvasNode, "fontScale">): number {
  const value = node.fontScale;
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(4, Math.max(0.4, value));
}

/**
 * The next scale up (`+1`) or down (`-1`) the node from where it is, snapped to
 * the fixed steps. Returns the same value at the ends, so a button can disable
 * itself by comparing the answer to the current scale.
 */
export function stepFontScale(current: number, direction: 1 | -1): number {
  const scales = FONT_SCALES;
  // The step at or just past the current value in the chosen direction.
  if (direction > 0) {
    return scales.find((s) => s > current + 1e-6) ?? scales[scales.length - 1];
  }
  const below = [...scales].reverse().find((s) => s < current - 1e-6);
  return below ?? scales[0];
}

/**
 * The CSS common to every surface — weight, slant, underline and family. Size is
 * *not* here: a textarea takes it as `em`, an SVG label as a number multiplied
 * into its own font size, so each caller applies `fontScaleOf` where it fits.
 */
export function textFaceCss(node: Pick<CanvasNode, "bold" | "italic" | "underline" | "font">): React.CSSProperties {
  return {
    fontWeight: node.bold ? 700 : undefined,
    fontStyle: node.italic ? "italic" : undefined,
    textDecoration: node.underline ? "underline" : undefined,
    fontFamily: fontStack(node.font),
  };
}
