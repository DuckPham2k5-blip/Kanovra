import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The single visual marker for anything model-generated. Every AI surface in
 * the app carries it, so a user can always tell suggested content from content
 * a teammate wrote.
 */
export function AiBadge({ className, label = "AI" }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary",
        className,
      )}
    >
      <Sparkles className="size-3" />
      {label}
    </span>
  );
}
