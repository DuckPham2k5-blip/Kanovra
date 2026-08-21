"use client";

import { MessageSquare, MoreHorizontal, Palette, PlusCircle, Split, Trash2 } from "lucide-react";
import * as React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CanvasNode, RadialSettings } from "@/lib/mind-map-canvas";
import {
  HUB_RADIUS,
  insetRing,
  labelPlacement,
  radialLayout,
  radialReach,
  sectorPath,
  shareBetween,
  shortestTurn,
  type Sector,
} from "@/lib/mind-map-radial";
import type { MapPalette, MapTone } from "@/lib/mind-map-palette";
import { fillBorder, fillCss, fillInk, gradientEnds } from "@/lib/mind-map-fill";
import { NODE_EMOJI, radialShade } from "@/lib/mind-maps";
import { cn } from "@/lib/utils";

/**
 * A radial map: the title in a hub, branches fanning out as ring segments.
 *
 * The segment *is* the node here — there is no box floating over a canvas — so
 * this replaces the drawing layer rather than adding to it. Everything around it
 * still belongs to `MindMapCanvas`: the node state, the explicit save, pan and
 * zoom, the comment panel and presence. Duplicating those to get a second kind
 * of drawing is how two editors drift apart until only one of them has the fix.
 *
 * ## Why the controls are a menu and not handles, for now
 *
 * Dragging a boundary to move weight between siblings, dragging a rim to make a
 * branch longer, and dragging the wheel round its axis are all coming. Until they
 * are, every one of those operations is reachable from the `…` menu with a
 * definite step size. A drawing you can see and cannot edit is worse than one
 * edited a click at a time, and shipping the geometry without any way to change
 * it would have made the map read-only for as long as that took.
 */

const LABEL_FUDGE = 0.56;
/** Gap between neighbouring segments, as a distance rather than an angle. */
const SEGMENT_PAD = 2;

