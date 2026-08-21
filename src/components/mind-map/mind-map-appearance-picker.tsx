"use client";

import { Check, Image as ImageIcon, Link2, Loader2, RotateCcw } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  backgroundImage,
  MAP_BACKGROUNDS,
  type MapBackground,
  type MapScenery,
} from "@/lib/map-backgrounds";
import { MAP_TONES, type MapPalette, type MapTone } from "@/lib/mind-map-palette";
import { mindMapBackdrop, mindMapColor } from "@/lib/mind-maps";
import { cn } from "@/lib/utils";

/**
 * Chooses what a map looks like: what it stands on, and what colour it is drawn
 * in.
 *
 * The background comes first because that is the question people arrive with.
 * "What hue is this map" is a question about a value; "what should this look
 * like" is a question about a picture, so the answer is pictures — and each one
 * carries the accent that suits it, so choosing scenery sets the drawing's
 * colour too rather than leaving somebody to match the two by hand.
 *
 * The accent controls stayed, below, because a map with no scenery still has to
 * be recolourable and because a chosen background's accent is a suggestion
 * rather than a sentence.
 *
 * Every thumbnail is the background itself at thumbnail size, not a picture of
 * it: they are SVG documents, so the small one and the large one cannot drift.
 */
export function MindMapAppearancePicker({
  scenery,
  palette,
  isDefaultPalette,
  disabled,
  onBackground,
  onPalette,
  onResetPalette,
}: {
  scenery: MapScenery;
  palette: MapPalette;
  isDefaultPalette: boolean;
  disabled?: boolean;
  /**
   * Applies a background. Resolves with an error to show beside the link box, or
   * null — the link is checked on the server, so the answer arrives late and has
   * to land somewhere the person who typed it is still looking.
   */
  onBackground: (
    kind: "preset" | "url" | null,
    value: string,
    background?: MapBackground,
  ) => Promise<string | null>;
  onPalette: (palette: MapPalette, options?: { continuous?: boolean }) => void;
  onResetPalette: () => void;
}) {
  /*
   * Radix numbers its popovers with `useId`; a count that differs between the
   * server render and hydration warns on every trigger after the first, and the
   * canvas below already gates its own menus on a mounted flag for this.
   */
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const [link, setLink] = React.useState(scenery?.kind === "url" ? scenery.url : "");
  const [checking, setChecking] = React.useState(false);
  const [linkError, setLinkError] = React.useState<string | null>(null);

  const groups = ["Cosmos", "Nature", "Technology", "Colour"] as const;
  const chosenId = scenery?.kind === "preset" ? scenery.background.id : null;

  async function applyLink() {
    const value = link.trim();
    if (!value) return;
    setChecking(true);
    setLinkError(await onBackground("url", value));
    setChecking(false);
  }

  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        <Button variant="outline" size="sm" className="tf-bar-control gap-2">
          <ImageIcon className="size-4" />
          <span
            aria-hidden
            className="size-4 rounded border border-white/40 bg-cover bg-center"
            style={
              scenery?.kind === "preset"
                ? {
                    backgroundColor: scenery.background.base,
                    backgroundImage: backgroundImage(scenery.background),
                  }
                : scenery?.kind === "url"
                  ? { backgroundImage: `url("${scenery.url}")` }
                  : { background: `${mindMapBackdrop(palette)}, hsl(var(--background))` }
            }
          />
          <span className="sr-only">Change how the map looks</span>
        </Button>
      </PopoverTrigger>

      {!mounted ? null : (
        <PopoverContent align="end" className="max-h-[76vh] w-[26rem] space-y-4 overflow-y-auto">
          <section className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Plain</p>
            <div className="grid grid-cols-3 gap-2">
              <Swatch
                label="None"
                active={scenery === null}
                onClick={() => void onBackground(null, "")}
                style={{ background: `${mindMapBackdrop(palette)}, hsl(var(--background))` }}
              />
            </div>
          </section>

          {groups.map((group) => {
            const items = MAP_BACKGROUNDS.filter((item) => item.group === group);
            if (items.length === 0) return null;
            return (
              <section key={group} className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">{group}</p>
                <div className="grid grid-cols-3 gap-2">
                  {items.map((item) => (
                    <Swatch
                      key={item.id}
                      label={item.label}
                      active={chosenId === item.id}
                      onClick={() => void onBackground("preset", item.id, item)}
                      style={{
                        backgroundColor: item.base,
                        backgroundImage: backgroundImage(item),
                        backgroundSize: "cover",
                      }}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {/* Anything the thirteen above do not cover. A photograph cannot be
              shipped with the app — it would be somebody's copyright and a file
              to host — so the way to a photograph is a link to one. */}
          <section className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Link2 className="size-3.5" /> Your own picture
            </p>
            <div className="flex gap-2">
              <Input
                value={link}
                onChange={(event) => {
                  setLink(event.target.value);
                  setLinkError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void applyLink();
                }}
                placeholder="https://…"
                className="h-8 text-xs"
              />
              <Button size="sm" className="h-8" disabled={checking || !link.trim()} onClick={() => void applyLink()}>
                {checking ? <Loader2 className="size-3.5 animate-spin" /> : "Use"}
              </Button>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              An https link to a picture. An animated GIF works. The picture is fetched by
              everyone who opens the map, so the site hosting it can see them.
            </p>
            {linkError ? <p className="text-[11px] text-destructive">{linkError}</p> : null}
          </section>

          <section className="space-y-2 border-t pt-3">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-semibold text-muted-foreground">Accent</p>
              <p className="font-mono text-[11px] text-muted-foreground">{palette.hue}°</p>
            </div>
            {/* A hue bar rather than a wheel: the same 360 choices, and it does
                not need a second dimension nobody is allowed to move. */}
            <input
              type="range"
              min={0}
              max={359}
              value={palette.hue}
              aria-label="Hue"
              onChange={(event) =>
                onPalette({ ...palette, hue: Number(event.target.value) }, { continuous: true })
              }
              // The end of the drag is a decision, and it is what gets written.
              // Without it the last value of a gesture waits out the debounce,
              // and closing the map inside that window loses the colour.
              onPointerUp={() => onPalette(palette)}
              onKeyUp={() => onPalette(palette)}
              className="h-3 w-full cursor-pointer appearance-none rounded-full"
              style={{
                background:
                  "linear-gradient(to right, hsl(0 85% 55%), hsl(60 85% 55%), hsl(120 85% 55%), " +
                  "hsl(180 85% 55%), hsl(240 85% 55%), hsl(300 85% 55%), hsl(359 85% 55%))",
              }}
            />
            <div className="grid grid-cols-4 gap-2">
              {MAP_TONES.map(({ tone, label }) => (
                <ToneButton
                  key={tone}
                  tone={tone}
                  label={label}
                  hue={palette.hue}
                  active={palette.tone === tone}
                  onClick={() => onPalette({ ...palette, tone })}
                />
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-2"
              disabled={isDefaultPalette}
              onClick={onResetPalette}
            >
              <RotateCcw className="size-3.5" />
              Back to the type&apos;s colour
            </Button>
          </section>
        </PopoverContent>
      )}
    </Popover>
  );
}

function Swatch({
  label,
  active,
  style,
  onClick,
}: {
  label: string;
  active: boolean;
  style: React.CSSProperties;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group relative h-16 overflow-hidden rounded-lg border text-left transition-transform",
        "hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary ring-2 ring-primary/40" : "border-border/60",
      )}
      style={style}
    >
      {active ? (
        <span className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5">
          <Check className="size-3" />
        </span>
      ) : null}
      {/* The name sits on a strip of its own rather than straight on the
          artwork: these are deliberately busy pictures, and a word laid on one
          is legible on some of them and gone on others. */}
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-[11px] text-white">
        {label}
      </span>
    </button>
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
