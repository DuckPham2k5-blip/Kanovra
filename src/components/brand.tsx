import { cn } from "@/lib/utils";

/**
 * The Kanovra mark: a K monogram set in a hexagon, filled with the brand's
 * violet→blue gradient.
 *
 * The gradient needs an element id, which would normally collide when the mark
 * is rendered more than once on a page (header, sidebar and footer all show
 * it). A fixed, namespaced id is safe here precisely because every instance
 * defines an identical gradient — `url(#…)` resolving to whichever one came
 * first paints the same pixels either way.
 */
const GRADIENT_ID = "kanovra-mark-gradient";

const HEXAGON = "M16 2 L28.12 9 L28.12 23 L16 30 L3.88 23 L3.88 9 Z";
const MONOGRAM =
  "M10.8 9.5 H14 V14.6 L19.4 9.5 H23.6 L17 15.9 L23.8 22.5 H19.4 L14 17.2 V22.5 H10.8 Z";

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-8 shrink-0", className)}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="55%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>

      {/* The stroke rounds the hexagon's points — a filled path alone leaves
          them needle-sharp at large sizes. */}
      <path
        d={HEXAGON}
        fill={`url(#${GRADIENT_ID})`}
        stroke={`url(#${GRADIENT_ID})`}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path d={MONOGRAM} fill="#fff" />
    </svg>
  );
}

/**
 * Single-colour variant for places that need the mark to sit in text — print,
 * a dense table cell, or anywhere the gradient would fight the surrounding UI.
 */
export function LogoMono({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-8 shrink-0", className)}
      fill="none"
      aria-hidden="true"
    >
      <path
        d={`${HEXAGON} ${MONOGRAM}`}
        fill="currentColor"
        fillRule="evenodd"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[15px] font-semibold tracking-[0.18em]", className)}>KANOVRA</span>
  );
}

/** The brand tagline. Pairs with `Wordmark` in the marketing lockup. */
export function Tagline({ className }: { className?: string }) {
  return (
    <span className={cn("text-[11px] tracking-[0.14em] text-muted-foreground", className)}>
      PLAN · TRACK · COLLABORATE · DELIVER
    </span>
  );
}
