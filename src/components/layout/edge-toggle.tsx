"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A round, bordered collapse button that straddles a column's edge.
 *
 * It lives on the edge — half over the column, half over the page — rather than
 * inside the column's header, so a folded rail with no room for a header still
 * has an obvious way back, and the control reads as sitting on the seam. The
 * parent must be `relative` and must not clip horizontal overflow; the button
 * carries its own border and background so it reads as its own control against
 * either side. Shared by the shell's sidebar and the assistant's history column.
 */
export function EdgeToggle({
  side,
  collapsed,
  onToggle,
  label,
  breakpoint = "lg",
}: {
  side: "left" | "right";
  collapsed: boolean;
  onToggle: () => void;
  label: string;
  /** The width at which the column (and so this handle) appears. */
  breakpoint?: "lg" | "xl";
}) {
  // On a left column the chevron points the way it will move: in to fold, out
  // to open. A right column is the mirror.
  const pointsLeft = side === "left" ? !collapsed : collapsed;
  const Icon = pointsLeft ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={onToggle}
      title={label}
      aria-label={label}
      className={cn(
        "absolute top-1/2 z-30 hidden size-6 -translate-y-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // Both literals are present so Tailwind's JIT keeps them.
        breakpoint === "xl" ? "xl:flex" : "lg:flex",
        side === "left" ? "-right-3" : "-left-3",
      )}
    >
      <Icon className="size-3.5" />
    </button>
  );
}
