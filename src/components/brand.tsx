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

/**
 * The assistant's own mark — the "Orbit" emblem: a bold violet→blue K on a soft
 * lavender disc, with an orbit swoosh sweeping up past it and a sparkle above.
 *
 * It is a self-contained disc (its own pale background), so it reads the same on
 * the light page and against the dark star field — an app icon does not restyle
 * itself per theme, so pair it with `rounded-full`. The K is a *filled* glyph
 * rather than three strokes on purpose: strokes for a K read as "<" the moment
 * the arms meet the stem, a filled letter never does. The gradient ids are fixed
 * and namespaced: every instance defines an identical gradient, so `url(#…)`
 * resolving to the first painted is the same pixels wherever it lands, exactly
 * as the hexagon mark above.
 */
export function AiOrbitMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={cn("size-10 shrink-0", className)}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="kanovra-ai-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#ece7ff" />
        </linearGradient>
        <linearGradient id="kanovra-ai-ink" x1="0" y1="0.1" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="50%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        <linearGradient id="kanovra-ai-swoosh" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>

      <circle cx="20" cy="20" r="19" fill="url(#kanovra-ai-tile)" stroke="#e4ddfa" strokeWidth="1" />

      {/* The orbit swoosh — a tapering crescent from the lower-left planet,
          under the K and up around its right. The "dynamic" of the reference. */}
      <path
        d="M7.6 25.2 C 15 33, 27.5 29.5, 33 14 C 31.4 16.8, 22 27.6, 9.4 23 C 8.4 22.5, 6.9 23.9, 7.6 25.2 Z"
        fill="url(#kanovra-ai-swoosh)"
        opacity="0.75"
      />
      <circle cx="7.6" cy="24.6" r="1.9" fill="url(#kanovra-ai-swoosh)" />

      {/* The K, a filled glyph. */}
      <path
        d="M12 11.4 H16.2 V18 L22.9 11.4 H28.2 L19.9 19.7 L28.6 28.6 H23.1 L16.2 21.4 V28.6 H12 Z"
        fill="url(#kanovra-ai-ink)"
        stroke="url(#kanovra-ai-ink)"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />

      {/* Sparkle. */}
      <path
        d="M30.5 7.2 C30.9 9.7 31.6 10.4 34.1 10.8 C31.6 11.2 30.9 11.9 30.5 14.4 C30.1 11.9 29.4 11.2 26.9 10.8 C29.4 10.4 30.1 9.7 30.5 7.2 Z"
        fill="url(#kanovra-ai-ink)"
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