export function MindMapWheel({
  nodes,
  radial,
  canEdit,
  canComment,
  mounted,
  threadSizes,
  savedIds,
  renderWatchers,
  palette,
  onUpdate,
  onSplit,
  onAddBranch,
  onRemove,
  onSetThickness,
  onSetWeights,
  onCommitRotation,
  onOpenThread,
  onPickColor,
  onFocusNode,
  focusedNodeId,
  siblingsOf,
}: {
  /** The branches sharing a parent with this one, in drawing order. */
  siblingsOf: (id: string) => CanvasNode[];
  nodes: CanvasNode[];
  radial: RadialSettings;
  canEdit: boolean;
  canComment: boolean;
  mounted: boolean;
  /** How many comments each node has, so a segment can show it carries a thread. */
  threadSizes: Map<string, number>;
  /** Ids present in the *saved* map — the only ones a comment can be keyed to. */
  savedIds: Set<string>;
  /**
   * Draws the avatars of whoever else is on a node. A function rather than
   * markup, so the avatar stack exists in exactly one place and the two drawings
   * cannot drift into showing presence differently.
   */
  renderWatchers: (nodeId: string) => React.ReactNode;
  palette: MapPalette;
  onUpdate: (id: string, patch: Partial<CanvasNode>) => void;
  onSplit: (node: CanvasNode, count: number) => void;
  onAddBranch: (beside: CanvasNode) => void;
  onRemove: (id: string) => void;
  /** Sets a branch's thickness outright, for a drag that knows the answer. */
  onSetThickness: (id: string, px: number) => void;
  /** Moves weight between two neighbours in one go, so their shared edge holds. */
  onSetWeights: (updates: { id: string; weight: number }[]) => void;
  /** Commits a rotation once the drag ends. */
  onCommitRotation: (start: number) => void;
  onOpenThread: (id: string) => void;
  /** Opens the canvas-wide colour panel on this segment. */
  onPickColor: (id: string) => void;
  onFocusNode: (id: string | null) => void;
  focusedNodeId: string | null;
}) {
  // The hub, the grips and the furniture are drawn in the map's own colour; only
  // a segment can be overridden by the node it stands for.
  const mapHue = palette.hue;
  const sectors = React.useMemo(() => radialLayout(nodes, radial), [nodes, radial]);
  const byId = React.useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const reach = radialReach(sectors);

  const root = nodes.find((node) => node.parentId === null);

  /**
   * The hue a segment is painted in: its own if it has one, otherwise the one it
   * inherits from the branch it hangs off.
   *
   * Inherited rather than per-node by default, because the thing a reader needs
   * from a wheel is which trunk a segment belongs to. Colouring each ring
   * independently makes a pretty dartboard that answers nothing.
   */
  const hueOf = React.useCallback(
    (id: string) => {
      let cursor = byId.get(id);
      let guard = 0;
      while (cursor && guard < 40) {
        if (cursor.hue !== null && cursor.hue !== undefined) return cursor.hue;
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
        guard += 1;
      }
      return mapHue;
    },
    [byId, mapHue],
  );

  const ordered = React.useMemo(
    () => [...sectors.values()].sort((p, q) => p.depth - q.depth),
    [sectors],
  );

  const svgRef = React.useRef<SVGSVGElement>(null);

  /**
   * Rotation while the drag is in flight, kept apart from `radial.start`.
   *
   * This is the whole reason the rotation is smooth. Writing to `radial.start` on
   * every pointer move would re-run the layout, rebuild every segment path and
   * re-reconcile the lot sixty times a second. Instead the number lands on one
   * SVG `transform` on a group whose children are memoised, so a frame of
   * rotating costs one attribute — and the real value is written once, on release.
   */
  const [liveRotation, setLiveRotation] = React.useState(0);

  const drag = React.useRef<
    | { kind: "rotate"; from: number }
    | { kind: "thickness"; id: string; r0: number }
    | {
        kind: "weight";
        id: string;
        nextId: string;
        a0: number;
        combinedSpan: number;
        combinedWeight: number;
      }
    | null
  >(null);

  /**
   * Where the pointer is, in the wheel's own polar coordinates.
   *
   * Measured from the SVG's box rather than from the canvas's pan and zoom. The
   * wheel sits inside that transform, and asking the element where it actually
   * landed is both shorter and immune to the two of them drifting — the
   * alternative is threading offset and scale down here and recomputing what the
   * browser already knows.
   */
  const pointerAt = React.useCallback((event: { clientX: number; clientY: number }) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return { angle: 0, radius: 0 };

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // The viewBox is square and 1:1 with user units, so one number converts back.
    const scale = rect.width / (viewSide(reach) * 2);
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;

    return {
      angle: (Math.atan2(dy, dx) * 180) / Math.PI,
      radius: Math.hypot(dx, dy) / (scale || 1),
    };
  }, [reach]);

  function beginDrag(event: React.PointerEvent, next: NonNullable<typeof drag.current>) {
    // Swallowed so the canvas underneath does not start panning at the same time —
    // the bug that killed the add button twice on the box canvas.
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    drag.current = next;
  }

  function onDragMove(event: React.PointerEvent) {
    const active = drag.current;
    if (!active) return;
    const { angle, radius } = pointerAt(event);

    if (active.kind === "rotate") {
      setLiveRotation(shortestTurn(angle - active.from));
      return;
    }

    if (active.kind === "thickness") {
      onSetThickness(active.id, radius - active.r0);
      return;
    }

    // The shared edge between two neighbours follows the pointer, and the pair's
    // total weight is held fixed — so one widens by exactly what the other loses
    // and nothing beyond the two of them moves.
    const { mine, theirs } = shareBetween(
      shortestTurn(angle - active.a0),
      active.combinedSpan,
      active.combinedWeight,
    );

    onSetWeights([
      { id: active.id, weight: mine },
      { id: active.nextId, weight: theirs },
    ]);
  }

  function endDrag() {
    const active = drag.current;
    drag.current = null;
    if (active?.kind === "rotate" && liveRotation !== 0) {
      onCommitRotation(radial.start + liveRotation);
      setLiveRotation(0);
    }
  }

  if (!root) return null;

  const selectedSector = focusedNodeId ? sectors.get(focusedNodeId) : undefined;
  const selectedNode = focusedNodeId ? byId.get(focusedNodeId) : undefined;

  return (
    <div className="absolute left-0 top-0">
      {/* Sized from the drawing rather than fixed, and centred on the origin, so
          the wheel grows outward from the middle exactly as the geometry says. */}
      <svg
        ref={svgRef}
        className="absolute overflow-visible"
        style={{ left: -viewSide(reach), top: -viewSide(reach) }}
        width={viewSide(reach) * 2}
        height={viewSide(reach) * 2}
        viewBox={`${-viewSide(reach)} ${-viewSide(reach)} ${viewSide(reach) * 2} ${viewSide(reach) * 2}`}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* The live rotation is one attribute on one group. Everything inside is
            memoised, so a frame of rotating does not rebuild a single path. */}
        <g transform={liveRotation ? `rotate(${liveRotation.toFixed(3)})` : undefined}>
          <Segments
            ordered={ordered}
            byId={byId}
            hueOf={hueOf}
            tone={palette.tone}
            focusedNodeId={focusedNodeId}
            onFocusNode={onFocusNode}
          />

          {canEdit && selectedSector && selectedNode ? (
            <Handles
              sector={selectedSector}
              hasNextSibling={nextSiblingOf(selectedNode, siblingsOf) !== undefined}
              onThicknessDown={(event) =>
                beginDrag(event, {
                  kind: "thickness",
                  id: selectedSector.id,
                  r0: selectedSector.r0,
                })
              }
              onWeightDown={(event) => {
                const next = nextSiblingOf(selectedNode, siblingsOf);
                const nextSector = next ? sectors.get(next.id) : undefined;
                if (!next || !nextSector) return;
                beginDrag(event, {
                  kind: "weight",
                  id: selectedSector.id,
                  nextId: next.id,
                  a0: selectedSector.a0,
                  combinedSpan:
                    selectedSector.a1 - selectedSector.a0 + (nextSector.a1 - nextSector.a0),
                  combinedWeight: selectedNode.weight + next.weight,
                });
              }}
            />
          ) : null}
        </g>

        {/* The rotate grip rides the hub's rim, outside the rotating group: a grip
            that moves with what it is rotating slides out from under the pointer. */}
        {canEdit ? (
          <circle
            cx={0}
            cy={-HUB_RADIUS}
            r={9}
            className="cursor-grab"
            fill={`hsl(${mapHue} 85% 62%)`}
            stroke="hsl(0 0% 100% / 0.85)"
            strokeWidth={2}
            onPointerDown={(event) =>
              beginDrag(event, { kind: "rotate", from: pointerAt(event).angle })
            }
          >
            <title>Drag to turn the wheel</title>
          </circle>
        ) : null}
      </svg>

      {/* The hub is real HTML, not SVG: it holds an editable title, and a
          `foreignObject` inside SVG behaves differently enough across browsers to
          be a poor place for the one control every map has. */}
      <div
        // Swallowed, or the viewport underneath captures the pointer to pan and
        // neither the title box nor the add button ever receives its click. Every
        // HTML control layered over this canvas needs this; forgetting it is the
        // single recurring cause of a dead button in this project.
        onPointerDown={(event) => event.stopPropagation()}
        className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-center"
        style={{
          left: 0,
          top: 0,
          width: HUB_RADIUS * 2,
          height: HUB_RADIUS * 2,
          // The hub is a node like any other and takes its own colour when it has
          // been given one. It used to read only the map's hue, so the one item
          // on a wheel that names the whole subject was the one item nobody could
          // colour.
          background: root.fill ? fillCss(root.fill) : `hsl(${mapHue} 60% 16%)`,
          borderColor: root.fill ? fillBorder(root.fill) : `hsl(${mapHue} 85% 62%)`,
        }}
      >
        <textarea
          value={root.text}
          readOnly={!canEdit}
          maxLength={160}
          placeholder="Main title"
          onChange={(event) => onUpdate(root.id, { text: event.target.value })}
          className="h-2/3 w-3/4 resize-none bg-transparent text-center text-sm font-semibold leading-snug outline-none placeholder:text-muted-foreground"
          // On the words, not on the hub: `color` inherits, and the controls
          // pinned to the hub's corners sit inside it.
          style={{ color: root.fill ? fillInk(root.fill) : undefined }}
        />

        {canEdit && mounted ? (
          // One press, one branch. It was a menu whose first item was "Add a
          // branch" and whose other two rotated the wheel — but the wheel is
          // turned by dragging the hub's rim, which is the gesture this control
          // sits next to. A `+` that opens a list to offer the thing the `+`
          // already means is a step nobody asked for.
          <div className="absolute -right-1 -top-1 flex gap-1">
            <button
              type="button"
              aria-label="Add a branch"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onAddBranch(root)}
              className="rounded-full border bg-background p-1 shadow-sm"
              style={{ borderColor: `hsl(${mapHue} 85% 62%)` }}
            >
              <PlusCircle className="size-4" />
            </button>
            {/* The hub's own colour. A plain button rather than a menu with one
                item on it, matching the `+` beside it. */}
            <button
              type="button"
              aria-label="Change the hub's colour"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onPickColor(root.id)}
              className="rounded-full border bg-background p-1 shadow-sm"
              style={{ borderColor: `hsl(${mapHue} 85% 62%)` }}
            >
              <Palette className="size-4" />
            </button>
          </div>
        ) : null}
      </div>

      {/* Per-segment furniture — the menu, the comment count, who is watching —
          positioned in HTML over the drawing. Only for the selected segment, and
          only after hydration: a wheel is an arbitrary number of menu triggers,
          which is the worst possible shape for Radix's `useId` counter. */}
      {mounted && focusedNodeId && focusedNodeId !== root.id
        ? (() => {
            const sector = sectors.get(focusedNodeId);
            const node = byId.get(focusedNodeId);
            if (!sector || !node) return null;

            const place = labelPlacement(insetRing(sector, SEGMENT_PAD), 0);
            const threadSize = threadSizes.get(node.id) ?? 0;

            return (
              <div
                // Same reason as the hub: the `…` menu, the comment button and the
                // avatars all sit over the pannable canvas.
                onPointerDown={(event) => event.stopPropagation()}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1"
                style={{ left: place.x, top: place.y }}
              >
                {renderWatchers(node.id)}

                {savedIds.has(node.id) && (threadSize > 0 || canComment) ? (
                  <button
                    type="button"
                    aria-label={
                      threadSize > 0 ? `${threadSize} comments on this branch` : "Comment on this branch"
                    }
                    onClick={() => onOpenThread(node.id)}
                    className="flex items-center gap-1 rounded-full border bg-background px-1.5 py-1 text-[11px] shadow-sm"
                  >
                    <MessageSquare className="size-3.5" />
                    {threadSize > 0 ? threadSize : null}
                  </button>
                ) : null}

                {/* Adding a branch and choosing a colour, out of the menu.
                 *
                 * Every `DropdownMenuItem` on this canvas is currently
                 * unreachable — the owner reported the colour item, the comment
                 * item and "add a branch beside this" all doing nothing, while
                 * the plain buttons beside them work and the emoji grid inside
                 * the same menu works, because those are plain buttons too. The
                 * cause is still being narrowed; these are the two actions with
                 * nowhere else to go, and the hub already proves the shape. */}
                {canEdit ? (
                  <>
                    <button
                      type="button"
                      aria-label="Add a branch beside this"
                      onClick={() => onAddBranch(node)}
                      className="rounded-full border bg-background p-1 shadow-sm"
                    >
                      <PlusCircle className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Change this branch's colour"
                      onClick={() => onPickColor(node.id)}
                      className="rounded-full border bg-background p-1 shadow-sm"
                    >
                      <Palette className="size-3.5" />
                    </button>
                  </>
                ) : null}

                {canEdit ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="More for this branch"
                        className="rounded-full border bg-background p-1 shadow-sm"
                      >
                        <MoreHorizontal className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-60">
                      <DropdownMenuLabel>Split</DropdownMenuLabel>
                      {[2, 3, 4, 5].map((count) => (
                        <DropdownMenuItem key={count} onSelect={() => onSplit(node, count)}>
                          <Split /> Into {count}
                        </DropdownMenuItem>
                      ))}

                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => onAddBranch(node)}>
                        <PlusCircle /> Add a branch beside this
                      </DropdownMenuItem>

                      {/* Size is not here. A branch is made wider by dragging
                          the boundary it shares with its neighbour and longer by
                          dragging its outer rim, and both grips are on the
                          drawing. Four menu rows restating two visible handles is
                          clutter on a menu with real choices left. */}

                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Emoji</DropdownMenuLabel>
                      <div className="grid grid-cols-8 gap-0.5 px-1.5 pb-1">
                        {NODE_EMOJI.map((glyph) => (
                          <button
                            key={glyph}
                            type="button"
                            aria-label={`Mark with ${glyph}`}
                            onClick={() =>
                              onUpdate(node.id, { emoji: node.emoji === glyph ? null : glyph })
                            }
                            className={cn(
                              "rounded p-1 text-base leading-none hover:bg-accent",
                              node.emoji === glyph && "bg-accent",
                            )}
                          >
                            {glyph}
                          </button>
                        ))}
                      </div>

                      <DropdownMenuSeparator />
                      {/* The same panel the boxes on a free canvas open. A
                          segment's colour is chosen the same way whatever shape
                          the map draws it as. */}
                      <DropdownMenuItem onSelect={() => onPickColor(node.id)}>
                        <span
                          aria-hidden
                          className="size-4 rounded border"
                          style={{
                            background: node.fill
                              ? fillCss(node.fill)
                              : `hsl(${mapHue} 88% 60%)`,
                          }}
                        />
                        Change colour
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => onRemove(node.id)}>
                        <Trash2 /> Remove this branch
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            );
          })()
        : null}
    </div>
  );
}

