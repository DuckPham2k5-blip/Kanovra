"use client";

import type { MindMapType } from "@prisma/client";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { MindMapGlyph } from "@/components/mind-map/mind-map-glyph";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MIND_MAP_META, mindMapCardBackground, mindMapColor } from "@/lib/mind-maps";
import { cn } from "@/lib/utils";

/**
 * One of the eight types, as something to choose rather than something to
 * admire: the drawing is the shape you will get, and the caption is the
 * question the map answers, because that is what tells you whether it is the
 * one you want.
 */
export function MindMapTypeCard({
  type,
  onSelect,
  disabled,
  existing,
  workspaceSlug,
}: {
  type: MindMapType;
  onSelect: (type: MindMapType) => void;
  disabled?: boolean;
  /** Maps of this type already in the workspace, newest first. */
  existing: { id: string; title: string }[];
  workspaceSlug: string;
}) {
  const meta = MIND_MAP_META[type];

  /**
   * The history menu is mounted after hydration, not rendered on the server.
   *
   * Radix numbers its menus with `useId`, which React derives from a
   * component's position in the tree — so the ids only agree if the server and
   * the client build an identical tree. On this page they did not, and eight
   * menus turned one drifting counter into eight hydration warnings. An
   * explicit id on the trigger does not help: Radix overwrites it with its own.
   *
   * Rendering nothing on the server removes the disagreement rather than
   * arguing with it. The cost is that the `…` appears one frame after the
   * page — and it is a menu of things you made earlier, not something anyone
   * reaches for in that frame.
   */
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    /*
     * A div, not a button. The card is clickable and also *contains* a menu
     * button, and a button inside a button is invalid HTML that browsers
     * resolve by dropping one of them — usually the one you wanted.
     */
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onSelect(type)}
      onKeyDown={(event) => {
        if (disabled || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        onSelect(type);
      }}
      className={cn(
        "group relative flex cursor-pointer flex-col gap-3 overflow-hidden rounded-xl border p-4 text-left",
        "transition-all hover:-translate-y-0.5 hover:shadow-lg",
        disabled && "pointer-events-none opacity-60",
      )}
      style={{
        ...mindMapCardBackground(type),
        borderColor: mindMapColor(type, 0.35),
      }}
    >
      {mounted && existing.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Maps already made with the ${meta.label.toLowerCase()}`}
              onClick={(event) => event.stopPropagation()}
              className="absolute right-2 top-2 z-10 rounded-full border bg-background/80 p-1 backdrop-blur"
              style={{ borderColor: mindMapColor(type, 0.4) }}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
            <DropdownMenuLabel>Made before ({existing.length})</DropdownMenuLabel>
            {existing.map((map) => (
              <DropdownMenuItem key={map.id} asChild>
                <Link href={`/w/${workspaceSlug}/maps/${map.id}`}>{map.title}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <div className="flex h-24 items-center justify-center">
        <MindMapGlyph type={type} className="h-full w-auto" />
      </div>

      <div className="space-y-1">
        <p className="text-sm font-semibold" style={{ color: mindMapColor(type) }}>
          {meta.label}
        </p>
        <p className="text-xs leading-snug text-muted-foreground">{meta.question}</p>
      </div>
    </div>
  );
}
