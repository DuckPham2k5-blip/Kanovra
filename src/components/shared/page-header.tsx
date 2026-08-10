import { cn } from "@/lib/utils";

/**
 * One horizontal ripple, drawn as a run of alternating quadratic humps.
 *
 * `q` sets the first hump and every `t` after it mirrors the previous control
 * point, so the curve alternates above and below the line on its own — a sine
 * without the arithmetic. The path is drawn to twice the viewBox width and the
 * whole row is then translated by exactly one viewBox width, which is why the
 * loop has no seam: the shape arriving is the shape that left.
 */
function ripplePath({
  y,
  amplitude,
  period,
  width,
}: {
  y: number;
  amplitude: number;
  period: number;
  width: number;
}) {
  const half = period / 2;
  let d = `M0 ${y} q ${half / 2} ${-amplitude} ${half} 0`;
  for (let x = half; x < width; x += half) d += ` t ${half} 0`;
  return d;
}

/* Long shallow curves rather than tight ripples: the filaments in the reference
   sweep most of the width in a single arc. Periods are far wider than the
   viewBox so only part of one wave shows at a time. */
const RIPPLES = [
  { y: 30, amplitude: 16, period: 1400, className: "tf-wave-row-a" },
  { y: 40, amplitude: 22, period: 2000, className: "tf-wave-row-b" },
  { y: 48, amplitude: 12, period: 1100, className: "tf-wave-row-c" },
  { y: 22, amplitude: 18, period: 1700, className: "tf-wave-row-d" },
  { y: 56, amplitude: 10, period: 900, className: "tf-wave-row-e" },
];

/** Consistent page title block used by every workspace page. */
export function PageHeader({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative space-y-4 overflow-hidden border-b bg-background px-4 py-5 sm:px-6",
        className,
      )}
    >
      {/* Ripples crossing the bar, tinted by the route's own accent. Rows travel
          at different speeds and two of them run the other way, which is what
          stops the set reading as one rigid sheet sliding past.

          `preserveAspectRatio="none"` stretches the viewBox to whatever width
          the bar happens to be; `vector-effect="non-scaling-stroke"` on the
          paths keeps the lines hairline-thin regardless, since that stretch
          would otherwise thicken them horizontally. */}
      <div className="tf-header-aurora" aria-hidden="true">
        {/* Layer 1 — the colour body: two broad, heavily blurred clouds. */}
        <div className="tf-aurora-cloud tf-aurora-cloud-a" />
        <div className="tf-aurora-cloud tf-aurora-cloud-b" />

        {/* Layer 2 — the hot core. In the reference this is the one nearly
            white spot everything else fades out from; without it the bar reads
            as flat colour rather than as light. */}
        <div className="tf-aurora-core" />

        {/* Layer 3 — filaments. Each curve is drawn twice: a wide soft pass for
            bloom, then a hairline for the bright thread inside it. Both fade to
            nothing at the ends through the gradient, which is what makes them
            look like strands of light instead of drawn lines. */}
        <svg className="tf-header-waves" viewBox="0 0 1200 70" preserveAspectRatio="none" fill="none">
          <defs>
            <linearGradient id="tf-wave-fade" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--page-accent)" stopOpacity="0" />
              <stop offset="30%" stopColor="var(--page-accent)" stopOpacity="0.55" />
              <stop
                offset="55%"
                stopColor="color-mix(in srgb, var(--page-accent) 40%, white)"
                stopOpacity="0.95"
              />
              <stop offset="80%" stopColor="var(--page-accent)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="var(--page-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {RIPPLES.map((ripple) => {
            const d = ripplePath({
              y: ripple.y,
              amplitude: ripple.amplitude,
              period: ripple.period,
              width: 2400,
            });
            return (
              <g key={ripple.className} className={cn("tf-wave-row", ripple.className)}>
                <path className="tf-wave-bloom" vectorEffect="non-scaling-stroke" d={d} />
                <path className="tf-wave-line" vectorEffect="non-scaling-stroke" d={d} />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {description ? (
            <div className="text-sm text-muted-foreground">{description}</div>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="relative z-10">{children}</div> : null}
    </div>
  );
}
