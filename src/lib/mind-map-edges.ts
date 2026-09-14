import { MindMapType } from "@prisma/client";

/**
 * Where a connecting line goes.
 *
 * Edges used to be drawn centre-to-centre. That is invisible on a sparse map
 * and wrong on a dense one, in two ways that both read as design rather than as
 * faults: the line runs *underneath* the boxes at each end, and an arrowhead
 * placed at the target's centre is hidden by the target. Nobody reports "the
 * arrow is missing" when the arrow is simply behind something.
 *
 * So a route here is a list of points, not a formula: it leaves the source on
 * the side that faces the target, travels in right angles, arrives on the
 * boundary of the target, and steers around any node in between.
 *
 * The search is deliberately small and ordered rather than exhaustive. Three
 * families of route are tried in order of how ordinary they look — straight,
 * one dogleg, one detour — with the most natural channel first, and the first
 * one that touches nothing wins. A full path-finder would find a route through
 * a maze; it would also spend the frame budget of a 200-node map proving that
 * the obvious route was fine. When nothing is clear the most natural route is
 * returned anyway: a line that clips a box is a worse drawing, but a missing
 * line is a missing fact.
 */

export type Point = { x: number; y: number };

/** A node's box: `x`/`y` are its **centre**, not a corner. */
export type Rect = { x: number; y: number; w: number; h: number };

export type Axis = "h" | "v";

/** How far a line stays clear of a node it passes. */
const CLEARANCE = 12;
/** How far a line travels straight out of a node before its first turn. */
const STUB = 26;
/** Corner rounding. Enough to read as drawn rather than as a diagram artifact. */
const CORNER = 10;

const MAX_CHANNELS = 12;
const MAX_LANES = 12;
const STEP = 34;
const EPS = 1e-6;

type Side = "left" | "right";

/**
 * Which way a type's edges run.
 *
 * A tree descends, so its edges leave the bottom of a parent and arrive at the
 * top of a child. Flow, multi-flow and brace all read across the page, so theirs
 * leave a side.
 *
 * A bubble map has no axis at all. Its edges are associations between things the
 * author placed by hand, and bending those into right angles would assert a
 * structure a bubble map specifically does not have. Circle answers "free" too,
 * though nothing asks: it is a radial wheel and draws no edges.
 *
 * This used to take the two boxes as well, so a bridge map could decide per edge —
 * it was the one type running along one axis and stacking its pairs across the
 * other. That type is gone and the parameters went with it.
 */
export function edgeAxis(type: MindMapType): Axis | "free" {
  switch (type) {
    case MindMapType.CIRCLE:
    case MindMapType.BUBBLE:
      return "free";
    case MindMapType.TREE:
      return "v";
    default:
      return "h";
  }
}

export function segments(points: Point[]): [Point, Point][] {
  const out: [Point, Point][] = [];
  for (let i = 0; i < points.length - 1; i += 1) out.push([points[i], points[i + 1]]);
  return out;
}

/** One short piece of a tapered connector: a line with its own stroke width. */
export type TaperPiece = { x1: number; y1: number; x2: number; y2: number; width: number };

/**
 * A connector as a run of short segments whose stroke width tapers from `w0` at
 * the parent end to `w1` at the child end, in step with the distance travelled.
 *
 * SVG has no variable-width stroke, so a line that is thick where it meets a big
 * node and thin where it meets a small one has to be built rather than declared.
 * A filled ribbon would give a perfectly smooth taper but cannot be dashed and
 * carries no arrowhead; chopping the polyline into short constant-width pieces
 * keeps both — each piece is an ordinary stroke, so dashes and markers still
 * work — and with round caps the joins read as one smooth line rather than a
 * staircase. The width is sampled at each piece's midpoint by arc length, so it
 * follows the *route*, not the straight-line distance: an elbow tapers evenly
 * along its bends. Works for a two-point straight line and a many-point
 * orthogonal route alike, which is why every map can use it.
 */
