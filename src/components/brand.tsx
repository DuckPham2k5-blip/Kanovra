import { cn } from "@/lib/utils";

/** The TaskForge mark — an abstract stacked board, drawn inline so it themes. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[60%]" aria-hidden="true">
        <rect x="3" y="4" width="6" height="11" rx="1.6" fill="currentColor" opacity="0.95" />
        <rect x="11" y="4" width="6" height="7" rx="1.6" fill="currentColor" opacity="0.75" />
        <rect x="11" y="13" width="6" height="7" rx="1.6" fill="currentColor" opacity="0.55" />
      </svg>
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[15px] font-semibold tracking-tight", className)}>
      Task<span className="text-primary">Forge</span>
    </span>
  );
}
