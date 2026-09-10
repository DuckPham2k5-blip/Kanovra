import { DEFAULT_THICKNESS, type CanvasNode, type RadialSettings } from "@/lib/mind-map-canvas";

/**
 * A radial map: the title in the middle, branches fanning out around it as ring
 * segments, each one free to split into narrower segments further out.
 *
 * This replaces the circle map's old drawing — a ring with the detail loose
 * inside it — because the two answer different questions. A ring holds a list.
 * A wheel of nested segments holds a *breakdown*: this branch is these three
 * things, and this one of those is these two, all of it readable at a glance
 * because the angle a branch occupies is how much of the whole it accounts for.
 *
 * ## Angles are shares, never stored positions
 *
 * A branch stores a `weight`, not a start and end angle. Its span is its share
 * of whatever its parent has, and its parent's span is a share of the map's
 * sweep. That one decision is what makes every editing operation safe:
 *
 *   - splitting a branch into three is giving it three children of weight 1,
 *   - deleting one hands its angle back to its siblings automatically,
 *   - dragging a boundary is moving weight from one sibling to the next,
 *
 * and none of them can produce a child sticking out of its parent, a gap in the
 * middle of a ring, or two segments on top of each other. With absolute angles
 * every one of those is a case to police, and the first one missed draws a wheel
 * that is visibly wrong in a way no assertion is watching for.
 *
 * ## Radius accumulates down the branch, not across the ring
 *
 * A node's inner radius is the hub plus the thickness of each of its ancestors.
 * So dragging one branch longer pushes *its own* descendants outward and leaves
 * its siblings where they were, which is what the sketch asks for. A per-ring
 * thickness would be simpler and would make one long branch fatten the whole
 * ring it sits in.
 */

/** The inner circle that holds the title. */
export const HUB_RADIUS = 90;

/** Default thickness of one branch's ring, and what a new branch gets. */
export const RING_THICKNESS = DEFAULT_THICKNESS;

/** Recursion bound. Corrupt data can point a node at itself. */
const MAX_DEPTH = 40;

const TAU = Math.PI * 2;

export type Sector = {
  id: string;
  /** 0 is the hub, 1 the first ring of branches, and so on outward. */
  depth: number;
  /** Degrees, clockwise, 0 at three o'clock — SVG's own convention. */
  a0: number;
  a1: number;
  r0: number;
  r1: number;
};

export type Ring = { a0: number; a1: number; r0: number; r1: number };

function childrenOf(nodes: CanvasNode[], id: string) {
  return nodes.filter((node) => node.parentId === id && node.id !== id);
}

/**
 * Every node's ring segment, keyed by id.
 *
 * Walks outward from the root, handing each level its parent's angular range to
 * divide. A node whose parent is missing is simply not placed: the caller draws
 * what it is given, and a segment at a guessed angle is worse than one absent —
 * `parseCanvas` has already reattached genuine orphans to the root before this
 * ever runs.
 */
export function radialLayout(
  nodes: CanvasNode[],
  settings: RadialSettings,
): Map<string, Sector> {
  const placed = new Map<string, Sector>();
  const root = nodes.find((node) => node.parentId === null);
  if (!root) return placed;

  placed.set(root.id, {
    id: root.id,
    depth: 0,
    a0: settings.start,
    a1: settings.start + settings.sweep,
    r0: 0,
    r1: HUB_RADIUS,
  });

  const divide = (parentId: string, a0: number, a1: number, r0: number, depth: number) => {
    if (depth > MAX_DEPTH) return;

    const kids = childrenOf(nodes, parentId);
    if (!kids.length) return;

    // A lone child takes the lot whatever its weight says: a share only means
    // anything measured against siblings.
    const total = kids.reduce((sum, kid) => sum + Math.max(0, kid.weight), 0);
    const span = a1 - a0;

    let cursor = a0;
    for (const kid of kids) {
      const share = total > 0 ? Math.max(0, kid.weight) / total : 1 / kids.length;
      const width = span * share;
      const r1 = r0 + kid.thickness;

      placed.set(kid.id, {
        id: kid.id,
        depth,
        a0: cursor,
        a1: cursor + width,
        r0,
        r1,
      });

      divide(kid.id, cursor, cursor + width, r1, depth + 1);
      cursor += width;
    }
  };

  divide(root.id, settings.start, settings.start + settings.sweep, HUB_RADIUS, 1);
  return placed;
}

