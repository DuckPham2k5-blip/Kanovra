"use client";

import { Check } from "lucide-react";

import { COLOR_PALETTE } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Compact swatch grid used by workspace/project/column/label forms. */
export function ColorPicker({
  value,
  onChange,
  colors = COLOR_PALETTE,
  className,
}: {
  value: string;
  onChange: (color: string) => void;
  colors?: string[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {colors.map((color) => {
        const active = value.toLowerCase() === color.toLowerCase();
        return (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            aria-label={`Pick colour ${color}`}
            aria-pressed={active}
            className={cn(
              "flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active && "ring-2 ring-foreground",
            )}
            style={{ backgroundColor: color }}
          >
            {active ? <Check className="size-3.5 text-white" strokeWidth={3} /> : null}
          </button>
        );
      })}
    </div>
  );
}
