"use client";

import { Check, Palette, RotateCcw } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  MAP_PRESETS,
  MAP_TONES,
  type MapPalette,
  type MapTone,
} from "@/lib/mind-map-palette";
import { mindMapColor } from "@/lib/mind-maps";
import { cn } from "@/lib/utils";

/**
 * Chooses the colour a map is drawn in.
 *
 * Three ways in, in the order people want them: a named colour, a hue anywhere
 * on the circle, and the tone that hue runs at. The presets are first because a
 * bar of 360 hues answers "what colour" and most people arrive wanting "which
 * colour is good"; the bar is there for the rest.
 *
 * What it deliberately is *not* is a colour field. Every shade on a map is
 * derived from the hue — see `mind-map-palette.ts` — and a free colour breaks
 * the distances that keep a label readable on its own segment.
 */
export function MindMapPalettePicker({
  palette,
  isDefault,
  disabled,
  onChange,
  onReset,
}: {
  palette: MapPalette;
  /** Whether the map is still wearing the colour its type was born with. */
  isDefault: boolean;
  disabled?: boolean;
  onChange: (palette: MapPalette) => void;
  onReset: () => void;
}) {
  /*
   * Radix numbers its popovers with `useId`, and a count that differs between
   * the server render and hydration warns on every trigger after the first. The
   * map canvas already gates its own menus on a mounted flag for this; one more
   * trigger on the same page is one more chance to shift the count.
   */
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const swatch = mindMapColor(palette);

  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        <Button variant="outline" size="sm" className="tf-bar-control gap-2">
          <Palette className="size-4" />
          <span
            aria-hidden
            className="size-3.5 rounded-full border border-white/40"
            style={{ background: swatch }}
          />
          <span className="sr-only">Change the map&apos;s colour</span>
        </Button>
      </PopoverTrigger>

      {!mounted ? null : (
        <PopoverContent align="end" className="w-80 space-y-4">
          <section className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Ready-made</p>
            <div className="grid grid-cols-6 gap-2">
              {MAP_PRESETS.map((preset) => {
                const active =
                  !isDefault &&
                  preset.palette.hue === palette.hue &&
                  preset.palette.tone === palette.tone;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    title={preset.label}
                    aria-label={preset.label}
                    aria-pressed={active}
                    onClick={() => onChange(preset.palette)}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full border transition-transform",
                      "hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active ? "border-foreground" : "border-transparent",
                    )}
                    style={{ background: mindMapColor(preset.palette) }}
                  >
                    {active ? <Check className="size-4 text-background" /> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-semibold text-muted-foreground">Any colour</p>
              <p className="font-mono text-[11px] text-muted-foreground">{palette.hue}°</p>
            </div>
            {/* A hue bar rather than a wheel: the same 360 choices, and it does
                not need a second dimension nobody is allowed to move. The track
                *is* the scale, so what you drag along is what you get. */}
            <input
              type="range"
              min={0}
              max={359}
              value={palette.hue}
              aria-label="Hue"
              onChange={(event) => onChange({ ...palette, hue: Number(event.target.value) })}
              className="h-3 w-full cursor-pointer appearance-none rounded-full"
              style={{
                background:
                  "linear-gradient(to right, hsl(0 85% 55%), hsl(60 85% 55%), hsl(120 85% 55%), " +
                  "hsl(180 85% 55%), hsl(240 85% 55%), hsl(300 85% 55%), hsl(359 85% 55%))",
              }}
            />
          </section>

          <section className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Tone</p>
            <div className="grid grid-cols-4 gap-2">
              {MAP_TONES.map(({ tone, label }) => (
                <ToneButton
                  key={tone}
                  tone={tone}
                  label={label}
                  hue={palette.hue}
                  active={palette.tone === tone}
                  onClick={() => onChange({ ...palette, tone })}
                />
              ))}
            </div>
          </section>

          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-2"
            disabled={isDefault}
            onClick={onReset}
          >
            <RotateCcw className="size-3.5" />
            Back to the type&apos;s colour
          </Button>
        </PopoverContent>
      )}
    </Popover>
  );
}

/** A tone, shown in the hue it would be applied to rather than named alone. */
function ToneButton({
  tone,
  label,
  hue,
  active,
  onClick,
}: {
  tone: MapTone;
  label: string;
  hue: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border p-1.5 text-[11px] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
      )}
    >
      <span
        aria-hidden
        className="h-4 w-full rounded"
        style={{ background: mindMapColor({ hue, tone }) }}
      />
      {label}
    </button>
  );
}
