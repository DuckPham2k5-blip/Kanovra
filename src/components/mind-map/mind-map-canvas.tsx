"use client";

import { MindMapType } from "@prisma/client";
import {
  BoxSelect,
  Hand,
  MessageSquare,
  MoreHorizontal,
  Plus,
  PlusCircle,
  Redo2,
  Scaling,
  Trash2,
  TriangleAlert,
  Undo2,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MindMapWheel } from "@/components/mind-map/mind-map-wheel";
import {
  DEFAULT_WEIGHT,
  clampRank,
  formatTaskCount,
  newNodeId,
  nodeSize,
  openTaskCount,
  rankFromRatio,
  rankScale,
  seedNodes,
  type CanvasNode,
  type RadialSettings,
} from "@/lib/mind-map-canvas";
import { MindMapColorPanel } from "@/components/mind-map/mind-map-color-panel";
import { MindMapNodeInfo } from "@/components/mind-map/mind-map-node-info";
import { EmojiSubmenu, TextSubmenu } from "@/components/mind-map/mind-map-node-format";
import { fillBorder, fillCss, fillInk, rememberFill, type NodeFill } from "@/lib/mind-map-fill";
import { fontScaleOf, textFaceCss } from "@/lib/mind-map-text";
import { HUB_RADIUS, radialLayout, radialReach, RING_THICKNESS } from "@/lib/mind-map-radial";
import { MAP_MOVED_ON } from "@/lib/mind-map-version";
import {
  edgeAxis,
  routeEdge,
  taperedPieces,
  trimStraight,
  type Point,
  type Rect,
} from "@/lib/mind-map-edges";
import { applyOffsets, isMovableLayout, isStructured, layoutNodes } from "@/lib/mind-map-layout";
import { notationFor, replacesEdges } from "@/lib/mind-map-notation";
import { setPresenceFocus, useFocusGroups } from "@/lib/presence";
import { emptyHistory, record, redo, undo } from "@/lib/undo-history";
import { MIND_MAP_META, mindMapColor, mindMapStyle, nodeBorderColor } from "@/lib/mind-maps";
import type { MapPalette } from "@/lib/mind-map-palette";
import { cn, colorFromString } from "@/lib/utils";
import { markNodeCommentsRead } from "@/server/actions/mind-map-comment";
import { updateMindMapData } from "@/server/actions/mind-map";

/*
 * How far the sheet zooms.
 *
 * It was 0.2 to 3, which is a fifth of full size to three times it — a range
 * chosen for a map that fits a screen, and far too narrow for one somebody has
 * spread out. 0.02 shows a drawing fifty screens wide; 40 puts a single node's
 * label across the whole viewport.
 *
 * Not literally unbounded, and the bound is not a design preference. The
 * transform is `translate` then `scale` in doubles, so beyond roughly this the
 * translation loses the precision that keeps a node under the pointer, and the
 * browser stops rasterising text at all — the map would go blank rather than
 * large. A number nobody reaches is the honest version of infinite here.
 */
const MIN_SCALE = 0.02;
const MAX_SCALE = 40;

// A circle wheel used to be left open by a 10° gap at its start angle. An angle
// is a wedge — narrow at the hub, wide at the rim — so that one opening was far
// wider than every other slot on the wheel, and the owner asked for the slots to
// match. The wheel is closed again, and every slot, the seam included, is the
// same constant-width gap drawn by `paddedSectorPath`.

/**
 * How far the pointer must travel, in screen pixels, before a press on a node
 * counts as a drag rather than a click. Small enough that a deliberate drag
 * starts at once, large enough that the tremor in a click to edit the text does
 * not move the node.
 */
const DRAG_THRESHOLD = 4;

