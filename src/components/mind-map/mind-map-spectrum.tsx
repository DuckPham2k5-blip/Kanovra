"use client";

import * as React from "react";

/**
 * A full spectrum picker — a saturation/value square and a hue bar — behind the
 * "More colours" button on the colour panel.
 *
 * The presets cover the common cases; this is for the exact colour that is not
 * one of them. It speaks `#rrggbb`, the only thing the fill model stores, so it
 * drops straight into the same `onPick` the swatches use. HSV rather than HSL for
 * the square because saturation-and-value is the arrangement people know from
 * every other picker: white in one corner, black along the bottom, the pure hue
 * opposite.
 */
export function SpectrumPicker({
  hex,
  onPick,
}: {
  hex: string;
  onPick: (hex: string) => void;
}) {
  const [hsv, setHsv] = React.useState(() => hexToHsv(hex));

  // Re-sync when the colour changes from outside — a preset clicked, a different
  // stop selected. Skipped while we are the ones driving it, because then the
  // incoming hex already matches what our HSV produces.
  React.useEffect(() => {
    if (!sameHex(hsvToHex(hsv), hex)) setHsv(hexToHsv(hex));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hex]);

  const push = (next: Hsv) => {
    setHsv(next);
    onPick(hsvToHex(next));
  };

  const hexNow = hsvToHex(hsv);
  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  // The hex field keeps its own text so a half-typed value can sit in it without
  // a malformed colour ever being pushed to the map; a complete one applies.
  const [text, setText] = React.useState(hexNow);
  React.useEffect(() => setText(hexNow), [hexNow]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {/* Saturation across, value down. */}
        <DragArea
          className="relative h-32 flex-1 rounded-md"
          style={{
            background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), ${hueColor}`,
          }}
          onMove={(x, y) => push({ ...hsv, s: x, v: 1 - y })}
        >
          <Thumb x={hsv.s} y={1 - hsv.v} />
        </DragArea>

        {/* Hue down the side. */}
        <DragArea
          className="relative h-32 w-5 rounded-md"
          style={{
            background:
              "linear-gradient(to bottom, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
          }}
          onMove={(_x, y) => push({ ...hsv, h: y * 360 })}
        >
          <Thumb x={0.5} y={hsv.h / 360} />
        </DragArea>
      </div>

      <div className="flex items-center gap-2">
        <span className="size-7 shrink-0 rounded border" style={{ background: hexNow }} aria-hidden />
        <input
          aria-label="Hex colour"
          value={text}
          onChange={(event) => {
            const value = event.target.value;
            setText(value);
            if (/^#[0-9a-fA-F]{6}$/.test(value.trim())) push(hexToHsv(value.trim()));
          }}
          className="h-8 w-full rounded-md border bg-background px-2 text-sm tabular-nums outline-none focus:ring-2 focus:ring-primary"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

/** A rectangle that reports the pointer's position in it as fractions 0..1. */
function DragArea({
  className,
  style,
  onMove,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  onMove: (x: number, y: number) => void;
  children?: React.ReactNode;
}) {
  const report = (event: React.PointerEvent, rect: DOMRect) => {
    const x = clamp01((event.clientX - rect.left) / rect.width);
    const y = clamp01((event.clientY - rect.top) / rect.height);
    onMove(x, y);
  };

  return (
    <div
      className={`cursor-crosshair touch-none ${className ?? ""}`}
      style={style}
      onPointerDown={(event) => {
        const el = event.currentTarget;
        el.setPointerCapture(event.pointerId);
        report(event, el.getBoundingClientRect());
      }}
      onPointerMove={(event) => {
        if (event.buttons !== 1) return;
        report(event, event.currentTarget.getBoundingClientRect());
      }}
    >
      {children}
    </div>
  );
}

function Thumb({ x, y }: { x: number; y: number }) {
  return (
    <span
      className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, boxShadow: "0 0 0 1px rgba(0,0,0,0.5)" }}
    />
  );
}

type Hsv = { h: number; s: number; v: number };

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function sameHex(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g] = [c, x];
  else if (h < 120) [r, g] = [x, c];
  else if (h < 180) [g, b] = [c, x];
  else if (h < 240) [g, b] = [x, c];
  else if (h < 300) [r, b] = [x, c];
  else [r, b] = [c, x];
  const to = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function hexToHsv(hex: string): Hsv {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}
