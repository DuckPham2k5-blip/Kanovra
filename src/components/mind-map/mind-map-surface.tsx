"use client";

import type { MindMapType } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { MindMapCanvas } from "@/components/mind-map/mind-map-canvas";
import { MindMapPalettePicker } from "@/components/mind-map/mind-map-palette-picker";
import { Button } from "@/components/ui/button";
import type { CanvasNode, RadialSettings } from "@/lib/mind-map-canvas";
import { type MapPalette, type MapTone, readPalette } from "@/lib/mind-map-palette";
import { defaultPalette, mindMapBackdrop, mindMapColor } from "@/lib/mind-maps";
import type { AvatarUser } from "@/components/shared/user-avatar";
import type { NodeComment } from "@/components/mind-map/mind-map-node-comments";
import { setMindMapPalette } from "@/server/actions/mind-map";

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
export function MindMapSurface({
  slug,
  mapId,
  type,
  title,
  typeLabel,
  typeQuestion,
  storedHue,
  storedTone,
  canEdit,
  canComment,
  initialNodes,
  initialRadial,
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
  canEdit: boolean;
  canComment: boolean;
  initialNodes: CanvasNode[];
  initialRadial: RadialSettings;
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

  const palette: MapPalette = readPalette(fallbackHue, stored.hue, stored.tone);
  const isDefault = stored.hue === null;

  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const save = React.useCallback(
    (next: { hue: number | null; tone: MapTone | null }) => {
      setStored(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
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
      }, 600);
    },
    [mapId, saved],
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
      className="fixed inset-0 z-40 flex flex-col"
      style={{ background: `${mindMapBackdrop(palette)}, hsl(var(--background))` }}
    >
      <header
        className="flex shrink-0 items-center gap-3 border-b px-4 py-3"
        style={{ borderColor: mindMapColor(palette, 0.24) }}
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

        <MindMapPalettePicker
          palette={palette}
          isDefault={isDefault}
          disabled={!canEdit}
          onChange={(next) => save({ hue: next.hue, tone: next.tone })}
          onReset={() => save({ hue: null, tone: null })}
        />
      </header>

      <MindMapCanvas
        mapId={mapId}
        type={type}
        palette={palette}
        title={title}
        initialNodes={initialNodes}
        initialRadial={initialRadial}
        canEdit={canEdit}
        canComment={canComment}
        comments={comments}
        members={members}
        reads={reads}
      />
    </div>
  );
}
