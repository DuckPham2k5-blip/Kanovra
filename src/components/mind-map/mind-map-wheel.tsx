"use client";

import { MessageSquare, MoreHorizontal, Palette, PlusCircle, Split, Trash2 } from "lucide-react";
import * as React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CanvasNode, RadialSettings } from "@/lib/mind-map-canvas";
import {
  HUB_RADIUS,
  insetRing,
  labelPlacement,
  paddedSectorPath,
  radialLayout,
  radialReach,
  shareBetween,
  shortestTurn,
  type Sector,
} from "@/lib/mind-map-radial";
import type { MapPalette, MapTone } from "@/lib/mind-map-palette";
import { EmojiSubmenu, TextSubmenu } from "@/components/mind-map/mind-map-node-format";
import { fillBorder, fillCss, fillInk, gradientEnds } from "@/lib/mind-map-fill";
import { fontScaleOf, textFaceCss } from "@/lib/mind-map-text";
import { radialShade } from "@/lib/mind-maps";
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

/**
 * Swallows a press so the canvas underneath cannot turn it into a pan — unless it
 * landed on a control, in which case it has somewhere to be.
 *
 * Radix's menu machinery listens on `document`, and React's synthetic
 * `stopPropagation` stops the native event as well, so swallowing a trigger's
 * press leaves the menu open with every row in it unreachable. That was true here
 * and on the box canvas, and it is recorded in CLAUDE.md.
 */
function swallowUnlessControl(event: React.PointerEvent) {
  if ((event.target as HTMLElement).closest("button, textarea, [role='menuitem']")) return;
  event.stopPropagation();
}

const LABEL_FUDGE = 0.56;

/**
 * A coordinate rounded for the DOM.
 *
 * A raw trig result is a full-precision double, and React serialises it into an
 * SVG attribute one way on the server and — a single unit in the last place
 * apart — another on the client, which hydration reports as a mismatch it will
 * not patch. Rounding to hundredths is far finer than a pixel and identical on
 * both sides, so the attribute is the same string wherever it is produced.
 */