/** Half the side of the square the wheel is drawn into, with room to breathe. */
function viewSide(reach: number) {
  return reach + 40;
}

/** The branch drawn immediately after this one among its siblings. */
function nextSiblingOf(node: CanvasNode, siblingsOf: (id: string) => CanvasNode[]) {
  const siblings = siblingsOf(node.id);
  const index = siblings.findIndex((s) => s.id === node.id);
  return index >= 0 ? siblings[index + 1] : undefined;
}

/**
 * Every segment, memoised as one unit.
 *
 * Split out purely so rotating the wheel does not touch it. Left inline, each
 * pointer move during a rotation re-created every path element in the drawing,
 * and the answer to "why does it stutter on a big map" would have been "because it
 * redraws the map to move it".
 */
const Segments = React.memo(function Segments({
  ordered,
  byId,
  hueOf,
  tone,
  focusedNodeId,
  onFocusNode,
}: {
  ordered: Sector[];
  byId: Map<string, CanvasNode>;
  hueOf: (id: string) => number;
  /** The map's tone. A node may override the hue; the tone is the map's. */
  tone: MapTone;
  focusedNodeId: string | null;
  onFocusNode: (id: string | null) => void;
}) {
  return (
    <>
      {ordered.map((sector) => {
        const node = byId.get(sector.id);
        if (!node || sector.depth === 0) return null;
        return (
          <Segment
            key={sector.id}
            sector={sector}
            node={node}
            palette={{ hue: hueOf(sector.id), tone }}
            selected={focusedNodeId === sector.id}
            onSelect={() => onFocusNode(sector.id)}
          />
        );
      })}
    </>
  );
});