export function taperedPieces(points: Point[], w0: number, w1: number, maxLen = 22): TaperPiece[] {
  if (points.length < 2) return [];
  const segs = segments(points);
  const lens = segs.map(([a, b]) => Math.hypot(b.x - a.x, b.y - a.y));
  const total = lens.reduce((sum, len) => sum + len, 0);
  if (total === 0) return [];

  const pieces: TaperPiece[] = [];
  let travelled = 0;
  segs.forEach(([a, b], index) => {
    const len = lens[index];
    // Whole vertices are always piece boundaries, so a corner is never cut
    // across — only the straight run between two vertices is subdivided.
    const steps = Math.max(1, Math.ceil(len / maxLen));
    for (let k = 0; k < steps; k += 1) {
      const t0 = k / steps;
      const t1 = (k + 1) / steps;
      const frac = (travelled + len * ((k + 0.5) / steps)) / total;
      pieces.push({
        x1: a.x + (b.x - a.x) * t0,
        y1: a.y + (b.y - a.y) * t0,
        x2: a.x + (b.x - a.x) * t1,
        y2: a.y + (b.y - a.y) * t1,
        width: w0 + (w1 - w0) * frac,
      });
    }
    travelled += len;
  });
  return pieces;
}

/**
 * Does an axis-aligned segment pass through a box?
 *
 * The box is shrunk by `tolerance` first, so a line that runs exactly along a
 * boundary — which is what every route that has just cleared an obstacle by
 * exactly its clearance does — counts as a miss rather than a hit. Without that
 * the search rejects its own successes.
 *
 * For axis-aligned segments a bounding-box overlap is not an approximation, it
 * is the answer: the segment *is* its own bounding box.
 */
export function hitsRect(a: Point, b: Point, rect: Rect, tolerance = 1): boolean {
  const left = rect.x - rect.w / 2 + tolerance;
  const right = rect.x + rect.w / 2 - tolerance;
  const top = rect.y - rect.h / 2 + tolerance;
  const bottom = rect.y + rect.h / 2 - tolerance;
  if (left >= right || top >= bottom) return false;

  return (
    Math.max(a.x, b.x) > left &&
    Math.min(a.x, b.x) < right &&
    Math.max(a.y, b.y) > top &&
    Math.min(a.y, b.y) < bottom
  );
}

/** Total length along the corners, which an elbow needs and a hypotenuse is not. */
export function pathLength(points: Point[]): number {
  let total = 0;
  for (const [a, b] of segments(points)) total += Math.hypot(b.x - a.x, b.y - a.y);
  return total;
}

/**
 * Drops points that add nothing: repeats, and midpoints that sit *between* their
 * neighbours on a straight run.
 *
 * The "between" test matters. A point on the same line but past its neighbour is
 * a reversal — the line goes out and comes back — and removing it would silently
 * turn a route that goes around something into one that goes through it.
 */
function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - point.x) < EPS && Math.abs(last.y - point.y) < EPS) continue;
    out.push(point);
  }

  let i = 1;
  while (i < out.length - 1) {
    const prev = out[i - 1];
    const curr = out[i];
    const next = out[i + 1];
    const flatX = Math.abs(prev.x - curr.x) < EPS && Math.abs(curr.x - next.x) < EPS;
    const flatY = Math.abs(prev.y - curr.y) < EPS && Math.abs(curr.y - next.y) < EPS;
    const between =
      (flatX && (curr.y - prev.y) * (next.y - curr.y) > 0) ||
      (flatY && (curr.x - prev.x) * (next.x - curr.x) > 0);
    if (between) out.splice(i, 1);
    else i += 1;
  }

  return out;
}

function port(rect: Rect, side: Side): Point {
  return { x: side === "right" ? rect.x + rect.w / 2 : rect.x - rect.w / 2, y: rect.y };
}

function inflate(rect: Rect, by: number): Rect {
  return { x: rect.x, y: rect.y, w: rect.w + by * 2, h: rect.h + by * 2 };
}

function transposeRect(rect: Rect): Rect {
  return { x: rect.y, y: rect.x, w: rect.h, h: rect.w };
}

function transposePoint(point: Point): Point {
  return { x: point.y, y: point.x };
}

/**
 * The span of channel positions a pair of sides allows.
 *
 * Leaving by the right means every turn happens to the right of the box, and
 * arriving at a left edge means the final approach comes from its left. Encoding
 * that as an interval is what lets the same three route shapes serve both "the
 * target is over there" and "the target is behind me, go around" — the second
 * is not a special case, it is the interval landing past the target.
 */
function channelRange(
  exit: Point,
  exitSide: Side,
  entry: Point,
  entrySide: Side,
): [number, number] | null {
  let lo = -Infinity;
  let hi = Infinity;

  if (exitSide === "right") lo = Math.max(lo, exit.x + STUB);
  else hi = Math.min(hi, exit.x - STUB);

  if (entrySide === "left") hi = Math.min(hi, entry.x - STUB);
  else lo = Math.max(lo, entry.x + STUB);

  return lo > hi ? null : [lo, hi];
}

