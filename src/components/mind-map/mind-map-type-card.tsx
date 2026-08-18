"use client";

import type { MindMapType } from "@prisma/client";

import { MindMapGlyph } from "@/components/mind-map/mind-map-glyph";
import { MIND_MAP_META, mindMapCardBackground, mindMapColor } from "@/lib/mind-maps";
import { cn } from "@/lib/utils";

/**
 * One of the six types, as something to choose rather than something to
 * admire: the drawing is the shape you will get, and the caption is the
 * question the map answers, because that is what tells you whether it is the
 * one you want.
 *
 * A card means one thing now — start a map of this kind. It used to carry a `…`
 * listing the maps of that type already made, which put "make a new one" and
 * "open an old one" on the same card and made the card's own click ambiguous;
 * those live in their own list below the picker. Losing the menu also loses the
 * hydration dance it needed, since Radix numbers its menus with `useId` and six
 * of them on one page is six chances for the count to drift.
 */
export function MindMapTypeCard({
  type,
  onSelect,
  disabled,
}: {
  type: MindMapType;
  onSelect: (type: MindMapType) => void;
  disabled?: boolean;
}) {
  const meta = MIND_MAP_META[type];

  return (
    /*
     * A real button again. This was a div with `role="button"` and hand-written
     * key handling, because it contained the history menu's own button and a
     * button inside a button is invalid HTML that browsers resolve by dropping
     * one of them — usually the one you wanted. With the menu gone the reason is
     * gone, and the element that has keyboard and disabled behaviour built in
     * beats re-implementing both.
     */
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(type)}
      className={cn(
        "group relative flex cursor-pointer flex-col gap-3 overflow-hidden rounded-xl border p-4 text-left",
        "transition-all hover:-translate-y-0.5 hover:shadow-lg",
        "disabled:pointer-events-none disabled:opacity-60",
      )}
      style={{
        ...mindMapCardBackground(type),
        borderColor: mindMapColor(type, 0.35),
      }}
    >
      <span className="flex h-24 items-center justify-center">
        <MindMapGlyph type={type} className="h-full w-auto" />
      </span>

      <span className="block space-y-1">
        <span className="block text-sm font-semibold" style={{ color: mindMapColor(type) }}>
          {meta.label}
        </span>
        <span className="block text-xs leading-snug text-muted-foreground">{meta.question}</span>
      </span>
    </button>
  );
}