/** How far the drawing reaches from the centre — what the view has to fit. */
export function radialReach(sectors: Map<string, Sector>): number {
  let reach = 0;
  for (const sector of sectors.values()) reach = Math.max(reach, sector.r1);
  return reach;
}

/**
 * The same turn expressed as the shorter way round, in (-180, 180].
 *
 * `atan2` wraps at ±180, so a drag crossing the nine o'clock line reports a 359°
 * jump. Without this the wheel spins the long way round the moment the pointer
 * crosses that line, which reads as the drag having glitched rather than as
 * arithmetic.
 */
export function shortestTurn(degrees: number) {
  let turn = degrees % 360;
  if (turn > 180) turn -= 360;
  if (turn <= -180) turn += 360;
  return turn;
}

/**
 * Where to put two neighbours' weights so their shared edge lands under the
 * pointer.
 *
 * The pair's total weight is held constant, which is what confines the drag to the
 * two of them: weights are shares, so if the pair keeps its total then every other
 * branch on the wheel keeps its angle. Change one weight alone and the whole ring
 * re-divides, and the boundaries the author was not touching visibly slide.
 *
 * Both ends are clamped to leave a sliver rather than allowing zero. A branch
 * dragged to nothing is unclickable, and the only way back would be to know it was
 * still there.
 */
export function shareBetween(
  pointerOffset: number,
  combinedSpan: number,
  combinedWeight: number,
): { mine: number; theirs: number } {
  const min = Math.min(2, combinedSpan / 2);
  const mineSpan = Math.min(Math.max(pointerOffset, min), combinedSpan - min);
  const share = combinedSpan > 0 ? mineSpan / combinedSpan : 0.5;

  return {
    mine: Math.max(0.05, combinedWeight * share),
    theirs: Math.max(0.05, combinedWeight * (1 - share)),
  };
}

