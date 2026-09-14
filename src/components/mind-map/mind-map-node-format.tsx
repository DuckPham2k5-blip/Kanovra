"use client";

import { Bold, Italic, Minus, Plus, Underline } from "lucide-react";
import * as React from "react";

import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import type { CanvasNode } from "@/lib/mind-map-canvas";
import { FONTS, fontScaleOf, fontStack, stepFontScale } from "@/lib/mind-map-text";
import { NODE_EMOJI } from "@/lib/mind-maps";
import { cn } from "@/lib/utils";

type StyleFields = Pick<CanvasNode, "bold" | "italic" | "underline" | "font" | "fontScale">;
type Patch = Partial<CanvasNode>;

/**
 * The Word-style text controls, shared by the box menu and the wheel menu.
 *
 * Plain buttons inside the dropdown's content, not menu items: a menu item
 * closes the menu when chosen, and setting bold then italic then a size is three
 * choices in a row that should leave the menu open. That is the same reason the
 * emoji grid here is plain buttons — Radix only dismisses on an item or an
 * outside click, and none of these is either.
 */
export function NodeTextControls({
  node,
  onChange,
}: {
  node: StyleFields;
  onChange: (patch: Patch) => void;
}) {
  const scale = fontScaleOf(node);
  const currentFont = node.font ?? "sans";
  const toggle = (key: "bold" | "italic" | "underline") =>
    onChange({ [key]: node[key] ? null : true } as Patch);

  return (
    <div className="space-y-1.5 px-1.5 py-1">
      <div className="flex items-center gap-1">
        <FormatToggle label="Bold" active={!!node.bold} onClick={() => toggle("bold")}>
          <Bold className="size-3.5" />
        </FormatToggle>
        <FormatToggle label="Italic" active={!!node.italic} onClick={() => toggle("italic")}>
          <Italic className="size-3.5" />
        </FormatToggle>
        <FormatToggle label="Underline" active={!!node.underline} onClick={() => toggle("underline")}>
          <Underline className="size-3.5" />
        </FormatToggle>

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        {/* Size, in fixed steps. The label reads the current size as a percent so
            "bigger" and "smaller" are not the only feedback. */}
        <FormatToggle
          label="Smaller text"
          active={false}
          disabled={stepFontScale(scale, -1) === scale}
          onClick={() => onChange({ fontScale: stepFontScale(scale, -1) })}
        >
          <Minus className="size-3.5" />
        </FormatToggle>
        <span className="min-w-10 text-center text-xs tabular-nums text-muted-foreground">
          {Math.round(scale * 100)}%
        </span>
        <FormatToggle
          label="Bigger text"
          active={false}
          disabled={stepFontScale(scale, 1) === scale}
          onClick={() => onChange({ fontScale: stepFontScale(scale, 1) })}
        >
          <Plus className="size-3.5" />
        </FormatToggle>
      </div>

      {/* One button per font, each set in the font it chooses, so the list shows
          what it does rather than only naming it. */}
      <div className="flex flex-wrap gap-1">
        {FONTS.map((font) => (
          <button
            key={font.key}
            type="button"
            aria-label={`Font ${font.label}`}
            aria-pressed={currentFont === font.key}
            onClick={() => onChange({ font: font.key === "sans" ? null : font.key })}
            className={cn(
              "rounded border px-2 py-1 text-xs leading-none transition-colors",
              currentFont === font.key ? "border-primary bg-primary/10 text-foreground" : "hover:bg-accent",
            )}
            style={{ fontFamily: fontStack(font.key) }}
          >
            {font.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FormatToggle({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded border transition-colors disabled:opacity-40",
        active ? "border-primary bg-primary/10 text-foreground" : "hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

/**
 * The emoji picker, folded into one button that opens the grid.
 *
 * It used to be a grid of twenty-four spilled straight into the menu; the owner
 * asked for it tucked behind a single control. The trigger wears the node's own
 * emoji when it has one and a plain face otherwise, so the row says at a glance
 * whether the node is marked. A Radix submenu rather than a popover, because the
 * grid then portals out of the canvas like the rest of the menu and is not
 * clipped by it.
 */
export function EmojiSubmenu({
  emoji,
  onPick,
}: {
  emoji: string | null | undefined;
  onPick: (glyph: string | null) => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="text-base leading-none">{emoji || "🙂"}</span>
        {emoji ? "Emoji" : "Add an emoji"}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-auto">
        <div className="grid grid-cols-8 gap-0.5 p-1">
          {NODE_EMOJI.map((glyph) => (
            <button
              key={glyph}
              type="button"
              aria-label={`Mark with ${glyph}`}
              onClick={() => onPick(emoji === glyph ? null : glyph)}
              className={cn(
                "rounded p-1 text-base leading-none hover:bg-accent",
                emoji === glyph && "bg-accent",
              )}
            >
              {glyph}
            </button>
          ))}
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
