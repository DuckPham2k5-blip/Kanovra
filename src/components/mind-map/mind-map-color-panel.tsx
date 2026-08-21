"use client";

import { Plus, X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  FILL_SWATCHES,
  fillBorder,
  fillCss,
  fillInk,
  type NodeFill,
} from "@/lib/mind-map-fill";
import { cn } from "@/lib/utils";

/**
 * Picks the colour of one node.
 *
 * A panel beside the map, not a dialog over it. Two reasons, and the first is a
 * bug this shipped as: opening a Radix `Dialog` from an item inside a Radix
 * dropdown puts two dismissable layers in the same click — the menu closing and
 * the dialog opening — and the control did nothing at all. The comment panel is
 * opened from that same menu and has always worked, and the only thing it does
 * differently is being a plain element. So this is one too.
 *
 * The second reason is why it should have been one anyway: a colour is judged
 * against the drawing it sits in, and a modal dims the drawing and blocks the
 * map behind it. Here the map stays lit, clickable and pannable while the panel
 * is open.
 *
 * One panel for the whole canvas rather than one per node — an arbitrary number
 * of Radix triggers is the worst possible shape for the `useId` counter that has
 * already produced hydration warnings in this map.
 */

const DIRECTIONS = [
  { angle: 0, label: "→" },
  { angle: 45, label: "↘" },
  { angle: 90, label: "↓" },
  { angle: 135, label: "↙" },
  { angle: 180, label: "←" },
  { angle: 225, label: "↖" },
  { angle: 270, label: "↑" },
  { angle: 315, label: "↗" },
];

const DEFAULT_FILL: NodeFill = { colors: ["#60a5fa"], angle: 135 };

export function MindMapColorPanel({
  label,
  fill,
  recents,
  onApply,
  onClear,
  onClose,
}: {
  /** The node's own words, so the preview shows the thing being coloured. */
  label: string;
  fill: NodeFill | null;
  recents: NodeFill[];
  onApply: (fill: NodeFill) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const current = fill ?? DEFAULT_FILL;
  // Which stop the swatches paint. Kept here and not derived, because with two
  // colours on screen a click has to mean one of them and the answer is
  // "whichever you last pointed at".
  const [active, setActive] = React.useState(0);
  const stop = Math.min(active, current.colors.length - 1);

  function setColor(hex: string) {
    const colors = [...current.colors];
    colors[stop] = hex;
    onApply({ ...current, colors });
  }

  function addStop() {
    if (current.colors.length >= 4) return;
    const colors = [...current.colors, current.colors[current.colors.length - 1]];
    setActive(colors.length - 1);
    onApply({ ...current, colors });
  }

  function removeStop(index: number) {
    if (current.colors.length <= 1) return;
    const colors = current.colors.filter((_, i) => i !== index);
    setActive(0);
    onApply({ ...current, colors });
  }

  return (
    <aside className="tf-pop-in absolute bottom-4 left-4 top-4 z-20 flex w-72 flex-col gap-3 overflow-y-auto rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Colour</p>
          <p className="truncate text-xs text-muted-foreground">{label || "Untitled"}</p>
        </div>
        <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onClose}>
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </Button>
      </header>

      <div
        className="flex h-14 items-center justify-center rounded-lg border-2 px-3 text-sm font-medium"
        style={{
          background: fillCss(current),
          borderColor: fillBorder(current),
          color: fillInk(current),
        }}
      >
        <span className="truncate">{label || "Untitled"}</span>
      </div>

      {/* The mix. One swatch per colour in it, and the one you last touched is
          what the palette below paints. */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground">
            {current.colors.length > 1 ? "Blend" : "Colour"}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={addStop}
            disabled={current.colors.length >= 4}
          >
            <Plus className="size-3" /> Add
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {current.colors.map((colour, index) => (
            <div key={index} className="relative">
              <button
                type="button"
                aria-label={`Colour ${index + 1}`}
                aria-pressed={index === stop}
                onClick={() => setActive(index)}
                className={cn(
                  "size-9 rounded-lg border-2",
                  index === stop ? "border-foreground" : "border-transparent",
                )}
                style={{ background: colour }}
              />
              {current.colors.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Remove colour ${index + 1}`}
                  onClick={() => removeStop(index)}
                  className="absolute -right-1.5 -top-1.5 rounded-full border bg-background p-0.5"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {current.colors.length > 1 ? (
        <section className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Direction</p>
          <div className="flex flex-wrap gap-1">
            {DIRECTIONS.map(({ angle, label: arrow }) => (
              <button
                key={angle}
                type="button"
                aria-label={`${angle} degrees`}
                aria-pressed={current.angle === angle}
                onClick={() => onApply({ ...current, angle })}
                className={cn(
                  "size-8 rounded-md border text-sm transition-colors",
                  current.angle === angle
                    ? "border-primary bg-primary/10 text-primary"
                    : "hover:bg-accent",
                )}
              >
                {arrow}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {recents.length > 0 ? (
        <section className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Used on this map</p>
          <div className="flex flex-wrap gap-1.5">
            {recents.map((item, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Reuse ${item.colors.join(" to ")}`}
                title={item.colors.join(" → ")}
                onClick={() => {
                  setActive(0);
                  onApply(item);
                }}
                className="size-7 rounded-md border border-border/60"
                style={{ background: fillCss(item) }}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">Palette</p>
        <div className="grid grid-cols-8 gap-1">
          {FILL_SWATCHES.map((hex) => (
            <button
              key={hex}
              type="button"
              aria-label={hex}
              title={hex}
              onClick={() => setColor(hex)}
              className={cn(
                "size-6 rounded",
                current.colors[stop] === hex && "ring-2 ring-ring ring-offset-1 ring-offset-background",
              )}
              style={{ background: hex }}
            />
          ))}
        </div>
      </section>

      <Button variant="ghost" size="sm" className="mt-auto" disabled={!fill} onClick={onClear}>
        Back to the map&apos;s colour
      </Button>
    </aside>
  );
}
