"use client";

import type { MindMapType } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { MindMapCanvas } from "@/components/mind-map/mind-map-canvas";
import { MindMapAppearancePicker } from "@/components/mind-map/mind-map-appearance-picker";
import { Button } from "@/components/ui/button";
import type { CanvasNode, RadialSettings } from "@/lib/mind-map-canvas";
import {
  readScenery,
  sceneryCss,
  sceneryInk,
  sceneryMotion,
  type MapBackground,
} from "@/lib/map-backgrounds";
import {
  choiceFromSwitch,
  motionClass,
  motionIsOn,
  MOTION_KEY,
  readMotionChoice,
  type MotionChoice,
} from "@/lib/map-motion";
import type { NodeFill } from "@/lib/mind-map-fill";
import { type MapPalette, type MapTone, readPalette } from "@/lib/mind-map-palette";
import { defaultPalette, mindMapBackdrop, mindMapColor } from "@/lib/mind-maps";
import type { AvatarUser } from "@/components/shared/user-avatar";
import type { NodeComment } from "@/components/mind-map/mind-map-node-comments";
import { setMindMapBackground, setMindMapPalette } from "@/server/actions/mind-map";

/**
 * The map's own screen: its backdrop, its header, and the canvas.
 *
 * This used to be the page itself, and it moved into a client component for one
 * reason: the colour has to change *while* you drag the hue bar. Every surface
 * here is painted from the palette — the backdrop, the header rule, the edges,
 * the nodes, the wheel — so the palette has to live above all of them, and a
 * server component cannot hold a value that moves sixty times a second.
 *
 * The write is debounced and the drawing is not. Dragging a slider is one
 * decision expressed as two hundred values, and sending each of them would spend
 * a signed-in user's whole rate-limit allowance on one gesture — the same reason
 * a bulk edit is one request rather than a loop.
 */
/**
 * Where each light starts, how big it is, and its own rhythm.
 *
 * The duration and delay are per light rather than per keyframe, so all six
 * motion styles get three lights moving at different rates from one set of
 * keyframes. At matching speeds three blobs read as a single object sliding
 * about — the failure the star field had when every mote twinkled on one rate.
 */
const DRIFTS = [
  { key: "a", size: "46vw", left: "-10vw", top: "-14vh", dur: "18s", delay: "0s" },
  { key: "b", size: "38vw", left: "58vw", top: "-6vh", dur: "24s", delay: "-6s" },
  { key: "c", size: "44vw", left: "16vw", top: "52vh", dur: "30s", delay: "-13s" },
];

