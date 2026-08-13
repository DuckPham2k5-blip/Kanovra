"use client";

import { MessageSquare, MinusCircle, MoreHorizontal, PlusCircle, Split, Trash2 } from "lucide-react";
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
  type Sector,
} from "@/lib/mind-map-radial";
import { NODE_EMOJI, NODE_HUES, radialShade } from "@/lib/mind-maps";
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
  hue: mapHue,
  onUpdate,
  onSplit,
  onAddBranch,
  onRemove,
  onReweight,
  onResize,
  onRotate,
  onOpenThread,
  onFocusNode,
  focusedNodeId,
}: {
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
  hue: number;
  onUpdate: (id: string, patch: Partial<CanvasNode>) => void;
  onSplit: (node: CanvasNode, count: number) => void;
  onAddBranch: (beside: CanvasNode) => void;
  onRemove: (id: string) => void;
  onReweight: (id: string, factor: number) => void;
  onResize: (id: string, delta: number) => void;
  onRotate: (degrees: number) => void;
  onOpenThread: (id: string) => void;
  onFocusNode: (id: string | null) => void;
  focusedNodeId: string | null;
}) {
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

  if (!root) return null;

  return (
    <div className="absolute left-0 top-0">
      {/* Sized from the drawing rather than fixed, and centred on the origin, so
          the wheel grows outward from the middle exactly as the geometry says. */}
      <svg
        className="absolute overflow-visible"
        style={{ left: -(reach + 40), top: -(reach + 40) }}
        width={(reach + 40) * 2}
        height={(reach + 40) * 2}
        viewBox={`${-(reach + 40)} ${-(reach + 40)} ${(reach + 40) * 2} ${(reach + 40) * 2}`}
      >
        {ordered.map((sector) => {
          const node = byId.get(sector.id);
          if (!node || sector.depth === 0) return null;
          return (
            <Segment
              key={sector.id}
              sector={sector}
              node={node}
              hue={hueOf(sector.id)}
              selected={focusedNodeId === sector.id}
              onSelect={() => onFocusNode(sector.id)}
            />
          );
        })}
      </svg>

      {/* The hub is real HTML, not SVG: it holds an editable title, and a
          `foreignObject` inside SVG behaves differently enough across browsers to
          be a poor place for the one control every map has. */}
      <div
        className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-center"
        style={{
          left: 0,
          top: 0,
          width: HUB_RADIUS * 2,
          height: HUB_RADIUS * 2,
          background: `hsl(${mapHue} 60% 16%)`,
          borderColor: `hsl(${mapHue} 85% 62%)`,
        }}
      >
        <textarea
          value={root.text}
          readOnly={!canEdit}
          maxLength={160}
          placeholder="Main title"
          onChange={(event) => onUpdate(root.id, { text: event.target.value })}
          className="h-2/3 w-3/4 resize-none bg-transparent text-center text-sm font-semibold leading-snug outline-none placeholder:text-muted-foreground"
        />

        {canEdit && mounted ? (
          <div className="absolute -right-1 -top-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Add a branch"
                  className="rounded-full border bg-background p-1 shadow-sm"
                  style={{ borderColor: `hsl(${mapHue} 85% 62%)` }}
                >
                  <PlusCircle className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Wheel</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onAddBranch(root)}>
                  <PlusCircle /> Add a branch
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onRotate(-15)}>Rotate left 15°</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onRotate(15)}>Rotate right 15°</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
                        <DropdownMenuItem key={count} onClick={() => onSplit(node, count)}>
                          <Split /> Into {count}
                        </DropdownMenuItem>
                      ))}

                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onAddBranch(node)}>
                        <PlusCircle /> Add a branch beside this
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Size</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => onReweight(node.id, 1.35)}>
                        <PlusCircle /> Wider
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onReweight(node.id, 1 / 1.35)}>
                        <MinusCircle /> Narrower
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onResize(node.id, 40)}>
                        <PlusCircle /> Longer
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onResize(node.id, -40)}>
                        <MinusCircle /> Shorter
                      </DropdownMenuItem>

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
                      <DropdownMenuLabel>Colour</DropdownMenuLabel>
                      <div className="flex flex-wrap gap-1 px-1.5 pb-1">
                        <button
                          type="button"
                          aria-label="Inherit from the branch"
                          title="Inherit"
                          onClick={() => onUpdate(node.id, { hue: null })}
                          className={cn(
                            "size-5 rounded-full border-2",
                            node.hue === null || node.hue === undefined
                              ? "ring-2 ring-ring ring-offset-1 ring-offset-popover"
                              : undefined,
                          )}
                          style={{ borderColor: `hsl(${mapHue} 88% 60%)` }}
                        />
                        {NODE_HUES.map(({ hue, label }) => (
                          <button
                            key={hue}
                            type="button"
                            aria-label={label}
                            title={label}
                            onClick={() => onUpdate(node.id, { hue })}
                            className={cn(
                              "size-5 rounded-full border-2",
                              node.hue === hue
                                ? "ring-2 ring-ring ring-offset-1 ring-offset-popover"
                                : undefined,
                            )}
                            style={{ borderColor: `hsl(${hue} 88% 60%)` }}
                          />
                        ))}
                      </div>

                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => onRemove(node.id)}>
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

/** One ring segment: its fill, its label, and the text you can edit in place. */
function Segment({
  sector,
  node,
  hue,
  selected,
  onSelect,
}: {
  sector: Sector;
  node: CanvasNode;
  hue: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const ring = insetRing(sector, SEGMENT_PAD);
  const d = sectorPath(ring);
  if (!d) return null;

  const { fill, ink } = radialShade(hue, sector.depth);
  const size = sector.depth === 1 ? 15 : 12;
  const text = node.emoji ? `${node.emoji} ${node.text}` : node.text;
  const place = labelPlacement(ring, text.length * size * LABEL_FUDGE);

  return (
    <g className="cursor-pointer" onPointerDown={(event) => event.stopPropagation()} onClick={onSelect}>
      <path
        d={d}
        fill={fill}
        stroke={selected ? "hsl(0 0% 100% / 0.9)" : "transparent"}
        strokeWidth={selected ? 2.5 : 0}
      />
      {place.orientation === "none" ? null : (
        <text
          x={place.x}
          y={place.y}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(${place.rotation.toFixed(2)} ${place.x.toFixed(2)} ${place.y.toFixed(2)})`}
          fontSize={size}
          fill={ink}
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