function clamp(value: number, lo: number, hi: number) {
  return Math.min(Math.max(value, lo), hi);
}

/**
 * Channel positions, nearest-to-natural first.
 *
 * The midpoint, a short sweep either side of it, **and one position just past
 * each obstacle**. That last group is what a blind sweep cannot supply: when
 * something sits across the corridor, the only channels that work are the ones
 * immediately beyond it, and those can be any distance from the midpoint at all.
 *
 * A bridge map found this. One pair's edge had a clear channel 330px to the
 * right of the midpoint, the sweep reached 204px, and the router fell through to
 * its go-around family — producing a line that overshot the target and came back
 * at it from behind. Correct, and provably not crossing anything, but nobody
 * draws a bridge map like that.
 */
function channels(lo: number, hi: number, exit: Point, entry: Point, obstacles: Rect[]): number[] {
  const natural = clamp((exit.x + entry.x) / 2, lo, hi);
  const nearest = (a: number, b: number) => Math.abs(a - natural) - Math.abs(b - natural);

  // Just past each obstruction. These come **before** the sweep, not merged with
  // it by distance: a sweep is a guess, and one of these is the answer whenever
  // there is anything to get past at all. Ordering them by distance alongside the
  // sweep is what left the bridge map going the long way round — the sweep filled
  // every slot at ±204 while the channel that worked sat at +335.
  const past = obstacles
    .flatMap((rect) => [rect.x - rect.w / 2 - 1, rect.x + rect.w / 2 + 1])
    .sort(nearest)
    .slice(0, MAX_CHANNELS);

  const sweep: number[] = [];
  for (let k = 1; k <= 6; k += 1) sweep.push(natural + k * STEP, natural - k * STEP);

  const out: number[] = [];
  for (const candidate of [natural, ...past, ...sweep.sort(nearest)]) {
    if (candidate < lo || candidate > hi) continue;
    if (out.some((seen) => Math.abs(seen - candidate) < EPS)) continue;
    out.push(candidate);
  }

  return out.length ? out : [natural];
}

/**
 * Cross-axis positions for a detour, nearest-to-natural first.
 *
 * Taken from the edges of the obstacles themselves rather than swept blindly:
 * the only cross-axis positions worth trying are the ones that just clear
 * something, and there are at most two per node in the way.
 */
function lanes(obstacles: Rect[], exit: Point, entry: Point): number[] {
  const natural = (exit.y + entry.y) / 2;
  const out: number[] = [];

  for (const rect of obstacles) {
    out.push(rect.y - rect.h / 2 - 1, rect.y + rect.h / 2 + 1);
  }
  out.push(exit.y - STEP, exit.y + STEP, entry.y - STEP, entry.y + STEP);

  return out
    .sort((a, b) => Math.abs(a - natural) - Math.abs(b - natural))
    .filter((value, index, all) => all.findIndex((v) => Math.abs(v - value) < EPS) === index)
    .slice(0, MAX_LANES);
}

/**
 * Routes an edge, working left-to-right. Vertical maps are transposed into this
 * one and back out again, so there is one algorithm rather than two that drift.
 */