function polar(r: number, degrees: number) {
  const rad = (degrees * Math.PI) / 180;
  return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function point(r: number, degrees: number) {
  const p = polar(r, degrees);
  return `${round2(p.x)} ${round2(p.y)}`;
}

/**
 * An annular sector as an SVG path.
 *
 * A full turn is built from four arcs rather than one. An arc command from an
 * angle back to the same angle has zero length and draws nothing at all, so the
 * one case that matters most — a map whose single branch fills the wheel —
 * would come out invisible.
 */
export function sectorPath(ring: Ring): string {
  const span = ring.a1 - ring.a0;
  if (Math.abs(span) < 1e-6 || Math.abs(ring.r1 - ring.r0) < 1e-6) return "";

  const full = Math.abs(span) >= 359.999;
  if (full) {
    const mid = ring.a0 + 180;
    return [
      `M ${point(ring.r1, ring.a0)}`,
      `A ${round2(ring.r1)} ${round2(ring.r1)} 0 0 1 ${point(ring.r1, mid)}`,
      `A ${round2(ring.r1)} ${round2(ring.r1)} 0 0 1 ${point(ring.r1, ring.a0)}`,
      `M ${point(ring.r0, ring.a0)}`,
      `A ${round2(ring.r0)} ${round2(ring.r0)} 0 0 0 ${point(ring.r0, mid)}`,
      `A ${round2(ring.r0)} ${round2(ring.r0)} 0 0 0 ${point(ring.r0, ring.a0)}`,
      "Z",
    ].join(" ");
  }

  const large = Math.abs(span) > 180 ? 1 : 0;
  const sweep = span > 0 ? 1 : 0;

  return [
    `M ${point(ring.r0, ring.a0)}`,
    `L ${point(ring.r1, ring.a0)}`,
    `A ${round2(ring.r1)} ${round2(ring.r1)} 0 ${large} ${sweep} ${point(ring.r1, ring.a1)}`,
    `L ${point(ring.r0, ring.a1)}`,
    `A ${round2(ring.r0)} ${round2(ring.r0)} 0 ${large} ${sweep ? 0 : 1} ${point(ring.r0, ring.a0)}`,
    "Z",
  ].join(" ");
}

/**
 * The same segment shrunk by a few pixels on every side, which is what gets
 * drawn.
 *
 * The gap is a fixed *distance*, converted to degrees at each radius rather than
 * being a fixed angle. A constant angular gap is a hairline next to the hub and a
 * chasm out at the rim, so the wheel stops reading as one object.
 */
export function insetRing(ring: Ring, pad: number): Ring {
  const r0 = ring.r0 + pad;
  const r1 = Math.max(r0, ring.r1 - pad);

  // Degrees subtended by `pad` at the inner radius, where the arc is shortest
  // and so the correction largest.
  const atInner = r0 > 0 ? (pad / r0) * (180 / Math.PI) : 0;
  const span = ring.a1 - ring.a0;
  const trim = Math.min(atInner, Math.abs(span) / 2 - 0.001);

  if (Math.abs(span) >= 359.999) return { ...ring, r0, r1 };
  return { a0: ring.a0 + trim, a1: ring.a1 - trim, r0, r1 };
}

export type LabelPlacement = {
  x: number;
  y: number;
  rotation: number;
  /**
   * `tangential` runs the text along its arc, `radial` runs it outward from the
   * centre, and `none` means the segment is too small for the words to fit
   * either way.
   */
  orientation: "tangential" | "radial" | "none";
};

/**
 * Where a label goes, which way it runs, and which way up.
 *
 * Two orientations, chosen by which one the text actually fits in. A wide, shallow
 * segment reads along its arc; a narrow, deep one reads outward along its radius.
 * Forcing everything tangential — the first version did — squeezes long words in
 * the outer rings into an arc a fraction of their length, and they either overflow
 * into their neighbours or get dropped, which silently loses exactly the detailed
 * labels somebody went three levels deep to write.
 *
 * Text is flipped on the left half of the wheel in both orientations. Without it
 * every label from seven to eleven o'clock is upside down, which is not a subtle
 * fault but is easy to miss when the test map happens to be small.
 *
 * `textWidth` is the caller's estimate in pixels — it owns the font, so it is the
 * only thing that can measure.
 */
export function labelPlacement(ring: Ring, textWidth: number): LabelPlacement {
  const mid = (ring.a0 + ring.a1) / 2;
  const radius = (ring.r0 + ring.r1) / 2;
  const p = polar(radius, mid);

  const alongArc = (Math.abs(ring.a1 - ring.a0) / 360) * TAU * radius;
  const alongRadius = Math.abs(ring.r1 - ring.r0);

  const orientation =
    alongArc >= textWidth ? "tangential" : alongRadius >= textWidth ? "radial" : "none";

  // Tangential text is perpendicular to the radius, so it sits at the mid angle
  // plus a quarter turn; radial text runs along the radius itself.
  const base = orientation === "tangential" ? mid + 90 : mid;

  /*
   * The flip is decided from the *drawn* angle, not from the branch's angle.
   *
   * Those are the same thing for radial text and a quarter turn apart for
   * tangential, so testing the branch angle leaves every tangential label across
   * the bottom of the wheel upside down — and only across the bottom, which is
   * exactly the kind of fault a small test map does not happen to contain.
   */
  const normalised = ((base % 360) + 360) % 360;
  const flip = normalised > 90 && normalised < 270;

  return {
    x: p.x,
    y: p.y,
    rotation: flip ? base + 180 : base,
    orientation,
  };
}

/**
 * Several wheels in one map, laid out in a row.
 *
 * A circle map used to have one root at the centre; it can now have any number,
 * each its own sunburst. They are packed left to right by how far each reaches,
 * with the first centred on the origin — so a map with a single root sits
 * exactly where it always did, and adding a second places it clear to the right
 * rather than on top of the first.
 *
 * Positions are computed from the drawing rather than stored on the nodes: the
 * radial types have never read a node's `x`/`y`, and a packed row that reflows
 * as wheels grow is one less piece of state that can drift out of step with the
 * geometry it is meant to describe.
 */
export function packWheels(
  items: { id: string; reach: number }[],
  gap = 140,
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  let centerX = 0;
  let prevReach = 0;

  items.forEach((item, index) => {
    if (index === 0) {
      centerX = 0;
    } else {
      // Clear of the previous wheel: its far edge, a gap, then this wheel's
      // own radius so the two never touch however wide either grows.
      centerX = centerX + prevReach + gap + item.reach;
    }
    out.set(item.id, { x: centerX, y: 0 });
    prevReach = item.reach;
  });

  return out;
}
