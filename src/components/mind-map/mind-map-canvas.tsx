"use client";

import { MindMapType } from "@prisma/client";
import {
  Maximize2,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import {
  MindMapNodeComments,
  type NodeComment,
} from "@/components/mind-map/mind-map-node-comments";
import { UserAvatar, type AvatarUser } from "@/components/shared/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MindMapWheel } from "@/components/mind-map/mind-map-wheel";
import {
  DEFAULT_KIND,
  DEFAULT_WEIGHT,
  clampRank,
  newNodeId,
  nodeSize,
  rankFromRatio,
  rankScale,
  seedNodes,
  type CanvasNode,
  type RadialSettings,
} from "@/lib/mind-map-canvas";
import { RING_THICKNESS } from "@/lib/mind-map-radial";
import {
  edgeAxis,
  pathFromPoints,
  pathLength,
  routeEdge,
  trimStraight,
  type Rect,
} from "@/lib/mind-map-edges";
import { isStructured, layoutNodes } from "@/lib/mind-map-layout";
import { notationFor, replacesEdges } from "@/lib/mind-map-notation";
import { setPresenceFocus, useFocusGroups } from "@/lib/presence";
import {
  MIND_MAP_META,
  mindMapColor,
  mindMapStyle,
  nodeBorderColor,
  NODE_EMOJI,
  NODE_HUES,
} from "@/lib/mind-maps";
import { cn, colorFromString } from "@/lib/utils";
import { updateMindMapData } from "@/server/actions/mind-map";

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
 * Saving is automatic, a second or so after the typing stops. It used to be
 * explicit, on the reasoning that these are documents people think in and an
 * autosave firing mid-sentence turns every half-formed idea into something the
 * whole team can see. That reasoning still holds; it was outweighed by the
 * failure at the other end, which is a map whose work is gone because nobody
 * pressed a button. See `save` for what the change costs when two people are on
 * one map at once.
 */
export function MindMapCanvas({
  mapId,
  type,
  title,
  initialNodes,
  initialRadial,
  canEdit,
  canComment,
  comments,
  members,
}: {
  mapId: string;
  type: MindMapType;
  title: string;
  initialNodes: CanvasNode[];
  initialRadial: RadialSettings;
  canEdit: boolean;
  canComment: boolean;
  comments: NodeComment[];
  members: AvatarUser[];
}) {
  const router = useRouter();

  const [nodes, setNodes] = React.useState<CanvasNode[]>(() =>
    initialNodes.length ? initialNodes : seedNodes(type, title),
  );
  const [dirty, setDirty] = React.useState(initialNodes.length === 0);
  const [busy, setBusy] = React.useState(false);

  /**
   * Where a radial map's wheel starts and how much of the circle it uses.
   *
   * Part of the document, not of the view: rotating the wheel changes which
   * branch sits at the top, and that is an arrangement somebody chose. Pan and
   * zoom stay per-viewer for the opposite reason — they are where *this* person
   * is looking.
   */
  const [radial, setRadial] = React.useState<RadialSettings>(initialRadial);
  const isRadial = type === MindMapType.CIRCLE;

  // Gates the per-node menus. See the note at the trigger: Radix's `useId`
  // counter drifts between the server render and hydration on a page with many
  // triggers, and a canvas is nothing but many triggers.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  /** Which node's comments are on screen. One panel, not one per node. */
  const [openThread, setOpenThread] = React.useState<string | null>(null);

  /**
   * Whichever node this person is working on, on either drawing.
   *
   * On a wheel it decides which segment carries the furniture: a wheel has
   * nowhere to hang per-segment controls the way a box has corners, and a menu
   * trigger on every segment would be a wheel's worth of Radix `useId` counters —
   * the exact shape that made the node menus warn.
   *
   * On the box canvas it does two further things: it lights the ring that tells
   * the rest of the team where you are, and it is what Delete, `+` and `-` act
   * on. One piece of state for both, because it is one idea — the thing you have
   * hold of — and two would drift the first time only one of them was cleared.
   */
  const [selected, setSelected] = React.useState<string | null>(null);

  /**
   * Who else is on which node.
   *
   * Reported as an opaque scope on the ordinary presence heartbeat, so being
   * *on a node* decays exactly the way being *in the workspace* does — a
   * browser that crashes never says it left, and an avatar that only
   * disappears when told to would sit on that node until someone reloaded.
   */
  const watchers = useFocusGroups(`map:${mapId}:`);

  /**
   * The same watchers, most recently arrived first.
   *
   * Presence reports who is on a node and says nothing about when they got
   * there — the server keeps one `focus` string per person, not a history — so
   * the order has to be remembered here, by noticing who is new since the last
   * time this ran. Newcomers go to the front; anyone still present keeps the
   * place they had.
   *
   * That is what makes the name in a shared ring belong to whoever pressed most
   * recently. And because `useFocusGroups` already leaves you out of its own
   * answer, your arriving on a node somebody else is holding cannot displace
   * their name: you were never in this list to push them down it.
   *
   * Writing to the ref from a memo is deliberate and safe: run twice on the same
   * input — which Strict Mode does — the second pass finds every id already
   * known, so it prepends nothing and preserves the order the first pass built.
   */
  const arrivals = React.useRef<Map<string, string[]>>(new Map());
  const watchersByRecency = React.useMemo(() => {
    const out = new Map<string, string[]>();
    for (const [nodeId, here] of watchers) {
      const before = arrivals.current.get(nodeId) ?? [];
      out.set(nodeId, [
        ...here.filter((id) => !before.includes(id)),
        ...before.filter((id) => here.includes(id)),
      ]);
    }
    arrivals.current = out;
    return out;
  }, [watchers]);

  const commentCounts = React.useMemo(() => {
    const out = new Map<string, number>();
    for (const comment of comments) {
      out.set(comment.nodeId, (out.get(comment.nodeId) ?? 0) + 1);
    }
    return out;
  }, [comments]);

  const memberById = React.useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members],
  );

  /**
   * The avatars of whoever else is on a node.
   *
   * One function serving both drawings. Written twice, the box canvas and the
   * wheel would eventually show presence differently, and the version nobody was
   * looking at would be the one that broke.
   */
  const renderWatchers = React.useCallback(
    (nodeId: string) => {
      const here = (watchersByRecency.get(nodeId) ?? [])
        .map((id) => memberById.get(id))
        .filter((member): member is AvatarUser => !!member);
      if (!here.length) return null;

      return (
        <span className="pointer-events-none flex -space-x-1.5">
          {here.slice(0, 3).map((member) => (
            <UserAvatar
              key={member.id}
              user={member}
              showTooltip={false}
              className="size-5 ring-2 ring-background"
            />
          ))}
          {here.length > 3 ? (
            <span className="flex size-5 items-center justify-center rounded-full bg-accent text-[9px] font-semibold ring-2 ring-background">
              +{here.length - 3}
            </span>
          ) : null}
          <span className="sr-only">
            {here.map((member) => member.name).join(", ")} looking at this
          </span>
        </span>
      );
    },
    [memberById, watchersByRecency],
  );

  /**
   * The lit ring round a node, built as a stack of box-shadows.
   *
   * Yours is white, and everyone else's is the colour their avatar already falls
   * back to (`colorFromString`), so a person is the same colour here as they are
   * anywhere else in the app without a colour ever being stored for them.
   *
   * Rings stack outward by growing the spread, and CSS paints the first shadow
   * in the list on top — so the list runs innermost first and nobody's ring is
   * hidden behind somebody else's. The white one takes a dark hairline under it,
   * because white on the light theme is otherwise a ring you cannot see, and the
   * point of the ring is being seen.
   */
  const ringFor = React.useCallback(
    (nodeId: string, mine: boolean) => {
      const here = watchersByRecency.get(nodeId) ?? [];
      if (!mine && !here.length) return undefined;

      const rings: string[] = [];
      let spread = 2;

      if (mine) {
        rings.push(`0 0 0 ${spread + 1}px rgba(0, 0, 0, 0.28)`);
        rings.push(`0 0 0 ${spread}px var(--tf-ring-self)`);
        spread += 4;
      }
      for (const id of here) {
        rings.push(`0 0 0 ${spread}px ${colorFromString(id)}`);
        spread += 4;
      }

      // The bloom that makes it read as lit rather than as one more border.
      const glow = mine ? "var(--tf-ring-self)" : colorFromString(here[0]);
      rings.push(`0 0 ${spread * 2}px ${Math.round(spread / 2)}px ${glow}`);
      return rings.join(", ");
    },
    [watchersByRecency],
  );

  /**
   * Who is on a node, most recent first, as a plain string for a `title`.
   *
   * A native tooltip rather than a Radix one: this is a hover hint per node on a
   * canvas of arbitrarily many, which is the exact shape that turns Radix's
   * `useId` counter into a page of hydration warnings here.
   */
  const watcherNames = React.useCallback(
    (nodeId: string) =>
      (watchersByRecency.get(nodeId) ?? [])
        .map((id) => memberById.get(id)?.name)
        .filter(Boolean)
        .join(", "),
    [memberById, watchersByRecency],
  );

  /**
   * Which nodes exist in the *saved* map, which is not the same as which nodes
   * are on screen.
   *
   * A comment is a row keyed by a node id, and the server checks that the id is
   * really in the map before writing one — otherwise a comment can be attached
   * to something that has never existed and sits in the table unreachable. So a
   * node that has only been drawn, never saved, cannot be commented on yet, and
   * the control is absent rather than present and failing. Derived from the prop,
   * so it catches up by itself on the refresh that follows a save.
   */
  const savedIds = React.useMemo(
    () => new Set(initialNodes.map((node) => node.id)),
    [initialNodes],
  );

  // Leaving the page must clear the focus, or the last node touched keeps an
  // avatar on it for whoever is still reading.
  React.useEffect(() => () => setPresenceFocus(null), []);

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
  /**
   * A resize in progress: which node, the rank it had when the press landed, how
   * far the pointer was from its centre then, and where that centre was.
   *
   * The centre is *frozen* at the press rather than read again each move. On the
   * structured types the layout is computed from the nodes, so growing one shifts
   * it — and measuring against a centre that moves because of the very change
   * being measured is a feedback loop, which is how a drag ends up running away
   * from the pointer. Frozen, the response stays monotonic: further out is always
   * bigger, by the proportion the pointer actually travelled.
   */
  const resizing = React.useRef<{
    id: string;
    rank: number;
    distance: number;
    cx: number;
    cy: number;
  } | null>(null);

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

  /** Every node as the box it actually occupies — what the router steers around. */
  const rects = React.useMemo(() => {
    const out = new Map<string, Rect>();
    for (const node of nodes) {
      const point = positionOf(node);
      const { w, h } = nodeSize(type, node.rank);
      out.set(node.id, { x: point.x, y: point.y, w, h });
    }
    return out;
  }, [nodes, positionOf, type]);

  /**
   * The edges, routed once per change rather than per frame.
   *
   * Structured maps get orthogonal routes that go round whatever is in the way;
   * the three free canvases get a straight line trimmed to both boundaries,
   * because bending an association into right angles claims a structure a bubble
   * map does not have. Either way the line now stops at the edge of a node
   * instead of running under it — which is also what makes an arrowhead visible,
   * since one drawn at the target's centre is behind the target.
   */
  /**
   * The marks that make a type look like itself — a brace map's bracket, a
   * bridge map's line, a circle map's ring and frame. For those three the mark
   * *is* the connection, so the per-edge routes are not drawn at all: a bracket
   * with lines through it reads as a mistake rather than as either notation.
   */
  const marks = React.useMemo(() => notationFor(type, nodes, rects), [type, nodes, rects]);
  const markedOnly = replacesEdges(type);

  const routes = React.useMemo(() => {
    if (markedOnly) return [];

    const all = [...rects.entries()];
    const out: { id: string; d: string; length: number }[] = [];

    for (const node of nodes) {
      if (!node.parentId) continue;
      const from = rects.get(node.parentId);
      const to = rects.get(node.id);
      if (!from || !to) continue;

      /*
       * A flow map's explanations hang *below* their step, so their connector
       * leaves the bottom edge and not the side. Everything else on that map runs
       * along the sequence, which is horizontal.
       *
       * Decided per edge rather than per type because a flow map is the one type
       * with two kinds of connection in it — the arrow that means "and then" and
       * the stub that means "about this". Handing the whole map to `edgeAxis` to
       * work that out was tried once for the bridge map and is what got that
       * signature simplified back again; the node already knows which it is.
       */
      const axis =
        type === MindMapType.FLOW && node.kind === "note" ? "v" : edgeAxis(type);
      if (axis === "free") {
        const [a, b] = trimStraight(from, to, style.node === "circle");
        out.push({
          id: node.id,
          d: pathFromPoints([a, b]),
          length: Math.hypot(b.x - a.x, b.y - a.y),
        });
        continue;
      }

      const obstacles = all
        .filter(([id]) => id !== node.id && id !== node.parentId)
        .map(([, rect]) => rect);
      const points = routeEdge(from, to, axis, obstacles);

      /*
       * On a multi-flow map the arrowhead marks what came *later*, and on the
       * cause side that is the parent, not the child.
       *
       * Drawn parent-to-child throughout, every arrow pointed away from the
       * event — so the left half of the map read as "the outage caused the bad
       * deploy". Backwards, and backwards in the one type whose entire purpose is
       * direction. Found by rendering the five layouts and looking at them; no
       * test would have caught it, because the geometry was right and only the
       * meaning was wrong.
       */
      const causeSide = type === MindMapType.MULTI_FLOW && to.x < from.x;
      const drawn = causeSide ? [...points].reverse() : points;

      out.push({ id: node.id, d: pathFromPoints(drawn), length: pathLength(drawn) });
    }

    return out;
  }, [markedOnly, nodes, rects, style.node, type]);

  // Put the origin — and so the centre node — in the middle of the view on
  // open. A blank sheet whose only node is off screen reads as broken.
  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    setOffset({ x: el.clientWidth / 2, y: el.clientHeight / 2 });
  }, []);

  /**
   * Gives a multi-flow map coordinates the first time it is opened as a free
   * canvas.
   *
   * Its positions used to be computed on every render and never stored, so every
   * node on an existing one still holds the `x: 0, y: 0` it was created with.
   * Simply switching the type to free would stack the whole map on the origin,
   * which reads as the map having been wiped. Seeding from the arrangement it
   * used to draw means it opens looking exactly as it did before, and is
   * draggable from there.
   *
   * Runs once, and only when *every* node is still at the origin — anything else
   * is an arrangement somebody made, including one they made by dragging
   * everything into a pile.
   */
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (seeded.current || type !== MindMapType.MULTI_FLOW || !canEdit) return;
    if (nodes.length < 2 || nodes.some((node) => node.x !== 0 || node.y !== 0)) return;

    const arrangement = layoutNodes(MindMapType.MULTI_FLOW, nodes);
    if (!arrangement.size) return;

    seeded.current = true;
    setNodes((prev) =>
      prev.map((node) => {
        const at = arrangement.get(node.id);
        return at ? { ...node, x: at.x, y: at.y } : node;
      }),
    );
    setDirty(true);
  }, [canEdit, nodes, type]);

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

  function addChild(pressed: CanvasNode, rank: number, kind: CanvasNode["kind"] = DEFAULT_KIND) {
    /*
     * An explanation joins the bottom of the column already hanging off this
     * step, rather than becoming a second child of the step itself.
     *
     * Two notes sharing a parent means two connectors leaving the same edge, and
     * the router has to take the second one out and around the first — which
     * draws a line looping into the box from the side for no reason a reader can
     * see. Found by rendering a flow map with two explanations on one step and
     * looking at it. Chained, each connector is a short hop straight down, which
     * is also how the sketch this was built from draws them.
     */
    let parent = pressed;
    if (kind === "note") {
      for (let guard = 0; guard < 200; guard += 1) {
        const next = nodes.find((n) => n.parentId === parent.id && n.kind === "note");
        if (!next) break;
        parent = next;
      }
    }

    // Below-right of its parent, then nudged clear of anything already there —
    // two nodes stacked exactly on top of each other read as one, and the
    // second is only discovered by dragging the first.
    //
    // Clearance is measured against both boxes rather than a fixed 60×50, which
    // let a large node land on top of a small one and still count as clear.
    const box = nodeSize(type, rank);
    const x = parent.x + nodeSize(type, parent.rank).w / 2 + 70 + box.w / 2;
    let y = parent.y + 150;
    while (
      nodes.some((n) => {
        const other = nodeSize(type, n.rank);
        return (
          Math.abs(n.x - x) < (other.w + box.w) / 2 && Math.abs(n.y - y) < (other.h + box.h) / 2
        );
      })
    ) {
      y += box.h + 40;
    }

    const node: CanvasNode = {
      id: newNodeId(),
      text: "",
      x,
      y,
      parentId: parent.id,
      rank,
      kind,
      weight: DEFAULT_WEIGHT,
      thickness: RING_THICKNESS,
    };
    setNodes((prev) => [...prev, node]);
    setFresh((prev) => new Set(prev).add(node.id));
    setDirty(true);
  }

  /**
   * Makes an existing node a step bigger or smaller.
   *
   * This did not exist at all until somebody went looking for it. Size was chosen
   * once, when the node was made, and never again — so the only thing on the menu
   * that mentioned size was the *add* menu, whose three options describe the child
   * about to be created. Read as "change this node's size", clicked, and nothing
   * about that node changes: the button looks broken when it is in fact a
   * different button.
   *
   * Clamped to the range the schema accepts, so a long press on "bigger" cannot
   * write a node the parser will later reject.
   *
   * It has left the `…` menu, where it read as clutter beside a grip that does
   * the same job with one gesture. It stays here because a drag is a mouse and
   * only a mouse: `+` and `-` on a selected node are the whole of the keyboard
   * route, and without them somebody who cannot use a pointer could not resize a
   * node at all — a worse bug than the one that started this, and a silent one.
   */
  const resizeNode = React.useCallback((id: string, step: number) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, rank: clampRank(n.rank + step) } : n)),
    );
    setDirty(true);
  }, []);

  const remove = React.useCallback((id: string) => {
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
  }, []);

  /**
   * The keyboard, on whichever node is selected: Delete removes it, `+` and `-`
   * resize it.
   *
   * On `window` rather than on the viewport, because the viewport only receives
   * keys while it holds focus and clicking a node puts focus in that node's
   * textarea — so a listener there would answer for every node except the one
   * somebody just clicked.
   *
   * Which is also the hazard: any key press aimed at a text field has to be left
   * alone, or typing a `-` into a label silently shrinks the box it is being
   * typed into, and Delete eats the node instead of a character. The guard is on
   * the event's own target, so it holds for the map title and the comment box
   * too, not just for node labels.
   */
  React.useEffect(() => {
    if (!canEdit || !selected) return;

    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!selected) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        remove(selected);
        setSelected(null);
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        resizeNode(selected, 1);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        resizeNode(selected, -1);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, selected, remove, resizeNode]);

  /**
   * Splits a branch into `count` narrower ones.
   *
   * Each child arrives with weight 1, so they divide their parent evenly and the
   * parent's own angle does not change — which is the point. Splitting is meant
   * to be a statement about the branch's contents, not a resize of the wheel, and
   * it is the operation the whole share-based model exists to make safe.
   */
  function splitInto(parent: CanvasNode, count: number) {
    const made: CanvasNode[] = [];
    for (let i = 0; i < count; i += 1) {
      made.push({
        id: newNodeId(),
        text: "",
        x: 0,
        y: 0,
        parentId: parent.id,
        rank: 0,
        kind: DEFAULT_KIND,
        weight: 1,
        thickness: RING_THICKNESS,
      });
    }
    setNodes((prev) => [...prev, ...made]);
    setFresh((prev) => {
      const next = new Set(prev);
      for (const node of made) next.add(node.id);
      return next;
    });
    setDirty(true);
  }

  /**
   * Adds a branch beside this one — or a first branch, when called on the hub.
   *
   * Weight 1 means the newcomer takes an equal share and every sibling narrows to
   * make room. That is the honest behaviour for a wheel whose total is fixed: the
   * alternative, growing the sweep, silently rotates work somebody has already
   * arranged.
   */
  function addBranch(beside: CanvasNode) {
    const parentId = beside.parentId ?? beside.id;
    const node: CanvasNode = {
      id: newNodeId(),
      text: "",
      x: 0,
      y: 0,
      parentId,
      rank: 0,
      kind: DEFAULT_KIND,
      weight: 1,
      thickness: RING_THICKNESS,
    };
    setNodes((prev) => [...prev, node]);
    setFresh((prev) => new Set(prev).add(node.id));
    setDirty(true);
  }

  /** Wider or narrower, as a proportion of what it already has. */
  function reweight(id: string, factor: number) {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, weight: clamp(n.weight * factor, 0.05, 200) } : n,
      ),
    );
    setDirty(true);
  }

  /** Longer or shorter, in pixels. */
  function resize(id: string, delta: number) {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, thickness: clamp(n.thickness + delta, 24, 2000) } : n)),
    );
    setDirty(true);
  }

  /** Thickness set outright, for a drag that already knows the answer. */
  function setThickness(id: string, px: number) {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, thickness: clamp(px, 24, 2000) } : n)),
    );
    setDirty(true);
  }

  /**
   * Several weights at once.
   *
   * One call rather than two, because moving a boundary is a single fact about a
   * pair of neighbours. Applied as two separate updates, the frame between them
   * has a total that matches neither state and the shared edge visibly twitches.
   */
  function setWeights(updates: { id: string; weight: number }[]) {
    const byUpdate = new Map(updates.map((u) => [u.id, u.weight]));
    setNodes((prev) =>
      prev.map((n) => {
        const weight = byUpdate.get(n.id);
        return weight === undefined ? n : { ...n, weight: clamp(weight, 0.05, 200) };
      }),
    );
    setDirty(true);
  }

  /** The branches sharing a parent with this one, in the order they are drawn. */
  const siblingsOf = React.useCallback(
    (id: string) => {
      const node = nodes.find((n) => n.id === id);
      if (!node) return [];
      return nodes.filter((n) => n.parentId === node.parentId && n.parentId !== null);
    },
    [nodes],
  );

  function onNodePointerDown(event: React.PointerEvent, node: CanvasNode) {
    /*
     * Swallowed first, before any other question is asked.
     *
     * Returning without stopping was the bug behind a dead add button *three*
     * times: the press bubbles to the viewport, the viewport captures the pointer
     * to pan, and the click that should have followed is delivered somewhere else
     * entirely. The third time was this very early return — a reader with no edit
     * permission still has a comment button on a node, and for them the press was
     * never stopped, so that button did nothing at all. Whether the press goes on
     * to start a drag is a separate decision, taken below.
     */
    event.stopPropagation();

    /*
     * Selected before any question about permission or type, because selection
     * is not an edit. A reader gets the same lit ring the author does, the ring
     * is what tells their teammates where they are looking, and a structured map
     * has nodes worth pointing at even though none of them can be dragged.
     */
    setSelected(node.id);

    if (!canEdit || structured) return;

    const target = event.target as HTMLElement;
    if (target.closest("button") || target.closest("textarea")) return;

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const point = toWorld(event);
    dragging.current = { id: node.id, dx: point.x - node.x, dy: point.y - node.y };
  }

  /**
   * Starts a resize from the grip on a node's outer corner.
   *
   * Size used to be settable only at the moment a node was made, and then only
   * from a menu that also added the node — which is what made the three options
   * read as dead buttons, since the node under the cursor deliberately did not
   * change. Dragging the shape is the gesture people already expect from every
   * other drawing tool, and it says what it does without a label.
   *
   * Available on the structured types too. Position is theirs to decide, size is
   * not: a tree map reflows around a bigger box, it does not fight it.
   */
  function onResizePointerDown(event: React.PointerEvent, node: CanvasNode) {
    // Swallowed first, before any question is asked — see `onNodePointerDown`.
    // Every dead button on this canvas has been a press that reached the
    // viewport, which captures the pointer to pan and eats the click.
    event.stopPropagation();
    if (!canEdit) return;

    const centre = positionOf(node);
    const point = toWorld(event);
    const distance = Math.hypot(point.x - centre.x, point.y - centre.y);
    // The grip sits on the node's corner, so this cannot happen to a real press.
    // It guards the division, not the gesture: a zero here is an infinite ratio.
    if (distance < 1) return;

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    resizing.current = { id: node.id, rank: node.rank, distance, cx: centre.x, cy: centre.y };
  }

  /**
   * Anything that is not a node pans the view. The capture is taken on the
   * viewport, so a drag keeps working when the pointer leaves whatever it
   * started on — however far it goes.
   */
  function onViewportPointerDown(event: React.PointerEvent) {
    if (dragging.current || resizing.current) return;
    // Pressing the empty plane is how you let go of a node. Without this the
    // ring stays lit on whatever was touched last and Delete still points at it,
    // which is a loaded key aimed at something nobody is looking at.
    setSelected(null);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    panning.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
  }

  function onPointerMove(event: React.PointerEvent) {
    // Before the pan, because a resize takes the pointer capture on the grip and
    // a stray pan started underneath it would move the map as well as the node.
    const resize = resizing.current;
    if (resize) {
      const point = toWorld(event);
      const distance = Math.hypot(point.x - resize.cx, point.y - resize.cy);
      update(resize.id, { rank: rankFromRatio(resize.rank, distance / resize.distance) });
      return;
    }

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
    resizing.current = null;
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

  /**
   * The document as it stands, and a counter that moves on every edit.
   *
   * A save is asynchronous, and anything typed while it is in flight belongs to
   * the *next* save. Without the counter the completion handler clears `dirty`
   * unconditionally and those keystrokes are marked saved without ever having
   * been sent — the one failure autosave exists to prevent, reintroduced by
   * autosave itself.
   */
  const doc = React.useRef({ nodes, radial });
  const edits = React.useRef(0);
  const savedEdits = React.useRef(0);
  React.useEffect(() => {
    doc.current = { nodes, radial };
    edits.current += 1;
  }, [nodes, radial]);

  /**
   * Node ids as of the last time the server was asked to re-render.
   *
   * `router.refresh()` on every autosave would refetch the whole page a second
   * after each keystroke. It is only needed when the *set* of saved nodes has
   * changed, because that is what `savedIds` gates the comment control on — a
   * node has to exist in the saved map before it can be commented on. Text,
   * position, colour and size need no refresh at all.
   */
  const refreshedIds = React.useRef<string>("");

  const save = React.useCallback(async () => {
    const at = edits.current;
    setBusy(true);
    try {
      // `radial` goes with the nodes. Left out, a rotation survives on screen
      // until the next reload and then quietly reverts, which reads as the save
      // having failed at something else entirely.
      const result = await updateMindMapData({ mapId, data: doc.current });
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      savedEdits.current = at;
      // Only if nothing was typed while that was in the air.
      if (edits.current === at) setDirty(false);
      setFresh(new Set());

      const ids = doc.current.nodes
        .map((node) => node.id)
        .sort()
        .join(",");
      if (ids !== refreshedIds.current) {
        refreshedIds.current = ids;
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }, [mapId, router]);

  /**
   * Autosave, debounced.
   *
   * This reverses a decision this file used to state at the top: saving was
   * explicit because "an autosave firing mid-sentence turns every half-formed
   * idea into something the whole team can see". That is still true, and the
   * owner has asked for autosave anyway — a map whose work is lost because
   * nobody pressed a button is the worse of the two.
   *
   * The timer restarts on every change, so it fires once the typing stops rather
   * than every 1.2 seconds while it continues. There is no toast: one per save
   * would be a notification every time somebody pauses to think.
   *
   * The trade being accepted, plainly: a save writes the whole document, so two
   * people editing one map now overwrite each other continuously instead of
   * rarely. Explicit saving was what kept that rare. Nothing here fixes it —
   * that needs per-node merging, which is a different piece of work.
   */
  React.useEffect(() => {
    if (!canEdit || !dirty || busy) return;
    const timer = setTimeout(() => void save(), 1200);
    return () => clearTimeout(timer);
  }, [canEdit, dirty, busy, nodes, radial, save]);

  /**
   * The two ways a page ends.
   *
   * Leaving by a link unmounts this component, and there is still time to write:
   * the request outlives the render tree. Closing the tab does not — a Server
   * Action cannot be awaited from `beforeunload` — so that case can only warn,
   * and the browser shows its own dialog.
   */
  const pending = React.useRef({ dirty, save });
  pending.current = { dirty, save };
  React.useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!pending.current.dirty) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (pending.current.dirty) void pending.current.save();
    };
  }, []);

  return (
    <div className="relative min-h-0 flex-1">
      {/* Floating rather than in a row of its own: on a full-screen canvas the
          pixels belong to the map. */}
      <div className="pointer-events-none absolute right-4 top-4 z-10 flex items-center gap-2">
        {/* What the save button used to say, without the button. Three states
            rather than two, because "nothing to do" and "written just now" feel
            different to somebody who has stopped typing to check. */}
        {canEdit ? (
          <span className="rounded-full border bg-background/90 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur">
            {busy ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}
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
          {/* A radial map's segment *is* its node, so the whole drawing layer is
              different — no boxes, no edges, no notation marks. Everything around
              it is shared: the node state, the explicit save, pan and zoom, the
              comment panel and presence all live out here. */}
          {isRadial ? (
            <MindMapWheel
              nodes={nodes}
              radial={radial}
              canEdit={canEdit}
              canComment={canComment}
              mounted={mounted}
              threadSizes={commentCounts}
              savedIds={savedIds}
              renderWatchers={renderWatchers}
              hue={MIND_MAP_META[type].hue}
              focusedNodeId={selected}
              onUpdate={update}
              onSplit={splitInto}
              onAddBranch={addBranch}
              onRemove={remove}
              onReweight={reweight}
              onResize={resize}
              onRotate={(degrees) => {
                setRadial((prev) => ({ ...prev, start: prev.start + degrees }));
                setDirty(true);
              }}
              onSetThickness={setThickness}
              onSetWeights={setWeights}
              onCommitRotation={(start) => {
                setRadial((prev) => ({ ...prev, start }));
                setDirty(true);
              }}
              siblingsOf={siblingsOf}
              onOpenThread={setOpenThread}
              onFocusNode={(id) => {
                setSelected(id);
                if (id) setPresenceFocus(`map:${mapId}:${id}`);
              }}
            />
          ) : null}

          {/* One overflowing SVG for every edge. It has no meaningful size of
              its own; `overflow: visible` is what lets a line reach a node far
              outside whatever box the element happens to occupy. */}
          {isRadial ? null : (
          <>
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

            {/* Notation first, so a node always paints over its own mark rather
                than a bracket cutting across the words it is bracketing. */}
            {/* One kind of mark left. A bridge map's long line, a double bubble's
                twin joins, and a circle map's ring and frame were all drawn here;
                the first two types are gone and the third is a wheel with its own
                module, so their branches went too rather than sitting unreachable
                and looking maintained. */}
            {marks.map((mark) => (
              <path
                key={mark.id}
                d={mark.d}
                fill="none"
                stroke={mindMapColor(type, 0.65)}
                strokeWidth="2"
                strokeLinecap="round"
              />
            ))}

            {routes.map((route) => (
              <path
                key={route.id}
                d={route.d}
                fill="none"
                stroke={mindMapColor(type, 0.5)}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={style.edge === "dashed" ? "7 6" : undefined}
                markerEnd={style.edge === "arrow" ? `url(#tf-arrow-${type})` : undefined}
                className={fresh.has(route.id) && style.edge !== "dashed" ? "tf-map-edge" : undefined}
                // Dash lengths are in user units, so the draw-on animation needs
                // the length along the corners — an elbow is longer than the
                // line between its ends.
                style={
                  fresh.has(route.id) && style.edge !== "dashed"
                    ? ({ "--tf-edge-length": `${Math.round(route.length)}` } as React.CSSProperties)
                    : undefined
                }
              />
            ))}
          </svg>

          {nodes.map((node) => {
            const isCentre = node.parentId === null;
            const point = positionOf(node);
            const round = style.node === "circle";
            // Chosen when the node was made, not inferred from where it sits.
            const shrink = rankScale(node.rank);
            // The same numbers the router used. Anything else here and a line
            // that provably misses a box misses the wrong box.
            const { w, h } = nodeSize(type, node.rank);
            const threadSize = commentCounts.get(node.id) ?? 0;
            /*
             * The hover controls are a fixed pixel size while the node they hang
             * off is not, so on a node dragged several ranks up they shrink into
             * specks in its corner and on a small one they swamp it.
             *
             * Scaling the wrapper keeps every icon, border, padding and gap
             * inside in proportion without restating a single one of them. The
             * CSS `scale` property rather than a `transform`, because these
             * elements are already positioned with Tailwind's translate
             * utilities and an inline `transform` would replace those outright —
             * which centres nothing and moves every control off its corner.
             *
             * Clamped: rank has no upper bound, and a rank-12 node would
             * otherwise carry a `+` button wider than most whole nodes.
             */
            const furniture = `${clamp(shrink, 0.85, 3)}`;
            return (
              <div
                key={node.id}
                // Who else is here, most recent first. Empty for a node nobody
                // else is on, and never listing you — a tooltip naming yourself
                // on the node you just clicked says nothing you do not know.
                title={watcherNames(node.id) || undefined}
                onPointerDown={(event) => onNodePointerDown(event, node)}
                // Pressing anywhere on a node is enough to count as being on it.
                // Waiting for the text box to take focus would leave anyone who
                // is only reading, or who has no permission to edit, invisible.
                onPointerDownCapture={() => setPresenceFocus(`map:${mapId}:${node.id}`)}
                className={cn(
                  // No `overflow-hidden` here, however tempting: the hover
                  // controls hang outside the box on purpose, and clipping the
                  // node clips them. Overflowing *text* is the textarea's own
                  // problem, and it scrolls.
                  "group absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-1 border",
                  round
                    ? "rounded-full p-3 text-center"
                    : style.node === "pill"
                      ? "rounded-full px-5 py-2"
                      : style.corner === "sharp"
                        ? "rounded-none px-3 py-2"
                        : "rounded-md px-3 py-2",
                  canEdit && !structured && "cursor-grab active:cursor-grabbing",
                  fresh.has(node.id) && "tf-map-node-in",
                )}
                style={{
                  left: point.x,
                  top: point.y,
                  width: w,
                  height: h,
                  fontSize: `${Math.max(0.68, shrink) * 100}%`,
                  // A bubble map's children are not subordinate to its centre —
                  // the centre is the thing and every bubble round it is one of
                  // its qualities, all of equal standing. Fading them was reading
                  // as a hierarchy the type does not have. Everywhere else the
                  // lighter fill still says "this hangs off that".
                  background: mindMapColor(type, isCentre || type === MindMapType.BUBBLE ? 0.24 : 0.12),
                  // A node's own hue if it has been given one, otherwise the
                  // map's. Only the border is tinted: colouring the fill as well
                  // put nine differently-coloured washes on one backdrop and the
                  // map stopped reading as a single drawing.
                  //
                  // 0.35 was too faint to find the edge of a box against the
                  // wash it sits on — a shape you cannot see the extent of reads
                  // as a smudge rather than as a box. Still well under the
                  // centre's 0.7, so the hierarchy survives being legible.
                  borderColor: nodeBorderColor(type, node.hue, isCentre ? 0.7 : 0.55),
                  borderWidth: node.hue !== null && node.hue !== undefined ? 2 : isCentre ? 2 : 1.5,
                  // The lit ring: yours white, everyone else's their own colour.
                  // A box-shadow rather than an extra element, so it follows the
                  // node's own corner radius without anything restating it — and
                  // so it cannot sit over the node and swallow a click.
                  boxShadow: ringFor(node.id, selected === node.id),
                  transition: "box-shadow 160ms ease",
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

                {/* Above the text, not inline with it: an emoji in the flow
                    reflows the words every time it changes, and on a round node
                    that re-wraps the whole label. It rides on the border instead,
                    where it also stays legible on a node shrunk several ranks
                    down. */}
                {node.emoji ? (
                  <span
                    // Keyed on the glyph so changing it replays the pop. Without
                    // the key React reuses the element, the animation has already
                    // finished on it, and picking a new emoji swaps the character
                    // with no acknowledgement that anything happened.
                    key={node.emoji}
                    className="tf-pop-in pointer-events-none absolute -left-1 -top-2 select-none rounded-full bg-background/85 px-1 leading-tight shadow-sm backdrop-blur"
                    style={{ fontSize: `${Math.max(0.8, shrink) * 90}%` }}
                  >
                    {node.emoji}
                  </span>
                ) : null}

                {/* Fills the box rather than sizing itself, because the box is
                    now a fixed size the router relies on. Text past the bottom
                    scrolls; it does not stretch the node and quietly invalidate
                    every route on the map. */}
                <textarea
                  value={node.text}
                  readOnly={!canEdit}
                  // The same 160 the schema enforces. Without it a long note
                  // types in happily and fails on Save with a message about
                  // lengths, by which point the author has no idea which node.
                  maxLength={160}
                  placeholder={isCentre ? "Main title" : "…"}
                  onChange={(event) => update(node.id, { text: event.target.value })}
                  className={cn(
                    // `tf-map-node-text` centres the words vertically as well as
                    // horizontally. A textarea fills its box and starts at the
                    // top, which put every one-line label against the ceiling of
                    // its own shape — most visible on a circle, where the top of
                    // the box is the narrowest part of the drawing.
                    "tf-map-node-text h-full w-full resize-none bg-transparent text-center text-[1em] leading-snug outline-none placeholder:text-muted-foreground",
                    isCentre && "font-semibold",
                  )}
                />

                {/* Who else is on this node, and how much has been said about
                    it. Both sit outside the box: inside, they would compete with
                    the words on a node that may be several ranks small, and the
                    box is a fixed size the router depends on. */}
                <span
                  className="absolute -bottom-3 left-1"
                  style={{ scale: furniture, transformOrigin: "bottom left" }}
                >
                  {renderWatchers(node.id)}
                </span>

                {savedIds.has(node.id) && (threadSize > 0 || (mounted && canComment)) ? (
                  <button
                    type="button"
                    aria-label={
                      threadSize > 0 ? `${threadSize} comments on this node` : "Comment on this node"
                    }
                    onClick={() => setOpenThread(node.id)}
                    className={cn(
                      // The left edge, at the node's own middle. Every other
                      // corner is taken — emoji top left, controls top right,
                      // watchers bottom left, the resize grip bottom right — and
                      // this is the side the request asked for. Being on the
                      // midline also means it does not move as the node's corners
                      // do when it is resized.
                      "absolute -left-3 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-full border bg-background px-1.5 py-0.5 text-[10px] font-semibold shadow-sm",
                      // A node nobody has said anything about does not advertise
                      // the fact; the button appears on hover instead.
                      threadSize === 0 &&
                        "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
                    )}
                    style={{
                      borderColor: mindMapColor(type, 0.5),
                      scale: furniture,
                      // Pinned by its left edge, so growing with the node pushes
                      // it outward rather than back under the node's own border.
                      transformOrigin: "left center",
                    }}
                  >
                    <MessageSquare className="size-3" />
                    {threadSize > 0 ? threadSize : null}
                  </button>
                ) : null}

                {/* Menus are mounted after hydration, never rendered on the
                    server. Radix numbers them with `useId`, which React derives
                    from position in the tree, so the ids only agree if the server
                    and client build an identical tree — and a canvas of twenty
                    nodes turns one drifting counter into twenty hydration
                    warnings. An explicit id on the trigger does not help: Radix
                    overwrites it with its own. Nothing is lost, because these
                    appear on hover and nobody hovers during hydration. */}
                {canEdit && mounted ? (
                  <div
                    className="absolute -right-2 -top-2 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                    style={{ scale: furniture, transformOrigin: "top right" }}
                  >
                    {/* One press, one node. This was a menu of three sizes for
                        the child about to be created, and it was the wrong place
                        to ask: the options sat under a `+`, described a node that
                        did not exist yet, and left the node actually under the
                        cursor unchanged — so clicking one looked exactly like a
                        dead button, and was reported as one. Size belongs to a
                        node that can be seen, and is dragged from its corner.

                        The new node inherits its parent's size, which is what the
                        middle option did and the only one of the three that
                        needed no decision from the author.

                        A flow map is the exception, and it is a real choice
                        rather than a restated one: a step can be followed by the
                        next step or explained by a box underneath it, and those
                        are different things that both hang off the same node.
                        Nothing else on the canvas has two kinds of child. */}
                    {type === MindMapType.FLOW ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label="Add a step or an explanation"
                            className="rounded-full border bg-background p-1 shadow-sm"
                            style={{ borderColor: mindMapColor(type, 0.5) }}
                          >
                            <Plus className="size-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={() => addChild(node, node.rank, "step")}>
                            <Plus /> Add the next step
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => addChild(node, node.rank, "note")}>
                            <MessageSquare /> Add an explanation
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <button
                        type="button"
                        aria-label="Add a connected node"
                        onClick={() => addChild(node, node.rank)}
                        className="rounded-full border bg-background p-1 shadow-sm"
                        style={{ borderColor: mindMapColor(type, 0.5) }}
                      >
                        <Plus className="size-3.5" />
                      </button>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="More for this node"
                          className="rounded-full border bg-background p-1 shadow-sm"
                          style={{ borderColor: mindMapColor(type, 0.5) }}
                        >
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-60">
                        {/* Size is not on this menu. It is the grip on the
                            node's corner, and on the keyboard it is `+` and `-`
                            with the node selected. Two menu items saying what a
                            visible handle already says is clutter on a menu that
                            has real choices to offer. */}
                        <DropdownMenuLabel>Emoji</DropdownMenuLabel>
                        {/* A grid inside the menu rather than a submenu per
                            emoji: twenty-four items as menu rows is a scroll,
                            and marking a node is meant to be one glance and one
                            click. */}
                        <div className="grid grid-cols-8 gap-0.5 px-1.5 pb-1">
                          {NODE_EMOJI.map((glyph) => (
                            <button
                              key={glyph}
                              type="button"
                              aria-label={`Mark with ${glyph}`}
                              onClick={() =>
                                update(node.id, {
                                  emoji: node.emoji === glyph ? null : glyph,
                                })
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
                        <DropdownMenuLabel>Border</DropdownMenuLabel>
                        <div className="flex flex-wrap gap-1 px-1.5 pb-1">
                          <button
                            type="button"
                            aria-label="Use the map's colour"
                            title="Map colour"
                            onClick={() => update(node.id, { hue: null })}
                            className={cn(
                              "size-5 rounded-full border-2",
                              node.hue === null || node.hue === undefined
                                ? "ring-2 ring-ring ring-offset-1 ring-offset-popover"
                                : undefined,
                            )}
                            style={{ borderColor: mindMapColor(type, 0.9) }}
                          />
                          {NODE_HUES.map(({ hue, label }) => (
                            <button
                              key={hue}
                              type="button"
                              aria-label={label}
                              title={label}
                              onClick={() => update(node.id, { hue })}
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

                        {/* Comments reachable from the menu as well as from the
                            badge. The badge is the one that can *tell* you there
                            is something to read; the menu is where somebody goes
                            looking when there is nothing on the node yet, and a
                            control that only appears on hover once a thread
                            exists is not somewhere anybody starts one. */}
                        {savedIds.has(node.id) && canComment ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setOpenThread(node.id)}>
                              <MessageSquare />
                              {threadSize > 0 ? `Comments (${threadSize})` : "Add a comment"}
                            </DropdownMenuItem>
                          </>
                        ) : null}

                        {!isCentre ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => remove(node.id)}
                            >
                              <Trash2 /> Remove this node
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ) : null}

                {/* Drag the corner to resize. No `mounted` gate: this is a plain
                    button, not a Radix menu, so it carries none of the `useId`
                    counting behind the hydration warnings.

                    A round node's bounding box corner is outside the circle, so
                    the grip would float unattached in the gap. It sits on the
                    shape itself instead — 45° round the rim, which is that same
                    corner pulled in to where the ink actually is. */}
                {canEdit ? (
                  <button
                    type="button"
                    aria-label="Drag to resize this node"
                    title="Drag to resize"
                    onPointerDown={(event) => onResizePointerDown(event, node)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize touch-none rounded-full border bg-background p-1 opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                    style={{
                      left: round ? "85.4%" : "100%",
                      top: round ? "85.4%" : "100%",
                      borderColor: mindMapColor(type, 0.5),
                      // Grows with the node like the rest of the furniture. Its
                      // origin is the centre, which is where the translate
                      // utilities have already put it.
                      scale: furniture,
                    }}
                  >
                    <Maximize2 className="size-3 rotate-90" />
                  </button>
                ) : null}
              </div>
            );
          })}
          </>
          )}
        </div>
      </div>

      {/* Outside the pan-and-zoom transform on purpose: a thread scaled to 40%
          is unreadable and one at 200% is bigger than the node it belongs to. */}
      {/* Only while the node is still on screen. Removing a node with its thread
          open would otherwise leave a panel discussing a box nobody can see. */}
      {openThread && nodes.some((node) => node.id === openThread) ? (
        <MindMapNodeComments
          mapId={mapId}
          nodeId={openThread}
          nodeLabel={nodes.find((node) => node.id === openThread)?.text ?? ""}
          comments={comments}
          canComment={canComment}
          onClose={() => setOpenThread(null)}
        />
      ) : null}
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