/**
 * The two grips on the selected branch: one on its outer rim for how far it
 * reaches, one on its trailing edge for how wide it is.
 *
 * Grips rather than dragging the segment body. A segment is also the thing you
 * click to select and the thing that carries the label, and making a press mean
 * three different things depending on where in the shape it landed is how a
 * drawing becomes guesswork.
 */
function Handles({
  sector,
  hasNextSibling,
  onThicknessDown,
  onWeightDown,
}: {
  sector: Sector;
  hasNextSibling: boolean;
  onThicknessDown: (event: React.PointerEvent) => void;
  onWeightDown: (event: React.PointerEvent) => void;
}) {
  const mid = (sector.a0 + sector.a1) / 2;
  const rim = polarPoint(sector.r1, mid);
  const edge = polarPoint((sector.r0 + sector.r1) / 2, sector.a1);

  return (
    <>
      <circle
        cx={rim.x}
        cy={rim.y}
        r={7}
        className="cursor-ns-resize"
        fill="hsl(0 0% 100% / 0.92)"
        stroke="hsl(0 0% 0% / 0.5)"
        strokeWidth={1.5}
        onPointerDown={onThicknessDown}
      >
        <title>Drag outward to lengthen this branch</title>
      </circle>

      {/* Only when there is a neighbour to trade with. Dragging the last edge of
          the last branch would have to take its angle from everybody at once, and
          watching every other boundary move is not what the grip appears to
          promise. */}
      {hasNextSibling ? (
        <circle
          cx={edge.x}
          cy={edge.y}
          r={7}
          className="cursor-ew-resize"
          fill="hsl(0 0% 100% / 0.92)"
          stroke="hsl(0 0% 0% / 0.5)"
          strokeWidth={1.5}
          onPointerDown={onWeightDown}
        >
          <title>Drag around to share width with the next branch</title>
        </circle>
      ) : null}
    </>
  );
}

