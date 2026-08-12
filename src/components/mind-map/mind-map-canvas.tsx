"use client";

import type { MindMapType } from "@prisma/client";
import { ChevronDown, ChevronUp, Equal, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { newNodeId, rankScale, seedNodes, type CanvasNode } from "@/lib/mind-map-canvas";
import { isStructured, layoutNodes } from "@/lib/mind-map-layout";
import { mindMapColor, mindMapStyle } from "@/lib/mind-maps";
import { cn } from "@/lib/utils";
import { updateMindMapData } from "@/server/actions/mind-map";

const NODE_WIDTH = 190;
/**
 * Round nodes are sized, not stretched — a circle that grows with its text is
 * an ellipse, and an ellipse is a different notation. Long text wraps inside.
 */
const CIRCLE_SIZE = 150;

const MIN_SCALE = 0.2;
const MAX_SCALE = 3;

/**
 * The map as an endless sheet.
 *
 * Position and magnification are one transform on a single layer — `translate`
 * then `scale` — rather than a scrollable box. That is what makes the plane
 * unbounded: there is no element whose size can run out, so a node drags as far
 * as anyone likes, panning never reaches an edge, and zoom cannot be clamped by
 * a scroll extent with nothing left to give.
 *
 * The first version used a fixed 2400×1400 sheet with scrollbars, and produced
 * exactly those three faults. They arrived as three complaints and were one
 * decision.
 *
 * Saving stays explicit. These are documents people think in, and an autosave
 * firing mid-sentence turns every half-formed idea into something the whole
 * team can see.
 */
export function MindMapCanvas({
  mapId,
  type,
  title,
  initialNodes,
  canEdit,
}: {
  mapId: string;
  type: MindMapType;
  title: string;
  initialNodes: CanvasNode[];
  canEdit: boolean;
}) {
  const router = useRouter();

  const [nodes, setNodes] = React.useState<CanvasNode[]>(() =>
    initialNodes.length ? initialNodes : seedNodes(type, title),
  );
  const [dirty, setDirty] = React.useState(initialNodes.length === 0);
  const [busy, setBusy] = React.useState(false);

  // Ids added since this page loaded. Only these animate in — re-running the
  // entrance for every node on each render would make the map twitch whenever
  // anything at all changed.
  const [fresh, setFresh] = React.useState<Set<string>>(new Set());

  /**
   * View state, never saved: where *this* person is looking, not a property of
   * the map. Two people reading one map at different magnifications is normal;
   * storing it would let one of them move the other's screen.
   */
  const [scale, setScale] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });

  const viewportRef = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef<{ id: string; dx: number; dy: number } | null>(null);
  const panning = React.useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const byId = React.useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const style = mindMapStyle(type);
  const structured = isStructured(type);

  /**
   * For the five structured types the position of a node is computed from the
   * shape, not stored. Dragging is off for them: moving a node in a tree map
   * can only make it a worse tree map, and the arrangement is the one thing the
   * type is for.
   */
  const layout = React.useMemo(
    () => (structured ? layoutNodes(type, nodes) : null),
    [structured, type, nodes],
  );

  const positionOf = React.useCallback(
    (node: CanvasNode) => layout?.get(node.id) ?? { x: node.x, y: node.y },
    [layout],
  );

  // Put the origin — and so the centre node — in the middle of the view on
  // open. A blank sheet whose only node is off screen reads as broken.
  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    setOffset({ x: el.clientWidth / 2, y: el.clientHeight / 2 });
  }, []);

  /** Screen point to map coordinates, undoing the pan and the zoom. */
  function toWorld(event: { clientX: number; clientY: number }) {
    const rect = viewportRef.current?.getBoundingClientRect();
    return {
      x: (event.clientX - (rect?.left ?? 0) - offset.x) / scale,
      y: (event.clientY - (rect?.top ?? 0) - offset.y) / scale,
    };
  }

  function update(id: string, patch: Partial<CanvasNode>) {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    setDirty(true);
  }

  function addChild(parent: CanvasNode, rank: number) {
    // Below-right of its parent, then nudged clear of anything already there —
    // two nodes stacked exactly on top of each other read as one, and the
    // second is only discovered by dragging the first.
    const x = parent.x + 260;
    let y = parent.y + 150;
    while (nodes.some((n) => Math.abs(n.x - x) < 60 && Math.abs(n.y - y) < 50)) {
      y += 110;
    }

    const node: CanvasNode = { id: newNodeId(), text: "", x, y, parentId: parent.id, rank };
    setNodes((prev) => [...prev, node]);
    setFresh((prev) => new Set(prev).add(node.id));
    setDirty(true);
  }

  function remove(id: string) {
    // Children are re-parented to their grandparent rather than deleted with
    // it. Losing a branch because its middle node went is the kind of thing
    // people only notice after they have saved.
    setNodes((prev) => {
      const target = prev.find((n) => n.id === id);
      if (!target || target.parentId === null) return prev;
      return prev
        .filter((n) => n.id !== id)
        .map((n) => (n.parentId === id ? { ...n, parentId: target.parentId } : n));
    });
    setDirty(true);
  }

  function onNodePointerDown(event: React.PointerEvent, node: CanvasNode) {
    if (!canEdit) return;
    if (structured) {
      // Still swallowed, so pressing a node does not pan the sheet underneath.
      event.stopPropagation();
      return;
    }

    // Stopped either way. Returning without stopping was the bug behind a
    // dead add button *twice*: the press bubbled to the viewport, the viewport
    // captured the pointer to pan, and the click that should have followed was
    // delivered somewhere else entirely.
    event.stopPropagation();

    const target = event.target as HTMLElement;
    if (target.closest("button") || target.closest("textarea")) return;

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const point = toWorld(event);
    dragging.current = { id: node.id, dx: point.x - node.x, dy: point.y - node.y };
  }

  /**
   * Anything that is not a node pans the view. The capture is taken on the
   * viewport, so a drag keeps working when the pointer leaves whatever it
   * started on — however far it goes.
   */
  function onViewportPointerDown(event: React.PointerEvent) {
    if (dragging.current) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    panning.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
  }

  function onPointerMove(event: React.PointerEvent) {
    const pan = panning.current;
    if (pan) {
      setOffset({
        x: pan.ox + (event.clientX - pan.x),
        y: pan.oy + (event.clientY - pan.y),
      });
      return;
    }

    const drag = dragging.current;
    if (!drag) return;
    const point = toWorld(event);
    update(drag.id, { x: point.x - drag.dx, y: point.y - drag.dy });
  }

  function endDrag() {
    dragging.current = null;
    panning.current = null;
  }

  /**
   * Wheel zooms about the middle of the view.
   *
   * The world point at the centre of the screen is held fixed and the offset
   * recomputed around it, so the map grows and shrinks in place. Nothing here
   * can be clamped: the offset is a number this component owns outright, not a
   * scroll position a container is free to limit.
   */
  function onWheel(event: React.WheelEvent) {
    const el = viewportRef.current;
    if (!el) return;

    const next = clamp(scale * (event.deltaY > 0 ? 0.9 : 1.1), MIN_SCALE, MAX_SCALE);
    if (next === scale) return;

    const midX = el.clientWidth / 2;
    const midY = el.clientHeight / 2;
    const worldX = (midX - offset.x) / scale;
    const worldY = (midY - offset.y) / scale;

    setOffset({ x: midX - worldX * next, y: midY - worldY * next });
    setScale(next);
  }

  function reset() {
    const el = viewportRef.current;
    setScale(1);
    setOffset({ x: (el?.clientWidth ?? 0) / 2, y: (el?.clientHeight ?? 0) / 2 });
  }

  async function save() {
    setBusy(true);
    try {
      const result = await updateMindMapData({ mapId, data: { nodes } });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setDirty(false);
      setFresh(new Set());
      toast.success("Map saved.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-0 flex-1">
      {/* Floating rather than in a row of its own: on a full-screen canvas the
          pixels belong to the map. */}
      <div className="pointer-events-none absolute right-4 top-4 z-10 flex items-center gap-2">
        {dirty ? (
          <span className="rounded-full border bg-background/90 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur">
            Unsaved changes
          </span>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="pointer-events-auto rounded-full border bg-background/90 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur"
          title="Back to the centre, at 100%"
        >
          {Math.round(scale * 100)}%
        </button>
        {canEdit ? (
          <Button
            className="pointer-events-auto"
            disabled={busy || !dirty}
            onClick={() => void save()}
          >
            Save map
          </Button>
        ) : null}
      </div>

      <div
        ref={viewportRef}
        className="absolute inset-0 cursor-grab overflow-hidden active:cursor-grabbing"
        onPointerDown={onViewportPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        >
          {/* One overflowing SVG for every edge. It has no meaningful size of
              its own; `overflow: visible` is what lets a line reach a node far
              outside whatever box the element happens to occupy. */}
          <svg className="pointer-events-none absolute overflow-visible" aria-hidden="true">
            <defs>
              <marker
                id={`tf-arrow-${type}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0 0 L10 5 L0 10 z" fill={mindMapColor(type, 0.75)} />
              </marker>
            </defs>

            {nodes.map((node) => {
              const parent = node.parentId ? byId.get(node.parentId) : undefined;
              if (!parent) return null;

              const a = positionOf(parent);
              const b = positionOf(node);

              // An elbow leaves its parent downward, turns once, and arrives
              // square-on: the drawing of hierarchy rather than of a link.
              const midY = (a.y + b.y) / 2;
              const d =
                style.edge === "elbow"
                  ? `M ${a.x} ${a.y} V ${midY} H ${b.x} V ${b.y}`
                  : `M ${a.x} ${a.y} L ${b.x} ${b.y}`;

              // Dash lengths are in user units, so the draw-on animation needs
              // the real path length; an elbow is longer than the line between
              // its ends.
              const length =
                style.edge === "elbow"
                  ? Math.abs(midY - a.y) + Math.abs(b.x - a.x) + Math.abs(b.y - midY)
                  : Math.hypot(b.x - a.x, b.y - a.y);

              return (
                <path
                  key={node.id}
                  d={d}
                  fill="none"
                  stroke={mindMapColor(type, 0.5)}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={style.edge === "dashed" ? "7 6" : undefined}
                  markerEnd={style.edge === "arrow" ? `url(#tf-arrow-${type})` : undefined}
                  className={fresh.has(node.id) && style.edge !== "dashed" ? "tf-map-edge" : undefined}
                  style={
                    fresh.has(node.id) && style.edge !== "dashed"
                      ? ({ "--tf-edge-length": `${Math.round(length)}` } as React.CSSProperties)
                      : undefined
                  }
                />
              );
            })}
          </svg>

          {nodes.map((node) => {
            const isCentre = node.parentId === null;
            const point = positionOf(node);
            const round = style.node === "circle";
            // Chosen when the node was made, not inferred from where it sits.
            const shrink = rankScale(node.rank);
            const size = CIRCLE_SIZE * shrink;
            const boxWidth = NODE_WIDTH * shrink;
            return (
              <div
                key={node.id}
                onPointerDown={(event) => onNodePointerDown(event, node)}
                className={cn(
                  "group absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-1 border",
                  round
                    ? "rounded-full p-3 text-center"
                    : style.node === "pill"
                      ? "rounded-full px-5 py-2.5"
                      : "rounded-md px-3 py-2",
                  canEdit && !structured && "cursor-grab active:cursor-grabbing",
                  fresh.has(node.id) && "tf-map-node-in",
                )}
                style={{
                  left: point.x,
                  top: point.y,
                  width: round ? size : boxWidth,
                  height: round ? size : undefined,
                  fontSize: `${Math.max(0.68, shrink) * 100}%`,
                  background: mindMapColor(type, isCentre ? 0.24 : 0.12),
                  borderColor: mindMapColor(type, isCentre ? 0.7 : 0.35),
                  borderWidth: isCentre ? 2 : 1,
                }}
              >
                {style.ring ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "pointer-events-none absolute inset-1.5",
                      round ? "rounded-full" : "rounded",
                    )}
                    style={{ border: `1px solid ${mindMapColor(type, 0.45)}` }}
                  />
                ) : null}

                <textarea
                  value={node.text}
                  readOnly={!canEdit}
                  rows={round ? 3 : 1}
                  placeholder={isCentre ? "Main title" : "…"}
                  onChange={(event) => update(node.id, { text: event.target.value })}
                  className={cn(
                    "w-full resize-none bg-transparent text-center text-[1em] outline-none placeholder:text-muted-foreground",
                    isCentre && "font-semibold",
                  )}
                />

                {canEdit ? (
                  <div className="absolute -right-2 -top-2 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="Add a connected node"
                          className="rounded-full border bg-background p-1 shadow-sm"
                          style={{ borderColor: mindMapColor(type, 0.5) }}
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      {/* Size is asked for at the moment of creation, when the
                          author knows whether this is a heading, a sibling or
                          an aside. Asking later means every new node arrives
                          the same and has to be corrected. */}
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => addChild(node, node.rank + 1)}>
                          <ChevronUp /> Bigger than this
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => addChild(node, node.rank)}>
                          <Equal /> Same size
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => addChild(node, node.rank - 1)}>
                          <ChevronDown /> Smaller than this
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {!isCentre ? (
                      <button
                        type="button"
                        aria-label="Remove this node"
                        onClick={() => remove(node.id)}
                        className="rounded-full border bg-background p-1 shadow-sm"
                        style={{ borderColor: mindMapColor(type, 0.5) }}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