/** What one undo step restores: the whole document, nodes and wheel together. */
type Snapshot = { nodes: CanvasNode[]; radial: RadialSettings };

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
  palette,
  title,
  initialNodes,
  initialRadial,
  initialRecents,
  unreadable,
  initialVersion,
  canEdit,
  canComment,
  comments,
  members,
  reads,
}: {
  mapId: string;
  type: MindMapType;
  /** The map's colour. Decided on the server so the first paint is already it. */
  palette: MapPalette;
  title: string;
  initialNodes: CanvasNode[];
  initialRadial: RadialSettings;
  /** Colours already used on this map, most recent first. */
  initialRecents: NodeFill[];
  /**
   * The stored document held something, and none of it could be read.
   *
   * Distinct from "no nodes", which is every new map. See `dirty` below: this is
   * the one case where an empty canvas must *not* be saved.
   */
  unreadable: boolean;
  /** Which version of the document this page was built from. */
  initialVersion: string;
  canEdit: boolean;
  canComment: boolean;
  comments: NodeComment[];
  members: AvatarUser[];
  /** When this reader last opened each node's thread, by node id, as ISO. */
  reads: Record<string, string>;
}) {
  const router = useRouter();

  const [nodes, setNodes] = React.useState<CanvasNode[]>(() =>
    initialNodes.length ? initialNodes : seedNodes(type, title),
  );
  /*
   * A map with no nodes is saved as soon as it opens, so the seeded centre node
   * is really there rather than only on screen.
   *
   * Except when the document could not be read. Then the seeded node is standing
   * in for content that still exists in the database, and saving it — which
   * autosave does about a second after this mounts — replaces that content with
   * a blank map, silently, as a consequence of somebody merely opening the page.
   * The first deliberate edit sets this the usual way, so overwriting stays
   * possible; it just stops being something the page does on its own.
   */
  const [dirty, setDirty] = React.useState(initialNodes.length === 0 && !unreadable);
  const [busy, setBusy] = React.useState(false);

  /**
   * The undo stack, holding whole snapshots of the document.
   *
   * This exists because autosave took away the safety net that used to stand in
   * for it: while a save was a deliberate press, a wrong move was survivable by
   * simply not saving and reloading. On a 1.2 second timer it is committed
   * before anybody has decided anything.
   *
   * Per canvas and not persisted. Undo is a property of *this* editing session —
   * a shared stack would let one person walk back somebody else's work, and a
   * stack that survived a reload would offer to undo something the person
   * reading it never did.
   */
  const [history, setHistory] = React.useState(() => emptyHistory<Snapshot>());

  /*
   * The document as of this render, for `remember` to snapshot.
   *
   * Written during render rather than in an effect, because an effect-backed ref
   * lags by one commit — `remember` would store the state before the *previous*
   * change, and undo would land one step too far back. The same pattern the
   * autosave flush uses a few hundred lines down, for the same reason.
   */
  const live = React.useRef<Snapshot>({ nodes: [], radial: initialRadial });

  /**
   * Records the document as it stands, just before something changes it.
   *
   * The label decides what counts as one step: everything reported under the
   * same label in quick succession folds together, so a word typed into a node
   * is one undo and a drag is one undo rather than one per frame. See
   * `undo-history.ts` — the rule lives there, with tests.
   */
  const remember = React.useCallback((label: string) => {
    setHistory((prev) => record(prev, live.current, label, Date.now()));
  }, []);

  /**
   * Where a radial map's wheel starts and how much of the circle it uses.
   *
   * Part of the document, not of the view: rotating the wheel changes which
   * branch sits at the top, and that is an arrangement somebody chose. Pan and
   * zoom stay per-viewer for the opposite reason — they are where *this* person
   * is looking.
   */
  const [radial, setRadial] = React.useState<RadialSettings>(initialRadial);
  // Which node's colour is being chosen, and the colours this map has used.
  const [colouring, setColouring] = React.useState<string | null>(null);
  const [recents, setRecents] = React.useState<NodeFill[]>(initialRecents);
  const isRadial = type === MindMapType.CIRCLE;

  live.current = { nodes, radial };

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

  /*
   * A group of nodes picked to move together. Separate from `selected` (which is
   * the one node the panels, Delete and the resize keys act on): a group is only
   * about moving several at once. Built two ways — Ctrl/⌘-click a node to toggle
   * it in, or drag a box round several in select mode — and dragging any member
   * carries the whole group. Empty most of the time.
   */
  const [multi, setMulti] = React.useState<Set<string>>(new Set());
  /** Drag on the empty plane draws a selection box instead of panning. */
  const [selectMode, setSelectMode] = React.useState(false);
  /** The selection box while it is being drawn, in map coordinates. */
  const [marquee, setMarquee] = React.useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const marqueeStart = React.useRef<{ x: number; y: number } | null>(null);

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

  /**
   * Comments on each node that this person has not seen.
   *
   * Your own are never unread — you wrote them. Everything else counts as unread
   * until you have opened that node's thread *since* it was posted, which is why
   * the row stores a time and not a flag: a reply after your last look has to be
   * able to make a node unread again.
   */
  const unreadCounts = React.useMemo(() => {
    const out = new Map<string, number>();
    for (const comment of comments) {
      if (comment.mine) continue;
      const seenAt = reads[comment.nodeId];
      if (seenAt && new Date(comment.createdAt) <= new Date(seenAt)) continue;
      out.set(comment.nodeId, (out.get(comment.nodeId) ?? 0) + 1);
    }
    return out;
  }, [comments, reads]);

  /**
   * Threads opened in this session, cleared straight away rather than waiting
   * for the server.
   *
   * The mark is written without revalidating — re-rendering the page underneath
   * a panel that has just opened is a visible jolt for a change the reader
   * already knows about — so nothing else would clear the pulse until the next
   * navigation, and it would go on flashing at somebody who is reading it.
   */
  const [seenNow, setSeenNow] = React.useState<Set<string>>(new Set());

  const openComments = React.useCallback(
    (nodeId: string) => {
      setOpenThread(nodeId);
      setSeenNow((prev) => new Set(prev).add(nodeId));
      void markNodeCommentsRead({ mapId, nodeId });
    },
    [mapId],
  );

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
    (nodeId: string, mine: boolean, scale = 1) => {
      const here = watchersByRecency.get(nodeId) ?? [];
      if (!mine && !here.length) return undefined;

      // The ring is drawn on a node that is itself scaled, so every length is
      // divided by that scale: the ring stays the same width on screen whether
      // the node is a speck or a slab, rather than vanishing on a small one.
      const px = (value: number) => `${round2(value / scale)}px`;
      const rings: string[] = [];
      let spread = 2;

      if (mine) {
        rings.push(`0 0 0 ${px(spread + 1)} rgba(0, 0, 0, 0.28)`);
        rings.push(`0 0 0 ${px(spread)} var(--tf-ring-self)`);
        spread += 4;
      }
      for (const id of here) {
        rings.push(`0 0 0 ${px(spread)} ${colorFromString(id)}`);
        spread += 4;
      }

      // The bloom that makes it read as lit rather than as one more border.
      const glow = mine ? "var(--tf-ring-self)" : colorFromString(here[0]);
      rings.push(`0 0 ${px(spread * 2)} ${px(Math.round(spread / 2))} ${glow}`);
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
  /**
   * A node drag in progress — or one pending, waiting to see if the press
   * becomes a drag or stays a click.
   *
   * The node is almost entirely covered by its own text box, and a text box is
   * something you also want to click into and type. So a press does not grab the
   * pointer straight away: it is `pending` until it moves past a few pixels, and
   * only then does it capture and start moving the node. A press that never moves
   * falls through to the text box as an ordinary click. Without this only the
   * thin ring of padding around the text box could start a drag — a sliver on an
   * ordinary node and, on one enlarged several steps, impossible to hit at all,
   * which is what was reported as "I can't move it".
   */
  const dragging = React.useRef<{
    id: string;
    /**
     * What the drag writes: a free node's own position, or a tree node's offset
     * from where the layout put it. The drag itself is the same either way — the
     * pointer's travel since the press, added to the value stored at the press —
     * so neither case needs to know where the node is actually drawn.
     */
    fields: "position" | "offset";
    fromA: number;
    fromB: number;
    /** The pointer in map coordinates when the press landed. */
    worldX: number;
    worldY: number;
    pending: boolean;
    startX: number;
    startY: number;
    pointerId: number;
    /**
     * When the pressed node is part of a group, every member and the value it
     * held at the press, so the whole group moves by the same delta. Absent for
     * an ordinary single-node drag.
     */
    members?: { id: string; fromA: number; fromB: number }[];
  } | null>(null);
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
  // Whether a node can be dragged: every free canvas, and a tree — where a drag
  // is an offset on top of the layout rather than a position. See `applyOffsets`.
  const movable = !structured || isMovableLayout(type);

  /**
   * For the structured types the position of a node is computed from the shape,
   * not stored. A tree then adds whatever each node has been dragged by, so it
   * keeps arranging itself as branches arrive while still letting a node be put
   * somewhere by hand; a brace has no offsets and stays exactly as laid out.
   */
  const layout = React.useMemo(
    () => (structured ? applyOffsets(layoutNodes(type, nodes), nodes) : null),
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
    const out: { id: string; points: Point[]; w0: number; w1: number }[] = [];

    for (const node of nodes) {
      if (!node.parentId) continue;
      const from = rects.get(node.parentId);
      const to = rects.get(node.id);
      if (!from || !to) continue;

      // The connector is as thick as the node at each of its ends, so it tapers
      // between a small node and a big one — thick where it meets the big one,
      // thin where it meets the small. Tied to each node's own drawn size, so it
      // grows and shrinks with the node under zoom as well as under resize, which
      // is what "the line matches the item" asks for.
      const wFrom = edgeWidthFor(from);
      const wTo = edgeWidthFor(to);

      const axis = edgeAxis(type);
      if (axis === "free") {
        const [a, b] = trimStraight(from, to, style.node === "circle");
        out.push({ id: node.id, points: [a, b], w0: wFrom, w1: wTo });
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

      // The widths follow the drawn order: reversing the points to point the
      // arrow the other way swaps which end is thick.
      out.push({
        id: node.id,
        points: drawn,
        w0: causeSide ? wTo : wFrom,
        w1: causeSide ? wFrom : wTo,
      });
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
   * Gives a map coordinates the first time it is opened as a free canvas.
   *
   * Flow and multi-flow both had their positions computed on every render and
   * never stored, so every node on an existing one still holds the `x: 0, y: 0`
   * it was created with. Simply switching them to free would stack the whole map
   * on the origin, which reads as the map having been wiped. Seeding from the
   * arrangement each type used to draw — the wrapped rows for a flow, causes and
   * effects for a multi-flow — means it opens looking exactly as it did before,
   * and is draggable from there.
   *
   * Runs once, and only when *every* node is still at the origin. Anything else
   * is an arrangement somebody made, including one they made by dragging
   * everything into a pile.
   */
  const seeded = React.useRef(false);
  React.useEffect(() => {
    const seedable = type === MindMapType.MULTI_FLOW;
    if (seeded.current || !seedable || !canEdit) return;
    if (nodes.length < 2 || nodes.some((node) => node.x !== 0 || node.y !== 0)) return;

    const arrangement = layoutNodes(type, nodes);
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

  function update(id: string, patch: Partial<CanvasNode>, label = `edit:${id}`) {
    remember(label);
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    setDirty(true);
  }

  /**
   * Patches several nodes at once, in one pass and under one history label — so a
   * group drag is a single undo step, the way a single drag is. The label is
   * held constant across the gesture, which is what makes `remember` coalesce
   * every frame into that one step.
   */
  function moveMany(patches: { id: string; patch: Partial<CanvasNode> }[], label: string) {
    remember(label);
    const byId = new Map(patches.map((p) => [p.id, p.patch]));
    setNodes((prev) => prev.map((n) => (byId.has(n.id) ? { ...n, ...byId.get(n.id)! } : n)));
    setDirty(true);
  }

  function addChild(pressed: CanvasNode, rank: number) {
    const parent = pressed;

    /*
     * Below-right of its parent, then nudged clear of anything already there —
     * two nodes stacked exactly on top of each other read as one, and the second
     * is only discovered by dragging the first.
     *
     * Clearance is measured against both boxes rather than a fixed 60×50, which
     * let a large node land on top of a small one and still count as clear.
     */
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
      weight: DEFAULT_WEIGHT,
      thickness: RING_THICKNESS,
    };
    remember("add");
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
    remember(`size:${id}`);
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, rank: clampRank(n.rank + step) } : n)),
    );
    setDirty(true);
  }, [remember]);

  const remove = React.useCallback((id: string) => {
    const target = nodes.find((n) => n.id === id);
    if (!target) return;

    /*
     * A node takes its whole branch with it — itself and everything hanging off
     * it — whatever level it sits at.
     *
     * It used to re-parent a middle node's children onto their grandparent, to
     * save a branch from a mis-click. The owner reported that as the bug it also
     * is: delete the node joining a left branch to several right ones, and the
     * whole right side jumped left onto the nearest surviving node instead of
     * leaving with the node that was removed. Deleting a thing deletes what hangs
     * off it; undo is what a mis-click has.
     *
     * The one guard left is on a root: at least one has to remain, or the map has
     * nothing to hang anything off (and on a wheel it is the hub that holds the
     * title), so the last one refuses.
     */
    if (target.parentId === null) {
      const roots = nodes.filter((n) => n.parentId === null);
      if (roots.length <= 1) {
        toast.error("This is the only main item — a map needs at least one.");
        return;
      }
    }

    remember(`remove:${id}`);
    // The node and every descendant. Walked here rather than through `subtreeOf`,
    // which is declared further down the component — a dependency on it from this
    // callback would read it in its temporal dead zone.
    const doomed = new Set<string>([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of nodes) {
        if (n.parentId && doomed.has(n.parentId) && !doomed.has(n.id)) {
          doomed.add(n.id);
          grew = true;
        }
      }
    }
    setNodes((prev) => prev.filter((n) => !doomed.has(n.id)));
    setDirty(true);
  }, [nodes, remember]);

  /** One step back or forward, from the shortcut or from the buttons. */
  const stepHistory = React.useCallback((forward: boolean) => {
    setHistory((prev) => {
      const step = forward
        ? redo(prev, live.current, Date.now())
        : undo(prev, live.current, Date.now());
      if (!step) return prev;

      setNodes(step.state.nodes);
      setRadial(step.state.radial);
      setDirty(true);
      return step.history;
    });
  }, []);

  /**
   * Undo and redo, on the whole document.
   *
   * Separate from the selection shortcuts below because it does not need one —
   * you undo what just happened, not what you happen to be holding.
   *
   * Left alone inside a text field, where the browser's own undo already works
   * on the characters and is what somebody pressing Ctrl+Z in a half-typed label
   * means. Taking it over there would make the shortcut walk the whole map back
   * a step instead of removing a letter, which is a much larger surprise than
   * not being able to undo the map from inside a textarea.
   */
  React.useEffect(() => {
    if (!canEdit) return;

    function onKey(event: KeyboardEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.key.toLowerCase() !== "z" && event.key.toLowerCase() !== "y") return;

      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;

      event.preventDefault();
      stepHistory(event.key.toLowerCase() === "y" || event.shiftKey);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, stepHistory]);

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
    remember(`split:${parent.id}`);
    const made: CanvasNode[] = [];
    for (let i = 0; i < count; i += 1) {
      made.push({
        id: newNodeId(),
        text: "",
        x: 0,
        y: 0,
        parentId: parent.id,
        rank: 0,
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
    remember("add");
    const parentId = beside.parentId ?? beside.id;
    const node: CanvasNode = {
      id: newNodeId(),
      text: "",
      x: 0,
      y: 0,
      parentId,
      rank: 0,
      weight: 1,
      thickness: RING_THICKNESS,
    };
    remember("add");
    setNodes((prev) => [...prev, node]);
    setFresh((prev) => new Set(prev).add(node.id));
    setDirty(true);
  }

  // `reweight` and `resize` went with the Size items on the wheel's menu. Width
  // is dragged from the boundary a branch shares with its neighbour and length
  // from its outer rim, and `setWeights` and `setThickness` below are what those
  // grips call — they set a value outright rather than stepping it.

  /** Thickness set outright, for a drag that already knows the answer. */
  function setThickness(id: string, px: number) {
    remember(`reach:${id}`);
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
    remember(`weight:${updates[0]?.id ?? "many"}`);
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

  /**
   * A root and everything hanging off it — one wheel's worth of nodes.
   *
   * Returned in the *same order as the full node list*, not in traversal order.
   * The layout draws a parent's children in the order they appear, and the grips
   * work out a segment's neighbours from that same order through `siblingsOf` —
   * so a subtree that reordered the children (a stack pops last-in-first-out and
   * silently reverses them) drew the wheel one way while the grips traded width
   * the other, and every branch's neighbours were wrong.
   */
  const subtreeOf = React.useCallback(
    (rootId: string) => {
      const ids = new Set<string>([rootId]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const node of nodes) {
          if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
            ids.add(node.id);
            grew = true;
          }
        }
      }
      return nodes.filter((node) => ids.has(node.id));
    },
    [nodes],
  );

  /**
   * A circle map can hold several wheels now — each root is its own sunburst,
   * positioned wherever it has been dragged to (`root.x`/`root.y`).
   *
   * Every wheel is a self-contained `MindMapWheel`: it lays out only its own
   * subtree and measures the pointer against its own centre, so nothing about
   * the drag or rotation maths had to learn there is more than one. Position is
   * stored on the root — unlike the row this first shipped as, because a wheel
   * you can drag has to remember where it was put.
   */
  const radialWheels = React.useMemo(() => {
    if (!isRadial) return [];
    return nodes
      .filter((n) => n.parentId === null)
      .map((root) => ({ root, nodes: subtreeOf(root.id), center: { x: root.x, y: root.y } }));
  }, [isRadial, nodes, subtreeOf]);

  /**
   * A second main item in the same map — a whole new root.
   *
   * On a circle map that is a new wheel: a hub with no branches yet, which the
   * `+` on it grows. On every other map it is a new top-level node, the same
   * kind the map opened with. Either way it is placed clear to the right of
   * everything already drawn and selected on creation, so it is obvious which of
   * several is the new one.
   *
   * The free canvases (bubble, multi-flow) then let it be dragged anywhere; the
   * structured ones (tree, brace) lay their roots out side by side — see
   * `layoutNodes`, which places one tree per root. A map needs at least one root,
   * which is why `remove` refuses to delete the last; this is the other end of
   * that, and there is no upper limit.
   */
  function addRoot() {
    remember("add");
    const roots = nodes.filter((n) => n.parentId === null);

    // Past the far edge of everything on the canvas. A wheel measures its reach
    // from the geometry; a box map reads it off the drawn rectangles, which
    // already know each node's position and size whether it is laid out or free.
    let rightEdge = 0;
    if (isRadial) {
      for (const r of roots) {
        const reach = radialReach(radialLayout(subtreeOf(r.id), radial));
        rightEdge = Math.max(rightEdge, r.x + reach);
      }
    } else {
      for (const rect of rects.values()) rightEdge = Math.max(rightEdge, rect.x + rect.w / 2);
    }
    const x = roots.length ? rightEdge + 140 + (isRadial ? HUB_RADIUS : 0) : 0;

    const rootId = newNodeId();
    const root: CanvasNode = {
      id: rootId,
      text: "",
      x,
      y: 0,
      parentId: null,
      // A wheel's hub is sized by `HUB_RADIUS`, not by rank; a box root looks
      // like the main node the map started with, which is one step up.
      rank: isRadial ? 0 : 1,
      weight: DEFAULT_WEIGHT,
      thickness: RING_THICKNESS,
    };
    setNodes((prev) => [...prev, root]);
    setFresh((prev) => new Set(prev).add(rootId));
    setSelected(rootId);
    setDirty(true);
  }

  /**
   * Starts dragging a whole wheel by its hub — the free-canvas node drag, reused.
   *
   * The press is on the hub inside the wheel, which is inside the viewport, so
   * the same `dragging.current` the box nodes use carries it: the viewport's
   * move handler reads it and writes the root's `x`/`y`, and the wheel redraws
   * at its new centre. `stopPropagation` keeps the press off the viewport's own
   * pan, and the capture keeps the drag alive when the pointer leaves the hub.
   */
  function onHubMoveStart(rootId: string, event: React.PointerEvent) {
    event.stopPropagation();
    if (!canEdit) return;
    const node = nodes.find((n) => n.id === rootId);
    if (!node) return;
    // Pending like a box node, so a plain click on the hub still lands in the
    // title box to edit it and only a real drag moves the wheel. The undo step
    // is recorded by the first `update` in `onPointerMove`, not here, so a click
    // that never becomes a drag leaves no empty step behind.
    const point = toWorld(event);
    dragging.current = {
      id: rootId,
      fields: "position",
      fromA: node.x,
      fromB: node.y,
      worldX: point.x,
      worldY: point.y,
      pending: true,
      startX: event.clientX,
      startY: event.clientY,
      pointerId: event.pointerId,
    };
  }

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
    /*
     * A press on a control is left alone; only a press on the node itself is
     * swallowed.
     *
     * This used to swallow everything, and that is what killed every menu item on
     * this canvas. React attaches at the root container, so `stopPropagation` on
     * a synthetic event stops the *native* event too — and Radix's menu listens
     * on `document`. Stopping the trigger's press there left the menu open but
     * every row in it unreachable, which is the same failure this project already
     * recorded from stopping the press on the trigger itself.
     *
     * Nothing is lost by letting it through: the viewport declines any press that
     * started on a control, which is what the swallowing was protecting against.
     */
    /*
     * A *button* or menu item keeps its own press — the `+`, the `…`, the
     * comment badge — and so must reach Radix on `document`. The text box does
     * not: it used to be lumped in with them, which meant a press anywhere on the
     * node (it is nearly all text box) never started a drag, and only the thin
     * ring of padding around the text could move the node. The threshold below
     * is what lets the text box both drag and edit — a click still lands in it.
     */
    const target = event.target as HTMLElement;
    const onButton = Boolean(target.closest("button, [role='menuitem']"));
    if (!onButton) event.stopPropagation();

    /*
     * Selected before any question about permission or type, because selection
     * is not an edit. A reader gets the same lit ring the author does, the ring
     * is what tells their teammates where they are looking, and a structured map
     * has nodes worth pointing at even though none of them can be dragged.
     */
    setSelected(node.id);

    /*
     * Ctrl/⌘-click toggles the node in the movable group and does nothing else —
     * no drag, so a press that adds a fifth node does not also start dragging it.
     */
    if ((event.ctrlKey || event.metaKey) && canEdit && movable) {
      setMulti((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
      return;
    }

    if (!canEdit || !movable || onButton) return;

    // Pending, not captured. No pointer capture and no `preventDefault` yet, so a
    // press that turns out to be a click still focuses the text box; the capture
    // is taken in `onPointerMove` once the pointer has actually moved.
    const point = toWorld(event);
    const offset = structured;

    /*
     * Pressing a node that is part of the group drags the whole group; pressing
     * any other node is an ordinary single drag and clears the group first, so a
     * plain click never silently carries a selection made earlier.
     */
    const group = multi.has(node.id) && multi.size > 1 ? [...multi] : null;
    if (!group && multi.size) setMulti(new Set());
    const members = group
      ? group
          .map((id) => nodes.find((n) => n.id === id))
          .filter((n): n is CanvasNode => Boolean(n))
          .map((n) => ({
            id: n.id,
            fromA: offset ? (n.ox ?? 0) : n.x,
            fromB: offset ? (n.oy ?? 0) : n.y,
          }))
      : undefined;

    dragging.current = {
      id: node.id,
      fields: offset ? "offset" : "position",
      fromA: offset ? (node.ox ?? 0) : node.x,
      fromB: offset ? (node.oy ?? 0) : node.y,
      worldX: point.x,
      worldY: point.y,
      pending: true,
      startX: event.clientX,
      startY: event.clientY,
      pointerId: event.pointerId,
      members,
    };
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

    // Selected as the resize begins, so the node it belongs to rises to the top
    // of the stack (selected nodes sort above everything). A node grown until it
    // overlaps a neighbour would otherwise stay buried beneath it — the small
    // node sorts on top — and could not be grabbed again to move it.
    setSelected(node.id);

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
    /*
     * A press that began on a control is not a press on the plane.
     *
     * This is the other half of `onNodePointerDown` no longer swallowing those
     * presses: they now reach here, and without this the viewport would capture
     * the pointer to pan and eat the click — the dead-button bug this project has
     * had three times.
     */
    if ((event.target as HTMLElement).closest("button, textarea, [role='menuitem']")) return;

    // In select mode a press on the plane draws a selection box instead of
    // panning; the box's contents become the group when the press is released.
    if (selectMode && canEdit && movable) {
      const point = toWorld(event);
      marqueeStart.current = point;
      setMarquee({ x0: point.x, y0: point.y, x1: point.x, y1: point.y });
      setSelected(null);
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      return;
    }

    // Pressing the empty plane is how you let go of a node. Without this the
    // ring stays lit on whatever was touched last and Delete still points at it,
    // which is a loaded key aimed at something nobody is looking at. It also
    // drops any group, so a pan never carries a stale selection.
    setSelected(null);
    if (multi.size) setMulti(new Set());
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
      update(
        resize.id,
        { rank: rankFromRatio(resize.rank, distance / resize.distance) },
        `size:${resize.id}`,
      );
      return;
    }

    // The selection box, if one is being drawn. Before the pan for the same
    // reason the resize is: the plane must not slide while a box is stretched.
    if (marqueeStart.current) {
      const point = toWorld(event);
      setMarquee({
        x0: marqueeStart.current.x,
        y0: marqueeStart.current.y,
        x1: point.x,
        y1: point.y,
      });
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
    // Still deciding whether this is a drag or a click: wait for real movement,
    // then take the capture on the viewport — so the drag keeps working when the
    // pointer leaves the node, however far it goes — and stop deciding.
    if (drag.pending) {
      const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (moved < DRAG_THRESHOLD) return;
      drag.pending = false;
      try {
        viewportRef.current?.setPointerCapture(drag.pointerId);
      } catch {
        // A pointer that has already been released has no capture to take.
      }
    }
    const point = toWorld(event);
    const dx = point.x - drag.worldX;
    const dy = point.y - drag.worldY;

    // A group drag moves every member by the same delta, in one write and one
    // undo step; a single drag is the same thing with one node.
    if (drag.members) {
      moveMany(
        drag.members.map((m) => ({
          id: m.id,
          patch:
            drag.fields === "offset"
              ? { ox: m.fromA + dx, oy: m.fromB + dy }
              : { x: m.fromA + dx, y: m.fromB + dy },
        })),
        "move-group",
      );
      return;
    }

    update(
      drag.id,
      drag.fields === "offset"
        ? { ox: drag.fromA + dx, oy: drag.fromB + dy }
        : { x: drag.fromA + dx, y: drag.fromB + dy },
      `move:${drag.id}`,
    );
  }

  function endDrag() {
    // Turn the selection box into the group: every node whose centre it covers.
    if (marqueeStart.current && marquee) {
      const minX = Math.min(marquee.x0, marquee.x1);
      const maxX = Math.max(marquee.x0, marquee.x1);
      const minY = Math.min(marquee.y0, marquee.y1);
      const maxY = Math.max(marquee.y0, marquee.y1);
      const hits = nodes
        .filter((n) => {
          const c = positionOf(n);
          return c.x >= minX && c.x <= maxX && c.y >= minY && c.y <= maxY;
        })
        .map((n) => n.id);
      setMulti(new Set(hits));
    }
    marqueeStart.current = null;
    setMarquee(null);
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
  const doc = React.useRef({ nodes, radial, recents });
  const edits = React.useRef(0);
  const savedEdits = React.useRef(0);
  React.useEffect(() => {
    doc.current = { nodes, radial, recents };
    edits.current += 1;
  }, [nodes, radial, recents]);

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

  /**
   * The version of the document this page's edits are based on.
   *
   * A ref rather than state: it is read inside `save` and changes on every
   * successful write, and as state it would rebuild the callback and restart the
   * autosave timer on each save — a timer that resets itself every time it fires
   * is not a debounce any more.
   */
  const version = React.useRef(initialVersion);

  /**
   * Somebody else has written to this map, so nothing here is being saved.
   *
   * Held rather than merely reported, because the alternative is the autosave
   * timer trying again 1.2 seconds later, for as long as the page is open — a
   * failing request every second and a half, against a rate limit shared with
   * everything else this person does.
   */
  const [conflict, setConflict] = React.useState(false);

  const save = React.useCallback(async (force = false) => {
    const at = edits.current;
    setBusy(true);
    try {
      // `radial` goes with the nodes. Left out, a rotation survives on screen
      // until the next reload and then quietly reverts, which reads as the save
      // having failed at something else entirely.
      const result = await updateMindMapData({
        mapId,
        data: doc.current,
        // Omitted on purpose when forcing: no version means no check, which is
        // what "save mine anyway" is.
        version: force ? null : version.current,
      });
      if (!result.success) {
        if (result.error === MAP_MOVED_ON) {
          setConflict(true);
          return;
        }
        toast.error(result.error);
        return;
      }

      version.current = result.data.version;
      setConflict(false);
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
   * people editing one map would overwrite each other continuously, where
   * explicit saving made it rare.
   * Merging two drawings properly is per-node work and still undone; what is
   * done is that the loss is no longer *silent* — a save carries the version it
   * was based on and is refused if that has moved, which is what `conflict`
   * below holds. Refusing is not the same as fixing, and the person is offered
   * both ways out rather than being told which one they wanted.
   */
  React.useEffect(() => {
    if (!canEdit || !dirty || busy || conflict) return;
    const timer = setTimeout(() => void save(), 1200);
    return () => clearTimeout(timer);
  }, [canEdit, dirty, busy, conflict, nodes, radial, recents, save]);

  /**
   * The two ways a page ends.
   *
   * Leaving by a link unmounts this component, and there is still time to write:
   * the request outlives the render tree. Closing the tab does not — a Server
   * Action cannot be awaited from `beforeunload` — so that case can only warn,
   * and the browser shows its own dialog.
   */
  /*
   * The two halves are deliberately not the same test.
   *
   * The warning asks "is there unsaved work here", and a conflict makes the
   * answer *more* emphatically yes — that is the moment the work is least safe.
   * The flush asks "should I write it on the way out", and there the answer is
   * no: that write has been refused once already, and repeating it from an
   * unmount spends a request to be told so again with no page left to say it on.
   */
  const pending = React.useRef({ dirty, conflict, save });
  pending.current = { dirty, conflict, save };
  React.useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!pending.current.dirty) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (pending.current.dirty && !pending.current.conflict) {
        void pending.current.save();
      }
    };
  }, []);

  return (
    <div className="relative z-10 min-h-0 flex-1">
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
        {canEdit ? (
          <span className="pointer-events-auto flex items-center gap-1 rounded-full border bg-background/90 px-1 py-0.5 backdrop-blur">
            {/* Visible as well as bound to a key. A shortcut nobody is told about
                is a shortcut nobody uses, and this one exists because autosave
                took away the old way of undoing a mistake — reloading without
                saving. */}
            <button
              type="button"
              onClick={() => stepHistory(false)}
              disabled={!history.past.length}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
              className="rounded-full p-1 text-muted-foreground disabled:opacity-35"
            >
              <Undo2 className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => stepHistory(true)}
              disabled={!history.future.length}
              title="Redo (Ctrl+Shift+Z)"
              aria-label="Redo"
              className="rounded-full p-1 text-muted-foreground disabled:opacity-35"
            >
              <Redo2 className="size-3.5" />
            </button>
          </span>
        ) : null}

        {/* Move ↔ Select. In Move (the default) a drag pans, as it always has;
            in Select a drag on the plane draws a box round several nodes to move
            them as one. Only where nodes can actually be dragged. Ctrl/⌘-click a
            node adds it to the group in either mode. */}
        {canEdit && movable ? (
          <button
            type="button"
            onClick={() => setSelectMode((v) => !v)}
            aria-pressed={selectMode}
            className={cn(
              "pointer-events-auto flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs backdrop-blur",
              selectMode
                ? "border-primary bg-primary/10 text-primary"
                : "bg-background/90 text-muted-foreground hover:text-foreground",
            )}
            title={
              selectMode
                ? "Select: drag a box to pick several nodes. Click to go back to Move."
                : "Move: drag to pan. Switch to Select to box several nodes and move them together."
            }
          >
            {selectMode ? <BoxSelect className="size-3.5" /> : <Hand className="size-3.5" />}
            {selectMode ? "Select" : "Move"}
            {multi.size > 0 ? ` · ${multi.size}` : ""}
          </button>
        ) : null}

        {/* A whole new main item in this map — a new wheel on a circle map, a
            new top-level node on every other. For an editor, on every type. */}
        {canEdit ? (
          <button
            type="button"
            onClick={addRoot}
            className="pointer-events-auto flex items-center gap-1 rounded-full border bg-background/90 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur hover:text-foreground"
            title={isRadial ? "Add a separate wheel to this map" : "Add a separate main item to this map"}
          >
            <PlusCircle className="size-3.5" />
            {isRadial ? "Wheel" : "Main item"}
          </button>
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

      {/* One column, because both of these can be true at once — an unreadable
          map somebody has started editing while a teammate saves over it — and
          two things pinned to the same corner cover each other. Top *left*: the
          opposite corner is where the save state, undo and zoom already live.

          Not inside the viewport, so a press on a button here never reaches the
          pan handler. That is the dead-button bug this project has had three
          times, and being a sibling rather than a child is what avoids it
          without a `stopPropagation` that would break something else. */}
      <div className="pointer-events-none absolute left-4 top-4 z-20 flex max-w-sm flex-col gap-2">
        {/* Said out loud rather than left to look like a blank map. The stored
            document is still there and this build cannot draw it, so the sheet
            behind is a stand-in — and the one thing that must not happen is
            somebody taking it for the real map and typing over it without ever
            being told there was something underneath. */}
        {unreadable ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-background/90 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
            <span>
              <span className="font-medium text-foreground">
                This map was saved in a format this version cannot read.
              </span>{" "}
              Nothing has been overwritten — what is stored stays as it is until
              you change something here.
            </span>
          </div>
        ) : null}

        {/* Both ways out, and neither chosen for them. Loading the saved one
            throws away what is on this screen; keeping this one throws away what
            was saved. Only the person looking at it knows which is the smaller
            loss — and the one thing that must not happen, one of the two
            disappearing with nobody told, has already been prevented by the time
            this appears.

            Worded without a "them", because the other writer is as likely to be
            this same person in a second tab. */}
        {conflict ? (
          <div className="pointer-events-auto rounded-lg border border-destructive/50 bg-background/95 px-3 py-2 text-xs backdrop-blur">
            <p className="flex items-start gap-2 text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              <span>
                <span className="font-medium text-foreground">{MAP_MOVED_ON}</span>{" "}
                What is on this screen is not being saved.
              </span>
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-md border px-2 py-1 text-muted-foreground"
              >
                Load the saved one
              </button>
              <button
                type="button"
                onClick={() => {
                  setConflict(false);
                  void save(true);
                }}
                className="rounded-md bg-foreground px-2 py-1 text-background"
              >
                Keep mine
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div
        ref={viewportRef}
        className={cn(
          // `select-none` so a drag to pan, a box selection, or a double-click on
          // the plane never highlights the words inside the nodes — which was
          // catching on the text and making moves stutter. The editable text
          // boxes turn selection back on for themselves with `select-text`.
          "absolute inset-0 select-none overflow-hidden",
          selectMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing",
        )}
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
          {isRadial
            ? radialWheels.map((wheel) => (
            <MindMapWheel
              key={wheel.root.id}
              center={wheel.center}
              onMoveStart={onHubMoveStart}
              nodes={wheel.nodes}
              // Each wheel turns on its own axis (its root's `spin`). `start` is
              // exactly the rotation the commit reads back, so nothing may be
              // folded into it — adding half of the old gap once drifted every
              // wheel round by 5° a turn.
              radial={{ ...radial, start: wheel.root.spin ?? radial.start }}
              fresh={fresh}
              canEdit={canEdit}
              canComment={canComment}
              mounted={mounted}
              threadSizes={commentCounts}
              savedIds={savedIds}
              renderWatchers={renderWatchers}
              palette={palette}
              onPickColor={(id) => setColouring(id)}
              focusedNodeId={selected}
              onUpdate={update}
              onSplit={splitInto}
              onAddBranch={addBranch}
              onRemove={remove}
              onSetThickness={setThickness}
              onSetWeights={setWeights}
              onCommitRotation={(start) => {
                // Onto this wheel's root, not the shared setting — so the others
                // stay where they are.
                update(wheel.root.id, { spin: start }, `rotate:${wheel.root.id}`);
              }}
              siblingsOf={siblingsOf}
              onOpenThread={setOpenThread}
              onFocusNode={(id) => {
                setSelected(id);
                if (id) setPresenceFocus(`map:${mapId}:${id}`);
              }}
            />
              ))
            : null}

          {/* One overflowing SVG for every edge. It has no meaningful size of
              its own; `overflow: visible` is what lets a line reach a node far
              outside whatever box the element happens to occupy. */}
          {isRadial ? null : (
          <>
          <svg className="pointer-events-none absolute overflow-visible" aria-hidden="true">
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
                stroke={mindMapColor(palette, 0.65)}
                strokeWidth="2"
                strokeLinecap="round"
              />
            ))}

            {/* Each connector is a run of short round-capped segments whose width
                tapers from the parent end to the child end, so a line between two
                nodes of different sizes is thick at the big one and thin at the
                small one — and grows and shrinks with them. An arrow type gets a
                filled head at the child end, sized to that end's width, in place
                of a marker: a marker scales as a multiple of stroke width and at
                these widths would be enormous. */}
            {routes.map((route) => {
              const arrow =
                style.edge === "arrow" ? arrowHead(route.points, route.w1) : null;
              return (
                <g key={route.id} className={fresh.has(route.id) ? "tf-map-edge-in" : undefined}>
                  {taperedPieces(route.points, route.w0, route.w1).map((piece, index) => (
                    <line
                      key={index}
                      x1={round2(piece.x1)}
                      y1={round2(piece.y1)}
                      x2={round2(piece.x2)}
                      y2={round2(piece.y2)}
                      stroke={mindMapColor(palette, 0.5)}
                      strokeWidth={round2(piece.width)}
                      strokeLinecap="round"
                      strokeDasharray={style.edge === "dashed" ? "7 6" : undefined}
                    />
                  ))}
                  {arrow ? <polygon points={arrow} fill={mindMapColor(palette, 0.6)} /> : null}
                </g>
              );
            })}
          </svg>

          {nodes.map((node) => {
            const isCentre = node.parentId === null;
            const point = positionOf(node);
            const round = style.node === "circle";
            // The same numbers the router used. Anything else here and a line
            // that provably misses a box misses the wrong box.
            const { w, h } = nodeSize(type, node.rank);
            /*
             * The node is drawn at its *normal* size and then scaled, as one
             * unit, to the size its rank asks for.
             *
             * Every part of it used to size itself by its own rule: the font by a
             * floored percentage, the controls by `controlScale`, the padding,
             * border and offsets not at all. So a node shrunk a few steps lost its
             * label — the fixed padding ate the whole box — while its controls
             * piled up over it, and a node grown a few steps wore specks. One
             * scale on one wrapper keeps the words, the emoji, the `+` and `…`,
             * the comment badge and the grip in the proportion they have at normal
             * size, at every size, by construction.
             *
             * Two elements, because the outer one is positioned with Tailwind's
             * translate and entered with a `transform` keyframe, and a scale on
             * that same element would compose with both and pull it off its point.
             * The outer box is the drawn size and takes the pointer; the inner is
             * the normal size, scaled from its top-left corner into that box.
             */
            const base = nodeSize(type, 0);
            const scaled = rankScale(node.rank);
            const threadSize = commentCounts.get(node.id) ?? 0;
            // Cleared optimistically the moment the panel opens; the server call
            // that persists it deliberately does not revalidate.
            const unread = seenNow.has(node.id) ? 0 : (unreadCounts.get(node.id) ?? 0);
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
                  "group absolute -translate-x-1/2 -translate-y-1/2",
                  canEdit && movable && "cursor-grab active:cursor-grabbing",
                  fresh.has(node.id) && "tf-map-node-in",
                )}
                style={{
                  left: point.x,
                  top: point.y,
                  width: w,
                  height: h,
                  /*
                   * Small nodes stack above large ones, and whatever is selected
                   * sits above everything.
                   *
                   * Without this the order is the order of the array, which is
                   * the order they were made in — so a node dragged several ranks
                   * up can bury its neighbours, and the press that should grab it
                   * lands on whichever small node happens to sit on top. From the
                   * outside that reads as "I tried to move the big one and
                   * something else moved", which is how it was reported.
                   *
                   * Sorted by drawn width rather than by rank so the two drawings
                   * agree: rank is a step count, and what buries what is measured
                   * in pixels.
                   */
                  zIndex:
                    selected === node.id || multi.has(node.id)
                      ? 900
                      : Math.round(800 - Math.min(w, 780)),
                }}
              >
              <div
                className={cn(
                  // No `overflow-hidden` here, however tempting: the hover
                  // controls hang outside the box on purpose, and clipping the
                  // node clips them. Overflowing *text* is the textarea's own
                  // problem, and it scrolls.
                  "absolute left-0 top-0 flex items-center justify-center gap-1 border",
                  round
                    ? "rounded-full p-3 text-center"
                    : style.node === "pill"
                      ? "rounded-full px-5 py-2"
                      : style.corner === "sharp"
                        ? "rounded-none px-3 py-2"
                        : "rounded-md px-3 py-2",
                )}
                style={{
                  width: base.w,
                  height: base.h,
                  scale: `${scaled}`,
                  transformOrigin: "0 0",
                  // A bubble map's children are not subordinate to its centre —
                  // the centre is the thing and every bubble round it is one of
                  // its qualities, all of equal standing. Fading them was reading
                  // as a hierarchy the type does not have. Everywhere else the
                  // lighter fill still says "this hangs off that".
                  // A node's own colour if it has been given one, otherwise the
                  // map's wash. The old note here said colouring fills put nine
                  // washes on one backdrop and the map stopped reading as one
                  // drawing — true of nine nodes tinted from a fixed set, and not
                  // an argument against colouring one box deliberately, which is
                  // what a fill is. A node with no fill is untouched.
                  background: node.fill
                    ? fillCss(node.fill)
                    : mindMapColor(palette, isCentre || type === MindMapType.BUBBLE ? 0.24 : 0.12),
                  // 0.35 was too faint to find the edge of a box against the
                  // wash it sits on — a shape you cannot see the extent of reads
                  // as a smudge rather than as a box. Still well under the
                  // centre's 0.7, so the hierarchy survives being legible.
                  //
                  // A filled node takes its edge from its fill instead, because a
                  // fill can land on the backdrop's own colour and a node with no
                  // visible extent is a node nobody can find.
                  borderColor: node.fill
                    ? fillBorder(node.fill)
                    : nodeBorderColor(palette, node.hue, isCentre ? 0.7 : 0.55),
                  borderWidth: node.fill || (node.hue !== null && node.hue !== undefined) ? 2 : isCentre ? 2 : 1.5,
                  // The lit ring: yours white, everyone else's their own colour.
                  // A box-shadow rather than an extra element, so it follows the
                  // node's own corner radius without anything restating it — and
                  // so it cannot sit over the node and swallow a click.
                  // The selected node keeps its ring and gains a soft glow in the
                  // map's colour — a highlight without a scale bump, which would
                  // move the node and re-route every edge touching it.
                  boxShadow:
                    selected === node.id
                      ? `${ringFor(node.id, true, scaled)}, 0 8px 34px -6px ${mindMapColor(palette, 0.6)}`
                      : ringFor(node.id, multi.has(node.id), scaled),
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
                    style={{ border: `1px solid ${mindMapColor(palette, 0.45)}` }}
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
                    // A plain size. The whole node is scaled as one unit, so the
                    // glyph keeps its proportion at every size without a rule of
                    // its own — it once had `Math.max(0.8, shrink) * 90%`, which
                    // applied the rank's scale a second time on top of the node's
                    // and grew the glyph as the square of the node until it
                    // swallowed the box.
                    style={{ fontSize: "0.9em" }}
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
                  onChange={(event) =>
                    update(node.id, { text: event.target.value }, `text:${node.id}`)
                  }
                  className={cn(
                    // `tf-map-node-text` centres the words vertically as well as
                    // horizontally. A textarea fills its box and starts at the
                    // top, which put every one-line label against the ceiling of
                    // its own shape — most visible on a circle, where the top of
                    // the box is the narrowest part of the drawing.
                    // `select-text` turns selection back on inside the editable
                    // box — the canvas around it is `select-none` to stop a drag
                    // catching on the words.
                    "tf-map-node-text h-full w-full resize-none select-text bg-transparent text-center text-[1em] leading-snug outline-none placeholder:text-muted-foreground",
                    isCentre && "font-semibold",
                  )}
                  // The ink goes on the words, not on the node.
                  //
                  // It was on the node's own style at first, and `color`
                  // inherits: the `+`, the `…` and the comment badge all sit
                  // *inside* the node, so a pale fill turned every white glyph on
                  // them dark — on their own dark chips, which is invisible
                  // rather than merely wrong. The one element that has to answer
                  // to the fill is the one drawn on top of it.
                  //
                  // The face — bold, italic, underline, font — and the size
                  // multiplier are the node's text style. Size as `em` so it
                  // rides on the `1em` the node's rank already sets.
                  style={{
                    ...textFaceCss(node),
                    fontSize: fontScaleOf(node) !== 1 ? `${fontScaleOf(node)}em` : undefined,
                    color: node.fill ? fillInk(node.fill) : undefined,
                  }}
                />

                {/* Who else is on this node, and how much has been said about
                    it. Both sit outside the box: inside, they would compete with
                    the words on a node that may be several ranks small, and the
                    box is a fixed size the router depends on. */}
                <span
                  className="absolute -bottom-3 left-1"
                >
                  {renderWatchers(node.id)}
                </span>

                {savedIds.has(node.id) && (threadSize > 0 || (mounted && canComment)) ? (
                  <button
                    type="button"
                    aria-label={
                      unread > 0
                        ? `${unread} unread of ${threadSize} comments on this node`
                        : threadSize > 0
                          ? `${threadSize} comments on this node`
                          : "Comment on this node"
                    }
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => openComments(node.id)}
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
                      // Something here has been said since you last looked.
                      unread > 0 && "tf-unread",
                    )}
                    style={{ borderColor: mindMapColor(palette, 0.5) }}
                  >
                    <MessageSquare className="size-3" />
                    {/* The unread count while there is one, the whole thread
                        otherwise. The number and the red ring then say the same
                        thing — "three new" — which is how the notification bell
                        in this app already behaves. A badge whose pulse means
                        "new" beside a number meaning "in total" invites reading
                        the total as the new. */}
                    {unread > 0 ? unread : threadSize > 0 ? threadSize : null}
                  </button>
                ) : null}

                {/* The plain buttons here swallow their own `pointerdown`; the
                    Radix triggers deliberately do not.

                    A menu trigger's press is the library's to handle — it opens
                    the menu, seeds focus and arms the dismiss layer — and
                    stopping it there was tried and made the items inside the
                    menu unreachable. The node's own handler already stops every
                    press before the viewport can turn it into a pan, which is
                    all the triggers ever needed.

                    Menus are mounted after hydration, never rendered on the
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
                      <button
                        type="button"
                        aria-label="Add a connected node"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => addChild(node, node.rank)}
                        className="rounded-full border bg-background p-1 shadow-sm"
                        style={{ borderColor: mindMapColor(palette, 0.5) }}
                      >
                        <Plus className="size-3.5" />
                      </button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="More for this node"
                          className="rounded-full border bg-background p-1 shadow-sm"
                          style={{ borderColor: mindMapColor(palette, 0.5) }}
                        >
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-64">
                        {/* The Word-style text controls, and the emoji folded into
                            one submenu — both shared with the wheel's menu, so a
                            box and a branch are styled and marked the same way. */}
                        <TextSubmenu
                          node={node}
                          onChange={(patch) => update(node.id, patch, `style:${node.id}`)}
                        />
                        <EmojiSubmenu
                          emoji={node.emoji}
                          onPick={(glyph) => update(node.id, { emoji: glyph })}
                        />

                        <DropdownMenuSeparator />
                        {/* Every item on these menus fires `onSelect`, not
                            `onClick`.

                            `onClick` is a DOM prop Radix composes onto the item;
                            `onSelect` is the primitive's own contract for "this
                            was chosen", and it is what Radix itself dispatches.
                            With `onClick` the whole menu was inert on this canvas
                            — the item took the press and the handler never ran,
                            while the emoji buttons in the same menu worked
                            because they are plain buttons. Whatever swallows the
                            click here, the item's own event does not go through
                            it. */}
                        {/* One item rather than a row of swatches. A colour is
                            now a mix of up to four with a direction, which does
                            not fit in a menu — and the menu closes over the node
                            you are trying to judge the colour against. */}
                        <DropdownMenuItem onSelect={() => setColouring(node.id)}>
                          <span
                            aria-hidden
                            className="size-4 rounded border"
                            style={{
                              background: node.fill
                                ? fillCss(node.fill)
                                : mindMapColor(palette, 0.9),
                            }}
                          />
                          Change colour
                        </DropdownMenuItem>

                        {/* Comments reachable from the menu as well as from the
                            badge. The badge is the one that can *tell* you there
                            is something to read; the menu is where somebody goes
                            looking when there is nothing on the node yet, and a
                            control that only appears on hover once a thread
                            exists is not somewhere anybody starts one. */}
                        {savedIds.has(node.id) && canComment ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => openComments(node.id)}>
                              <MessageSquare />
                              {threadSize > 0 ? `Comments (${threadSize})` : "Add a comment"}
                            </DropdownMenuItem>
                          </>
                        ) : null}

                        {/* A tree node dragged away from its place can be sent
                            back. Without this, the only way to undo a drag made
                            an hour ago is to line it up again by eye. */}
                        {isMovableLayout(type) && (node.ox || node.oy) ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() =>
                                update(node.id, { ox: null, oy: null }, `move:${node.id}`)
                              }
                            >
                              <Undo2 /> Put back in the layout
                            </DropdownMenuItem>
                          </>
                        ) : null}

                        {!isCentre ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => remove(node.id)}>
                              <Trash2 /> Remove this node
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ) : null}

                {/* The one resize control: drag it out to enlarge, in to shrink.

                    A visible handle again, on its own. Two step buttons stood
                    here for a while and the owner asked for the single draggable
                    grip back — the gesture is the whole affordance, and a handle
                    you can see is one you know to grab. Shown on hover like the
                    rest of the cluster so a corner at rest stays clean.

                    An element rather than a hit test inside the node's own
                    `pointerdown` for two reasons that have each cost time here: it
                    takes the pointer capture, and it swallows the press before the
                    viewport can turn it into a pan.

                    A round node's bounding-box corner sits outside the circle, so
                    the handle is pulled in to 45° round the rim, where the ink
                    actually is. */}
                {canEdit ? (
                  <span
                    role="presentation"
                    aria-label="Drag to resize this node"
                    title="Kéo ra để phóng to, kéo vào để thu nhỏ"
                    onPointerDown={(event) => onResizePointerDown(event, node)}
                    className="absolute flex size-5 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize touch-none items-center justify-center rounded-full border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                    style={{
                      left: round ? "85.4%" : "100%",
                      top: round ? "85.4%" : "100%",
                      borderColor: mindMapColor(palette, 0.5),
                    }}
                  >
                    <Scaling className="size-3" />
                  </span>
                ) : null}
              </div>

              {/* The remaining-task badge, on the outer box so it does not scale
                  with the node and never intercepts a press. Only shown once the
                  node has open tasks — a "0 Task" on every node would bury the
                  drawing; the count starting from zero lives in the info panel. */}
              {openTaskCount(node) > 0 ? (
                <span
                  className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full border bg-background/90 px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm"
                  style={{ borderColor: mindMapColor(palette, 0.4) }}
                >
                  {formatTaskCount(openTaskCount(node))}
                </span>
              ) : null}
              </div>
            );
          })}
          </>
          )}
        </div>
      </div>

      {/* The selection box while it is being dragged. Drawn in screen space
          (world × scale + pan) as a sibling of the viewport, so its border stays
          one pixel at any zoom, and it never intercepts a press. */}
      {marquee ? (
        <div
          className="pointer-events-none absolute z-20 rounded-sm border-2 border-primary/70 bg-primary/10"
          style={{
            left: Math.min(marquee.x0, marquee.x1) * scale + offset.x,
            top: Math.min(marquee.y0, marquee.y1) * scale + offset.y,
            width: Math.abs(marquee.x1 - marquee.x0) * scale,
            height: Math.abs(marquee.y1 - marquee.y0) * scale,
          }}
        />
      ) : null}

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

      {/* Same reasoning as the thread panel above, and the same guard: a colour
          panel open on a node somebody has just deleted is a panel colouring
          nothing. */}
      {colouring && nodes.some((node) => node.id === colouring) ? (
        <MindMapColorPanel
          /*
           * On the far side of the screen from the node being coloured.
           *
           * It docked to the left, always. That put it up to a whole viewport
           * away from the node just clicked, and "Change colour" was reported as
           * doing nothing — three times — by somebody looking at the node. A
           * panel nobody finds is indistinguishable from a panel that never
           * opened, and the console showed the press reaching the menu item
           * perfectly well.
           *
           * The far side rather than the near one: the near side would cover the
           * thing whose colour is being judged.
           */
          side={
            positionOf(nodes.find((node) => node.id === colouring)!).x * scale + offset.x >
            (viewportRef.current?.clientWidth ?? 0) / 2
              ? "left"
              : "right"
          }
          label={nodes.find((node) => node.id === colouring)?.text ?? ""}
          fill={nodes.find((node) => node.id === colouring)?.fill ?? null}
          recents={recents}
          onApply={(fill) => {
            update(colouring, { fill }, `fill:${colouring}`);
            // Remembered as the colour is applied, not when the panel closes:
            // the panel can be dismissed by pressing Escape, and a colour you
            // chose and looked at is one you may want again either way.
            setRecents((list) => rememberFill(list, fill));
          }}
          onClear={() => update(colouring, { fill: null }, `fill:${colouring}`)}
          onClose={() => setColouring(null)}
        />
      ) : null}

      {/* Clicking a node opens its info: its title, how many tasks it has left,
          and its checklist. It yields to the colour and comment panels so only
          one thing ever docks on the right at a time, and closes with the node
          it describes. */}
      {selected && !colouring && !openThread && nodes.some((node) => node.id === selected)
        ? (() => {
            const index = nodes.findIndex((node) => node.id === selected);
            return (
              <MindMapNodeInfo
                node={nodes[index]}
                typeLabel={MIND_MAP_META[type].label}
                index={index + 1}
                total={nodes.length}
                related={nodes
                  .filter((n) => n.parentId === selected)
                  .map((n) => ({ id: n.id, text: n.text }))}
                canEdit={canEdit}
                onChangeTasks={(tasks) => update(selected, { tasks }, `tasks:${selected}`)}
                onChangeNote={(note) => update(selected, { note }, `note:${selected}`)}
                onFocus={(id) => {
                  setSelected(id);
                  setPresenceFocus(`map:${mapId}:${id}`);
                }}
                onPrev={() =>
                  setSelected(nodes[(index - 1 + nodes.length) % nodes.length].id)
                }
                onNext={() => setSelected(nodes[(index + 1) % nodes.length].id)}
                onClose={() => setSelected(null)}
              />
            );
          })()
        : null}
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * A coordinate rounded for an SVG attribute, so the string is identical on the
 * server and the client. A full-precision float can serialise a unit in the last
 * place apart between the two, which hydration reports as a mismatch it will not
 * patch; hundredths are far finer than a pixel and the same either side. The
 * wheel rounds its own coordinates for exactly this reason.
 */