const r = (value: number) => Math.round(value * 100) / 100;
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
  center = { x: 0, y: 0 },
  onMoveStart,
  fresh,
}: {
  /** Nodes added since the page loaded — the only ones that animate in. */
  fresh?: Set<string>;
  /** Where this wheel's hub sits in the canvas. One map can hold several. */
  center?: { x: number; y: number };
  /** Begins dragging the whole wheel by its hub. Absent = not movable. */
  onMoveStart?: (rootId: string, event: React.PointerEvent) => void;
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

  /**
   * Delete removes the selected branch — and now the selected hub too, which is
   * how a whole wheel is deleted: click its centre, press Delete. The canvas is
   * what refuses to delete the last remaining root, so this hands every hub to
   * `onRemove` and lets the one rule live in one place.
   *
   * Guarded to *this* wheel: `byId` holds only this wheel's own nodes, and a map
   * can now carry several wheels, each with this same window listener. Without
   * the guard one Delete press would fire every wheel's handler, and the calls
   * after the first would act on a node their wheel does not own. Never while a
   * label is being typed, where Delete and Backspace mean "delete a character".
   */
  React.useEffect(() => {
    if (!canEdit) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      if (!focusedNodeId || !byId.has(focusedNodeId)) return;
      event.preventDefault();
      onRemove(focusedNodeId);
      onFocusNode(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, focusedNodeId, byId, onRemove, onFocusNode]);

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
    <div className="absolute" style={{ left: center.x, top: center.y }}>
      {/* Sized from the drawing rather than fixed, and centred on this wheel's
          own point, so several wheels can share one canvas — each grows outward
          from its own hub exactly as the geometry says. */}
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
            fresh={fresh}
          />

          {canEdit && selectedSector && selectedNode ? (
            <Handles
              sector={selectedSector}
              hasNextSibling={nextSiblingOf(selectedNode, siblingsOf) !== undefined}
              hasPrevSibling={prevSiblingOf(selectedNode, siblingsOf) !== undefined}
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
              onWeightPrevDown={(event) => {
                // The leading edge is the previous sibling's trailing edge, so
                // the drag is the same trade set up from the previous branch's
                // side — it becomes "mine" and the selected one "theirs".
                const prev = prevSiblingOf(selectedNode, siblingsOf);
                const prevSector = prev ? sectors.get(prev.id) : undefined;
                if (!prev || !prevSector) return;
                beginDrag(event, {
                  kind: "weight",
                  id: prev.id,
                  nextId: selectedSector.id,
                  a0: prevSector.a0,
                  combinedSpan:
                    prevSector.a1 - prevSector.a0 + (selectedSector.a1 - selectedSector.a0),
                  combinedWeight: prev.weight + selectedNode.weight,
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
        // A press on the hub *body* drags the whole wheel; a press on a control
        // inside it (the title box, the corner buttons) is left for that control
        // and only swallowed so the viewport underneath does not pan. The blanket
        // stop that used to be here killed every menu row on this map — React
        // attaches at the root and stops the native event too, and Radix's menu
        // listens on `document` — so the press is stopped selectively.
        onPointerDown={(event) => {
          // Only a real button keeps its own press. The title box does not: a
          // press on it starts a pending wheel move that becomes a drag on
          // movement and a plain click otherwise — so the hub is draggable by its
          // whole face, not only the ring around the title, while the title can
          // still be clicked into and typed.
          if ((event.target as HTMLElement).closest("button, [role='menuitem']")) {
            event.stopPropagation();
            return;
          }
          // Select the hub so Delete acts on it — this is what makes "click the
          // centre, press Delete" remove the whole wheel. Selecting on press,
          // before any drag begins, so a plain click (press then release) still
          // leaves the hub selected.
          onFocusNode(root.id);
          if (canEdit && onMoveStart) onMoveStart(root.id, event);
          else event.stopPropagation();
        }}
        className={cn(
          "absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 text-center",
          canEdit && onMoveStart ? "cursor-move" : undefined,
          // A wheel just added pops in the way a box node does — the same
          // keyframe, which restates this element's centring translate.
          fresh?.has(root.id) && "tf-map-node-in",
        )}
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
          // Lit when the hub is the selected node, so it is obvious which wheel a
          // Delete would remove — the hub has no other selected state, and
          // "click then press Delete" needs the click to show it landed.
          boxShadow:
            focusedNodeId === root.id
              ? `0 0 0 3px hsl(${mapHue} 90% 65%), 0 0 20px 3px hsl(${mapHue} 90% 65% / 0.45)`
              : undefined,
          transition: "box-shadow 160ms ease",
        }}
      >
        {/* Centred in the hub. The box is only three-quarters as wide and a
            third as tall, so the ring of hub around it is space to grab and drag
            the wheel — the title sits in the middle without filling it. */}
        <textarea
          value={root.text}
          readOnly={!canEdit}
          maxLength={160}
          rows={2}
          placeholder="Main title"
          onChange={(event) => onUpdate(root.id, { text: event.target.value })}
          className="h-1/3 w-3/4 cursor-text resize-none select-text bg-transparent text-center text-sm font-semibold leading-snug outline-none placeholder:text-muted-foreground"
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
                // Same reason as the hub, and the same exception: a press on a
                // control is left alone so it reaches `document`.
                onPointerDown={swallowUnlessControl}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
                style={{ left: place.x, top: place.y }}
              >
                {/* The label, edited straight on the segment. It was a bordered
                    box with a "Name this branch" prompt floating over the wheel;
                    the owner asked for the box gone — click the segment and a
                    caret blinks in the words themselves. So this is transparent
                    and unadorned, sat exactly where the drawn label is (which is
                    hidden underneath while selected, or the same words would show
                    twice, one going stale as you type), autofocused so the caret
                    is there the moment the segment is picked. White with a shadow
                    rather than the segment's own ink, because it has to stay
                    legible over whatever colour the branch is. A Viewer sees the
                    words but the box is read-only. */}
                {canEdit || node.text ? (
                  <input
                    // Keyed on the segment so switching selection remounts the
                    // box — `autoFocus` only fires on mount, and without this the
                    // caret would not follow to the next branch you click.
                    key={node.id}
                    value={node.text}
                    readOnly={!canEdit}
                    maxLength={120}
                    autoFocus={canEdit}
                    placeholder=""
                    aria-label="Branch text"
                    onChange={(event) => onUpdate(node.id, { text: event.target.value })}
                    className="w-40 select-text bg-transparent text-center text-white caret-white outline-none [text-shadow:_0_1px_3px_rgb(0_0_0/0.75)]"
                    // The branch's own face and size, so editing looks like the
                    // label it becomes. `font-semibold` is dropped from the class
                    // above so `bold` alone decides the weight.
                    style={{ ...textFaceCss(node), fontSize: `${0.9 * fontScaleOf(node)}rem` }}
                  />
                ) : null}

                <div className="flex items-center gap-1">
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
                      {/* Two ways to grow the wheel, both on every segment. "Split
                          into 2/3/4/5" was here and the owner asked for it gone —
                          picking a number up front is a decision the drawing
                          should not demand. A branch beside adds a sibling in the
                          same ring; a branch outward adds a child in the next ring
                          out, one at a time, which is what split-into-1 is. */}
                      <DropdownMenuItem onSelect={() => onAddBranch(node)}>
                        <PlusCircle /> Add a branch beside this
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onSplit(node, 1)}>
                        <Split /> Add a branch outward from this
                      </DropdownMenuItem>

                      {/* Size is not here. A branch is made wider by dragging
                          the boundary it shares with its neighbour and longer by
                          dragging its outer rim, and both grips are on the
                          drawing. */}

                      <DropdownMenuSeparator />
                      {/* The same Word-style controls and folded emoji as the box
                          menu, so a branch is styled and marked exactly as a box
                          node is. */}
                      <TextSubmenu node={node} onChange={(patch) => onUpdate(node.id, patch)} />
                      <EmojiSubmenu
                        emoji={node.emoji}
                        onPick={(glyph) => onUpdate(node.id, { emoji: glyph })}
                      />

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

/** The branch drawn immediately before this one — the neighbour on the leading edge. */
function prevSiblingOf(node: CanvasNode, siblingsOf: (id: string) => CanvasNode[]) {
  const siblings = siblingsOf(node.id);
  const index = siblings.findIndex((s) => s.id === node.id);
  return index > 0 ? siblings[index - 1] : undefined;
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
  fresh,
}: {
  ordered: Sector[];
  byId: Map<string, CanvasNode>;
  hueOf: (id: string) => number;
  /** The map's tone. A node may override the hue; the tone is the map's. */
  tone: MapTone;
  focusedNodeId: string | null;
  onFocusNode: (id: string | null) => void;
  fresh?: Set<string>;
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
            isNew={fresh?.has(sector.id) ?? false}
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
  hasPrevSibling,
  onThicknessDown,
  onWeightDown,
  onWeightPrevDown,
}: {
  sector: Sector;
  hasNextSibling: boolean;
  hasPrevSibling: boolean;
  onThicknessDown: (event: React.PointerEvent) => void;
  onWeightDown: (event: React.PointerEvent) => void;
  onWeightPrevDown: (event: React.PointerEvent) => void;
}) {
  const mid = (sector.a0 + sector.a1) / 2;
  const rim = polarPoint(sector.r1, mid);
  const trailing = polarPoint((sector.r0 + sector.r1) / 2, sector.a1);
  const leading = polarPoint((sector.r0 + sector.r1) / 2, sector.a0);

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

      {/* A width grip on each boundary the branch shares with a neighbour, so
          every branch has one — the last branch, which has no *next* sibling,
          still has a *previous* one to trade with. The one edge that is never a
          grip is the seam at the wheel's start angle: it is fixed, and turned by
          dragging the hub rather than traded between two branches. */}
      {hasPrevSibling ? (
        <circle
          cx={leading.x}
          cy={leading.y}
          r={7}
          className="cursor-ew-resize"
          fill="hsl(0 0% 100% / 0.92)"
          stroke="hsl(0 0% 0% / 0.5)"
          strokeWidth={1.5}
          onPointerDown={onWeightPrevDown}
        >
          <title>Drag around to share width with the branch before this</title>
        </circle>
      ) : null}

      {hasNextSibling ? (
        <circle
          cx={trailing.x}
          cy={trailing.y}
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
  isNew,
}: {
  sector: Sector;
  node: CanvasNode;
  palette: MapPalette;
  selected: boolean;
  onSelect: () => void;
  /** Added since the page loaded, so it grows out from the hub as it arrives. */
  isNew: boolean;
}) {
  // `ring` still places the label and the emoji; the outline itself is drawn
  // with a constant-width gap on every side, so every slot on the wheel matches.
  const ring = insetRing(sector, SEGMENT_PAD);
  const d = paddedSectorPath(sector, SEGMENT_PAD);
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
  // The branch's chosen size folded into the base, so the fit calc below and the
  // drawn `fontSize` agree — a bigger label reserves the room it needs.
  const size = (sector.depth === 1 ? 15 : 12) * fontScaleOf(node);
  const text = node.text;
  const place = labelPlacement(ring, text.length * size * LABEL_FUDGE);

  /*
   * The emoji sits at the segment's outer corner, upright, not in the flow of
   * the label — an emoji rotated along an arc and squeezed between the words is
   * a smudge, and it drifts as the text changes. A fixed spot near the leading
   * edge of the rim reads as a mark *on* the branch. The angular inset is a
   * fixed arc distance turned into degrees, so it stays a constant gap from the
   * edge whether the ring is near the hub or far out.
   */
  const emojiAt = node.emoji
    ? polarPoint(ring.r1 - 13, ring.a0 + (13 / Math.max(1, ring.r1)) * (180 / Math.PI))
    : null;

  return (
    <g
      className={cn("cursor-pointer", isNew && "tf-wheel-seg-in")}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onSelect}
    >
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
      {/* Hidden while selected: the editable input in the furniture sits over
          this exact point, and a stale SVG copy of the text underneath it reads
          as a rendering fault the moment you start typing. */}
      {selected || place.orientation === "none" ? null : (
        <text
          x={r(place.x)}
          y={r(place.y)}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(${place.rotation.toFixed(2)} ${place.x.toFixed(2)} ${place.y.toFixed(2)})`}
          fontSize={size}
          fill={label}
          // The branch's face — bold, italic, underline, font — on the drawn
          // label. The segment answers the pointer, not the words on it, or
          // clicking a label would be a different act from clicking the branch.
          style={{ ...textFaceCss(node), pointerEvents: "none", userSelect: "none" }}
        >
          {text}
        </text>
      )}

      {/* The emoji, upright at the outer corner, on a small disc. Shown even
          while selected — it is a mark on the branch, not the editable label, so
          it stays put when the text turns into an input. The disc is the point
          of this: an emoji straight on a segment fill is hard to pick out, and a
          plain dark circle behind it gives it a consistent ground whatever
          colour the branch is. */}
      {node.emoji && emojiAt ? (
        <>
          <circle
            cx={r(emojiAt.x)}
            cy={r(emojiAt.y)}
            r={13}
            fill="hsl(222 47% 11% / 0.82)"
            stroke="hsl(0 0% 100% / 0.35)"
            strokeWidth={1}
            style={{ pointerEvents: "none" }}
          />
          <text
            x={r(emojiAt.x)}
            y={r(emojiAt.y)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={16}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {node.emoji}
          </text>
        </>
      ) : null}
    </g>
  );
}
