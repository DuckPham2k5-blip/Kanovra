/**
 * Where an ambient mote starts, where it ends and how visible it is on the way.
 *
 * Separated from the canvas that draws it because a `requestAnimationFrame` loop
 * cannot be looked at: it does not run in a hidden tab, it paints nothing a test
 * can read, and the one bug this code has already had was a *direction* — the
 * dark theme spawning motes at the bloom and then pulling them back into it,
 * with every other number correct. Nothing about that is visible in a still
 * frame, and it is trivially assertable here.
 *
 * The geometry all hangs off the bloom, which is the shape the page's colour
 * lives in: `left-1/2`, `top: -13rem`, `70rem` wide and `44rem` tall. Its centre
 * is therefore high and off-screen-ish, not the middle of the viewport — motes
 * aimed at the geometric centre would miss it by about a third of the screen.
 */

export type Point = { x: number; y: number };
export type Bloom = { x: number; y: number; rx: number; ry: number };
export type MotePath = { from: Point; to: Point };

/** How far along its path a mote fades up, and starts fading out. */
const FADE_IN = 0.18;
const FADE_OUT = 0.3;

/** How deep inside the bloom the outward-bound motes begin. */
const INNER = 0.18;

export function bloomBox(width: number, rem: number): Bloom {
  return {
    x: width / 2,
    // `top: -13rem` on a box `44rem` tall puts the middle at -13 + 22 = 9rem.
    y: 9 * rem,
    rx: 35 * rem,
    ry: 22 * rem,
  };
}

/** Whether a point is within the bloom's ellipse. */
export function insideBloom(bloom: Bloom, point: Point): boolean {
  const dx = (point.x - bloom.x) / bloom.rx;
  const dy = (point.y - bloom.y) / bloom.ry;
  return dx * dx + dy * dy <= 1;
}

/**
 * Both ends of one mote's journey.
 *
 * Light falls inward — it starts beyond the screen and ends at the bloom. Dark
 * spreads outward — the same two points, swapped. Storing the destination rather
 * than assuming it is always the bloom is the whole of the difference between the
 * two themes, and the reason it is a returned value rather than an implicit
 * constant is that "always the bloom" is exactly the bug this had.
 */
export function motePath(bloom: Bloom, angle: number, reach: number, dark: boolean): MotePath {
  const outer = {
    x: bloom.x + Math.cos(angle) * reach,
    y: bloom.y + Math.sin(angle) * reach,
  };
  const inner = {
    x: bloom.x + Math.cos(angle) * bloom.rx * INNER,
    y: bloom.y + Math.sin(angle) * bloom.ry * INNER,
  };

  return dark
    ? { from: inner, to: outer }
    : { from: outer, to: { x: bloom.x, y: bloom.y } };
}

export function moteAt(path: MotePath, t: number): Point {
  return {
    x: path.from.x + (path.to.x - path.from.x) * t,
    y: path.from.y + (path.to.y - path.from.y) * t,
  };
}

/**
 * How strongly a mote paints at `t` along its path.
 *
 * Zero at both ends, whichever direction it is travelling: falling inward that
 * makes it wink out as it reaches the bloom — "biến mất khi chạm vào viền" from
 * the sketch — and spreading outward it dies at the edge of the screen. One rule
 * rather than two, so it cannot be changed for one theme and forgotten for the
 * other.
 */
export function moteAlpha(t: number, dark: boolean): number {
  if (!Number.isFinite(t)) return 0;
  const clamped = Math.max(0, Math.min(1, t));
  const up = Math.min(1, clamped / FADE_IN);
  const down = Math.min(1, (1 - clamped) / FADE_OUT);
  return up * down * (dark ? 0.55 : 0.4);
}

/**
 * How many motes a viewport of this size gets.
 *
 * By area and capped, because a 4K screen should not cost four times a laptop's
 * worth of work for something nobody looks at directly.
 */
export function moteCount(width: number, height: number): number {
  return Math.max(28, Math.min(150, Math.round((width * height) / 16000)));
}
