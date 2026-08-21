"use client";

import { Plus, X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
 * One dialog for the whole canvas rather than one per node, for the reason the
 * comment panel is also one: a canvas holds an arbitrary number of nodes, and an
 * arbitrary number of Radix triggers is the worst possible shape for the `useId`
 * counter that has already produced hydration warnings here.
 *
 * Every change applies straight away. A colour is a thing you judge by looking
 * at it on the map behind this panel, and an OK button would mean choosing blind
 * and then finding out.
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

export function MindMapColorDialog({
  open,
  label,
  fill,
  recents,
  onApply,
  onClear,
  onOpenChange,
}: {
  open: boolean;
  /** The node's own words, so the preview shows the thing being coloured. */
  label: string;
  fill: NodeFill | null;
  recents: NodeFill[];
  onApply: (fill: NodeFill) => void;
  onClear: () => void;
  onOpenChange: (open: boolean) => void;
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Colour</DialogTitle>
          <DialogDescription>
            One colour, or several blended in a direction you choose.
          </DialogDescription>
        </DialogHeader>

        <div
          className="flex h-16 items-center justify-center rounded-lg border-2 px-4 text-sm font-medium"
          style={{
            background: fillCss(current),
            borderColor: fillBorder(current),
            color: fillInk(current),
          }}
        >
          <span className="truncate">{label || "Untitled"}</span>
        </div>

        {/* The mix. One row per colour in it, and the row you last touched is
            the one the swatches below paint. */}
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
              <Plus className="size-3" /> Add a colour
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
                    "size-10 rounded-lg border-2 transition-transform",
                    index === stop ? "border-foreground" : "border-transparent",
                  )}
                  style={{ background: colour }}
                />
                {current.colors.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Remove colour ${index + 1}`}
                    onClick={() => removeStop(index)}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-background p-0.5 shadow"
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
                  className="size-7 rounded-md border border-border/60 transition-transform hover:scale-110"
                  style={{ background: fillCss(item) }}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Palette</p>
          <div className="grid grid-cols-12 gap-1">
            {FILL_SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={hex}
                title={hex}
                onClick={() => setColor(hex)}
                className={cn(
                  "size-6 rounded transition-transform hover:scale-110",
                  current.colors[stop] === hex && "ring-2 ring-ring ring-offset-1 ring-offset-popover",
                )}
                style={{ background: hex }}
              />
            ))}
          </div>
        </section>

        <Button variant="ghost" size="sm" disabled={!fill} onClick={onClear}>
          Back to the map&apos;s colour
        </Button>
      </DialogContent>
    </Dialog>
  );
}