function routeHorizontal(from: Rect, to: Rect, obstacles: Rect[]): Point[] {
  const blocked = obstacles.map((rect) => inflate(rect, CLEARANCE));
  const isClear = (points: Point[]) =>
    segments(points).every(([a, b]) => blocked.every((rect) => !hitsRect(a, b, rect)));

  const forward = to.x >= from.x;
  // Natural sides first, then the ones that go around. A route that leaves and
  // arrives on the far sides looks odd and is sometimes the only clear one.
  const pairs: [Side, Side][] = forward
    ? [
        ["right", "left"],
        ["right", "right"],
        ["left", "left"],
        ["left", "right"],
      ]
    : [
        ["left", "right"],
        ["left", "left"],
        ["right", "right"],
        ["right", "left"],
      ];

  const candidates: Point[][] = [];

  for (const [exitSide, entrySide] of pairs) {
    const exit = port(from, exitSide);
    const entry = port(to, entrySide);
    const range = channelRange(exit, exitSide, entry, entrySide);
    if (!range) continue;

    // Straight, but only when the ports genuinely face each other — otherwise
    // "straight" is a line back through the box it just left.
    const facing =
      exitSide === "right" && entrySide === "left"
        ? entry.x > exit.x
        : exitSide === "left" && entrySide === "right"
          ? entry.x < exit.x
          : false;
    if (facing && Math.abs(exit.y - entry.y) < EPS) candidates.push([exit, entry]);

    for (const cx of channels(range[0], range[1], exit, entry, blocked)) {
      candidates.push(simplify([exit, { x: cx, y: exit.y }, { x: cx, y: entry.y }, entry]));
    }
  }

  // Detours last: two turns out, across, and two turns back in. This is the
  // family that solves the case a dogleg cannot — both ends on the same row
  // with something sitting between them, where every channel collapses onto the
  // blocked straight line.
  for (const [exitSide, entrySide] of pairs) {
    const exit = port(from, exitSide);
    const entry = port(to, entrySide);
    if (!channelRange(exit, exitSide, entry, entrySide)) continue;

    const sx = exitSide === "right" ? exit.x + STUB : exit.x - STUB;
    const ex = entrySide === "left" ? entry.x - STUB : entry.x + STUB;

    for (const lane of lanes(blocked, exit, entry)) {
      candidates.push(
        simplify([
          exit,
          { x: sx, y: exit.y },
          { x: sx, y: lane },
          { x: ex, y: lane },
          { x: ex, y: entry.y },
          entry,
        ]),
      );
    }
  }

  for (const candidate of candidates) {
    if (candidate.length >= 2 && isClear(candidate)) return candidate;
  }

  // Nothing was clear. Draw the most ordinary route anyway.
  return (
    candidates[0] ?? [
      port(from, forward ? "right" : "left"),
      port(to, forward ? "left" : "right"),
    ]
  );
}

export function routeEdge(from: Rect, to: Rect, axis: Axis, obstacles: Rect[]): Point[] {
  if (axis === "v") {
    return routeHorizontal(
      transposeRect(from),
      transposeRect(to),
      obstacles.map(transposeRect),
    ).map(transposePoint);
  }
  return routeHorizontal(from, to, obstacles);
}

/**
 * A straight line between two nodes, stopped at their boundaries.
 *
 * For the free canvases, where a right angle would be a lie about the
 * structure. Round nodes are trimmed to their radius so the line meets the
 * circle rather than disappearing into it.
 */
export function trimStraight(from: Rect, to: Rect, round: boolean): [Point, Point] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < EPS) return [{ x: from.x, y: from.y }, { x: to.x, y: to.y }];

  const ux = dx / distance;
  const uy = dy / distance;

  const reach = (rect: Rect) => {
    if (round) return rect.w / 2;
    // Where the ray leaves an axis-aligned box: whichever wall it meets first.
    const tx = Math.abs(ux) < EPS ? Infinity : rect.w / 2 / Math.abs(ux);
    const ty = Math.abs(uy) < EPS ? Infinity : rect.h / 2 / Math.abs(uy);
    return Math.min(tx, ty);
  };

  const a = reach(from);
  const b = reach(to);
  // Two nodes closer together than their own radii would produce a line that
  // runs backwards; a degenerate zero-length line is the honest answer.
  const total = Math.min(a + b, distance);
  const scale = total > distance ? distance / total : 1;

  return [
    { x: from.x + ux * a * scale, y: from.y + uy * a * scale },
    { x: to.x - ux * b * scale, y: to.y - uy * b * scale },
  ];
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** An SVG `d`, with the corners rounded and the endpoints left exactly alone. */
export function pathFromPoints(points: Point[], radius = CORNER): string {
  const pts = simplify(points);
  if (pts.length < 2) return "";

  const first = pts[0];
  const last = pts[pts.length - 1];
  if (pts.length === 2) {
    return `M ${round2(first.x)} ${round2(first.y)} L ${round2(last.x)} ${round2(last.y)}`;
  }

  let d = `M ${round2(first.x)} ${round2(first.y)}`;

  for (let i = 1; i < pts.length - 1; i += 1) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];

    const inLength = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const outLength = Math.hypot(next.x - curr.x, next.y - curr.y);
    const r = Math.min(radius, inLength / 2, outLength / 2);

    const toward = (target: Point, length: number) =>
      length < EPS
        ? curr
        : {
            x: curr.x + ((target.x - curr.x) / length) * r,
            y: curr.y + ((target.y - curr.y) / length) * r,
          };

    const a = toward(prev, inLength);
    const b = toward(next, outLength);

    d += ` L ${round2(a.x)} ${round2(a.y)} Q ${round2(curr.x)} ${round2(curr.y)} ${round2(b.x)} ${round2(b.y)}`;
  }

  return `${d} L ${round2(last.x)} ${round2(last.y)}`;
}