function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * How thick a connector is where it meets a node — a fraction of the node's own
 * drawn size, so the line is proportional to the box it touches and the whole
 * edge tapers between a small node and a big one. The shorter side, so a wide
 * box and a round node of the same rank read alike; floored so the thinnest edge
 * is still visible and capped so a huge node cannot draw a slab.
 */
const EDGE_WIDTH_FACTOR = 0.05;
function edgeWidthFor(rect: Rect) {
  return clamp(EDGE_WIDTH_FACTOR * Math.min(rect.w, rect.h), 1.5, 60);
}

/**
 * A filled arrowhead at the last point of a route, pointing along its final
 * segment, sized to the width the connector has there.
 *
 * Drawn rather than left to an SVG `marker`, because a marker is measured in
 * multiples of the stroke width and the tapered stroke can be tens of pixels
 * wide at the child end — a marker would be enormous. Returns the three points of
 * the triangle, or null when the route is too short to have a direction.
 */
function arrowHead(points: Point[], endWidth: number): string | null {
  if (points.length < 2) return null;
  const tip = points[points.length - 1];
  const prev = points[points.length - 2];
  const dx = tip.x - prev.x;
  const dy = tip.y - prev.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.001) return null;

  const ux = dx / dist;
  const uy = dy / dist;
  const half = Math.max(4, endWidth * 1.5);
  const length = half * 1.9;
  const baseX = tip.x - ux * length;
  const baseY = tip.y - uy * length;
  // Perpendicular to the direction of travel.
  const nx = -uy;
  const ny = ux;

  const left = `${round2(baseX + nx * half)},${round2(baseY + ny * half)}`;
  const right = `${round2(baseX - nx * half)},${round2(baseY - ny * half)}`;
  return `${round2(tip.x)},${round2(tip.y)} ${left} ${right}`;
}
