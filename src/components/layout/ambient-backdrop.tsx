import { cn } from "@/lib/utils";

/**
 * Decorative backdrop: concentric arcs, a soft radial bloom and a thin horizon
 * streak, all tinted by the current page's accent hue.
 *
 * It reads `--page-accent` from whichever `PageAccentScope` encloses it and
 * owns none of that state itself, so the wash, the veil under the top bar and
 * the active nav item all animate off the same transition. It is `aria-hidden`
 * and `pointer-events-none` — purely atmosphere.
 */
export function AmbientBackdrop({
  className,
  /** `app` sits behind the dashboard; `hero` is the taller marketing variant. */
  variant = "app",
}: {
  className?: string;
  variant?: "app" | "hero";
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("tf-ambient", variant === "hero" && "tf-ambient-hero", className)}
    >
      {/* Radial bloom — the main colour wash. */}
      <div className="tf-ambient-bloom" />

      {/* Aurora ribbons. They sit above the bloom and below the arcs so the
          hairlines stay legible over them. */}
      <div className="tf-aurora">
        <div className="tf-aurora-band tf-aurora-band-a" />
        <div className="tf-aurora-band tf-aurora-band-b" />
        <div className="tf-aurora-band tf-aurora-band-c" />
      </div>

      {/* Concentric arcs. Rendered as SVG so the strokes stay hairline-thin at
          any zoom level, unlike a border-radius trick. */}
      <svg
        className="tf-ambient-arcs"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMin slice"
        fill="none"
      >
        <defs>
          <radialGradient id="tf-arc-fade" cx="50%" cy="18%" r="62%">
            <stop offset="0%" stopColor="color-mix(in srgb, var(--page-accent) 55%, white)" stopOpacity="0.55" />
            <stop offset="70%" stopColor="color-mix(in srgb, var(--page-accent) 55%, white)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="color-mix(in srgb, var(--page-accent) 55%, white)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g stroke="url(#tf-arc-fade)" strokeWidth="1">
          <circle cx="600" cy="150" r="260" />
          <circle cx="600" cy="150" r="400" />
          <circle cx="600" cy="150" r="560" />
          <circle cx="600" cy="150" r="740" />
        </g>
      </svg>

      {/* Horizon streak — the bright sliver under the hero. */}
      <div className="tf-ambient-horizon" />
    </div>
  );
}