function polarPoint(r: number, degrees: number) {
  const rad = (degrees * Math.PI) / 180;
  return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
}

/** One ring segment: its fill, its label, and the text you can edit in place. */
function Segment({
  sector,
  node,
  palette,
  selected,
  onSelect,
}: {
  sector: Sector;
  node: CanvasNode;
  palette: MapPalette;
  selected: boolean;
  onSelect: () => void;
}) {
  const ring = insetRing(sector, SEGMENT_PAD);
  const d = sectorPath(ring);
  if (!d) return null;

  const { fill, ink, outline } = radialShade(palette, sector.depth);

  /*
   * A segment's own colour, if it has been given one, otherwise the shade its
   * depth works out to.
   *
   * Not inherited down the branch the way `hue` is. An inherited hue answers
   * "which trunk is this part of", which is what a reader needs from a wheel; an
   * explicit colour answers "I want *this* one this colour", and pushing that
   * onto the children would colour things nobody asked about.
   */
  const custom = node.fill ?? null;
  const gradientId = custom && custom.colors.length > 1 ? `mmfill-${node.id}` : null;
  const ends = custom && gradientId ? gradientEnds(custom.angle) : null;
  const paint = custom ? (gradientId ? `url(#${gradientId})` : custom.colors[0]) : fill;
  const edge = custom ? fillBorder(custom) : outline;
  const label = custom ? fillInk(custom) : ink;
  const size = sector.depth === 1 ? 15 : 12;
  const text = node.emoji ? `${node.emoji} ${node.text}` : node.text;
  const place = labelPlacement(ring, text.length * size * LABEL_FUDGE);

  return (
    <g className="cursor-pointer" onPointerDown={(event) => event.stopPropagation()} onClick={onSelect}>
      {/* Every segment carries its own outline, not only the selected one.

          The padding between segments is a *gap*, and a gap only separates two
          shapes while the thing behind it is a different colour from both. On a
          wheel where each ring is a shade of one hue, neighbouring segments meet
          across a few pixels of backdrop that reads as part of whichever of them
          is darker — so a branch and its child looked like one continuous wedge.

          The colour comes from `radialShade` and is a *darker* shade of the
          segment itself. The first version was a pale line one pixel wide, and
          it was invisible: measured across a real boundary it painted exactly
          one pixel beside a gap seven to nine pixels of dark backdrop wide, so
          the eye read the gap and never the line. Anything chosen against the
          ground has that problem, because the ground is not a constant — see the
          note on `outline`.

          Selection still overrides it with white, which is why this is one
          `stroke` chosen two ways rather than a second path underneath. */}
      {/* The gradient lives beside the path that uses it. SVG allows `defs`
          anywhere, and keeping it here means a segment carries everything it
          needs to draw itself — no registry to keep in step as nodes come and
          go. `objectBoundingBox` is the default, so the ends are fractions of
          this segment's own box rather than of the wheel. */}
      {ends && custom ? (
        <defs>
          <linearGradient id={gradientId!} x1={ends.x1} y1={ends.y1} x2={ends.x2} y2={ends.y2}>
            {custom.colors.map((colour, index) => (
              <stop
                key={index}
                offset={custom.colors.length === 1 ? 0 : index / (custom.colors.length - 1)}
                stopColor={colour}
              />
            ))}
          </linearGradient>
        </defs>
      ) : null}
      <path
        d={d}
        fill={paint}
        stroke={selected ? "hsl(0 0% 100% / 0.9)" : edge}
        strokeWidth={selected ? 2.5 : 1.8}
      />
      {place.orientation === "none" ? null : (
        <text
          x={place.x}
          y={place.y}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(${place.rotation.toFixed(2)} ${place.x.toFixed(2)} ${place.y.toFixed(2)})`}
          fontSize={size}
          fill={label}
          // The segment answers the pointer, not the words on it — otherwise
          // clicking a label is a different act from clicking the branch.
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {text}
        </text>
      )}
    </g>
  );
}