export function MindMapSurface({
  slug,
  mapId,
  type,
  title,
  typeLabel,
  typeQuestion,
  storedHue,
  storedTone,
  storedBackgroundKind,
  storedBackgroundValue,
  canEdit,
  canComment,
  initialNodes,
  initialRadial,
  initialRecents,
  comments,
  members,
  reads,
}: {
  slug: string;
  mapId: string;
  type: MindMapType;
  title: string;
  typeLabel: string;
  typeQuestion: string;
  /** Straight off the row: null means "the colour this type is born with". */
  storedHue: number | null;
  storedTone: string | null;
  storedBackgroundKind: string | null;
  storedBackgroundValue: string | null;
  canEdit: boolean;
  canComment: boolean;
  initialNodes: CanvasNode[];
  initialRadial: RadialSettings;
  initialRecents: NodeFill[];
  comments: NodeComment[];
  members: AvatarUser[];
  reads: Record<string, string>;
}) {
  const fallbackHue = defaultPalette(type).hue;

  // Held as the two nullable columns rather than as a palette, because "no
  // colour of its own" is a state the picker can return to and a palette cannot
  // express — every palette is some colour.
  const [stored, setStored] = React.useState<{ hue: number | null; tone: MapTone | null }>({
    hue: storedHue,
    tone: readPalette(fallbackHue, storedHue, storedTone).tone,
  });
  const [saved, setSaved] = React.useState(stored);
  const [background, setBackground] = React.useState<{ kind: string | null; value: string }>({
    kind: storedBackgroundKind,
    value: storedBackgroundValue ?? "",
  });

  const scenery = readScenery(background.kind, background.value);
  const surface = sceneryCss(scenery);
  const ink = sceneryInk(scenery);

  /*
   * Whether the lights drift, as the person looking has decided.
   *
   * Read after mount rather than during the render: `localStorage` does not
   * exist on the server, and one frame of a decorative layer starting in its
   * default state costs nothing next to a hydration mismatch on every map.
   */
  const [choice, setChoice] = React.useState<MotionChoice>("system");

  React.useEffect(() => {
    setChoice(readMotionChoice(window.localStorage.getItem(MOTION_KEY)));
  }, []);

  const setMotion = React.useCallback((on: boolean) => {
    const next = choiceFromSwitch(on);
    setChoice(next);
    window.localStorage.setItem(MOTION_KEY, next);
  }, []);


  const palette: MapPalette = readPalette(fallbackHue, stored.hue, stored.tone);
  const isDefault = stored.hue === null;

  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const save = React.useCallback(
    (next: { hue: number | null; tone: MapTone | null }, continuous = false) => {
      setStored(next);
      if (timer.current) clearTimeout(timer.current);

      const write = async () => {
        const result = await setMindMapPalette({
          mapId,
          hue: next.hue,
          // A hue with no tone is a map that has been given a colour and never a
          // tone; it draws vivid, so that is what gets written.
          tone: next.hue === null ? null : (next.tone ?? "vivid"),
        });
        if (result.success) {
          setSaved(next);
          return;
        }
        // Put the drawing back to the last colour the server accepted, or the
        // screen keeps showing a choice that was never stored.
        setStored(saved);
        toast.error(result.error);
      };

      /*
       * A click is written at once; only a drag waits.
       *
       * They shared the debounce at first, and that lost colours: choosing a
       * preset and leaving the map within 600ms cleared the timer on unmount
       * with nothing sent. One press is one decision and there is nothing to
       * batch — the debounce exists for the hue bar, which reports every pixel.
       */
      if (!continuous) {
        void write();
        return;
      }
      timer.current = setTimeout(() => void write(), 600);
    },
    [mapId, saved],
  );

  /**
   * Applies scenery, and answers with what went wrong rather than throwing it at
   * a toast. A rejected link has to be reported next to the box it was typed
   * into, which is inside the picker.
   *
   * A preset is drawn before the server hears about it — it is a known id and
   * there is nothing to check. A link is not: it is shown only once the
   * server has fetched it and found a picture, or the map spends a moment
   * wearing an address that turns out to be an HTML page.
   */
  const applyBackground = React.useCallback(
    async (kind: "preset" | "url" | null, value: string, preset?: MapBackground) => {
      const previous = background;
      if (kind !== "url") {
        setBackground({ kind, value });
        // Scenery names the accent that suits it, so choosing one sets both.
        if (preset) save({ hue: preset.palette.hue, tone: preset.palette.tone });
      }

      const result = await setMindMapBackground({ mapId, kind, value });
      if (result.success) {
        if (kind === "url") setBackground({ kind, value });
        return null;
      }
      setBackground(previous);
      return result.error;
    },
    [background, mapId, save],
  );

  return (
    /*
     * Covers the shell rather than replacing it. A map is a whole-screen
     * document — the sidebar and the top bar are navigation for a workspace,
     * and they crowd a canvas that wants every pixel.
     *
     * A fixed overlay rather than a route outside the app group: the shell
     * keeps running underneath, which is what carries presence, the realtime
     * stream and the ⌘K palette. Escaping the layout would have meant
     * rebuilding all three for one page.
     */
    <div
      className={`fixed inset-0 z-40 flex flex-col tf-motion-${sceneryMotion(scenery)} ${motionClass(choice)}`}
      style={
        surface ?? { background: `${mindMapBackdrop(palette)}, hsl(var(--background))` }
      }
    >
      {/* Three soft lights drifting behind the drawing.
       *
       * On the surface layer, outside the pan-and-zoom transform: the scenery
       * stays put while the drawing moves over it, which is what was asked for.
       *
       * Painted in the map's own accent so it belongs to whatever scenery is
       * behind it, and quieter on light scenery — the same glow that reads as a
       * glow on a nebula reads as a stain on paper.
       *
       * `z-0` here with the content lifted to `z-10`. At `-z-10` a decorative
       * layer lands in the root stacking context and paints behind the shell's
       * own opaque background, invisible at any opacity.
       */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {DRIFTS.map((drift) => (
          <span
            key={drift.key}
            className="tf-map-drift"
            style={{
              "--tf-dur": drift.dur,
              "--tf-delay": drift.delay,
              background: mindMapColor(palette, scenery?.kind === "preset" && scenery.background.scheme === "light" ? 0.22 : 0.5),
              width: drift.size,
              height: drift.size,
              left: drift.left,
              top: drift.top,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* A strip behind the header, not a change to it. The scenery can be a
          photograph nobody here has seen, so the bar reads as a bar rather than
          as words floating on whatever happens to be under them. */}
      <header
        className="relative z-10 flex shrink-0 items-center gap-3 border-b bg-background/70 px-4 py-3 backdrop-blur"
        style={{ borderColor: mindMapColor(palette, 0.24), color: ink }}
      >
        <Button asChild variant="outline" size="sm" className="tf-bar-control">
          <Link href={`/w/${slug}/maps`}>
            <ArrowLeft className="size-4" /> Back
          </Link>
        </Button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {typeLabel} · {typeQuestion}
          </p>
        </div>

        <MindMapAppearancePicker
          scenery={scenery}
          palette={palette}
          isDefaultPalette={isDefault}
          disabled={!canEdit}
          onBackground={applyBackground}
          motionOn={motionIsOn(choice)}
          onMotionChange={setMotion}
          onPalette={(next, options) =>
            save({ hue: next.hue, tone: next.tone }, options?.continuous)
          }
          onResetPalette={() => save({ hue: null, tone: null })}
        />
      </header>

      <MindMapCanvas
        mapId={mapId}
        type={type}
        palette={palette}
        title={title}
        initialNodes={initialNodes}
        initialRadial={initialRadial}
        initialRecents={initialRecents}
        canEdit={canEdit}
        canComment={canComment}
        comments={comments}
        members={members}
        reads={reads}
      />
    </div>
  );
}
