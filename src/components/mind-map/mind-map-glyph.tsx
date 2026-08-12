import { MindMapType } from "@prisma/client";

import { mindMapColor } from "@/lib/mind-maps";

/**
 * The shape of each map, drawn rather than photographed.
 *
 * Two tones only: the map's own accent for whatever carries the meaning — the
 * centre, the cause, the whole — and a muted tone for everything hanging off
 * it. That split is what lets eight small drawings stay legible at this size;
 * a single colour makes them read as decoration, and more than two makes them
 * read as noise.
 */
export function MindMapGlyph({
  type,
  className,
}: {
  type: MindMapType;
  className?: string;
}) {
  const strong = mindMapColor(type);
  const soft = mindMapColor(type, 0.42);
  const line = mindMapColor(type, 0.55);

  const common = { className, viewBox: "0 0 120 80", fill: "none" as const };

  switch (type) {
    case MindMapType.CIRCLE:
      return (
        <svg {...common}>
          <circle cx="60" cy="40" r="32" fill={soft} />
          <circle cx="60" cy="40" r="13" fill={strong} />
        </svg>
      );

    case MindMapType.BUBBLE:
      return (
        <svg {...common}>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
            const rad = (deg * Math.PI) / 180;
            const x = 60 + Math.cos(rad) * 30;
            const y = 40 + Math.sin(rad) * 27;
            return (
              <g key={deg}>
                <line
                  x1="60"
                  y1="40"
                  x2={x}
                  y2={y}
                  stroke={line}
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <circle cx={x} cy={y} r="7" fill={soft} />
              </g>
            );
          })}
          <circle cx="60" cy="40" r="12" fill={strong} />
        </svg>
      );

    case MindMapType.DOUBLE_BUBBLE:
      return (
        <svg {...common}>
          <line x1="42" y1="40" x2="78" y2="40" stroke={line} strokeWidth="1" strokeDasharray="2 2" />
          {/* Shared qualities sit between the two subjects. */}
          <circle cx="60" cy="18" r="7" fill={strong} />
          <circle cx="60" cy="62" r="7" fill={strong} />
          {[
            [20, 18],
            [14, 40],
            [20, 62],
          ].map(([x, y]) => (
            <circle key={`l${x}${y}`} cx={x} cy={y} r="6" fill={soft} />
          ))}
          {[
            [100, 18],
            [106, 40],
            [100, 62],
          ].map(([x, y]) => (
            <circle key={`r${x}${y}`} cx={x} cy={y} r="6" fill={soft} />
          ))}
          <circle cx="42" cy="40" r="12" fill={soft} />
          <circle cx="78" cy="40" r="12" fill={soft} />
        </svg>
      );

    case MindMapType.TREE:
      return (
        <svg {...common}>
          <rect x="38" y="8" width="44" height="10" rx="2" fill={strong} />
          <path d="M60 18v10M20 28h80M20 28v8M60 28v8M100 28v8" stroke={line} strokeWidth="1.5" />
          {[8, 48, 88].map((x) => (
            <g key={x}>
              <rect x={x} y="36" width="24" height="7" rx="1.5" fill={strong} opacity="0.7" />
              <rect x={x} y="46" width="24" height="22" rx="2" fill={soft} />
            </g>
          ))}
        </svg>
      );

    case MindMapType.FLOW:
      return (
        <svg {...common}>
          {[
            [10, 10],
            [64, 10],
            [10, 52],
            [64, 52],
          ].map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="40" height="16" rx="2" fill={soft} />
          ))}
          {/* The bend down the right and back along the bottom is what makes a
              flow read as a sequence rather than a row of boxes. */}
          <path
            d="M50 18h10M104 18h8v20h-8M60 60h-8M50 60H30"
            stroke={line}
            strokeWidth="1.5"
          />
          <path d="M56 18l4-2v4zM106 38l-4 2v-4z" fill={strong} />
        </svg>
      );

    case MindMapType.MULTI_FLOW:
      return (
        <svg {...common}>
          {[10, 32, 54].map((y) => (
            <rect key={`in${y}`} x="6" y={y} width="26" height="14" rx="2" fill={soft} />
          ))}
          <rect x="46" y="32" width="28" height="16" rx="2" fill={strong} />
          {[10, 32, 54].map((y) => (
            <rect key={`out${y}`} x="88" y={y} width="26" height="14" rx="2" fill={soft} />
          ))}
          <path
            d="M34 17l10 18M34 39h10M34 61l10-18M76 40l10-22M76 40h10M76 40l10 22"
            stroke={line}
            strokeWidth="1.2"
          />
        </svg>
      );

    case MindMapType.BRACE:
      return (
        <svg {...common}>
          {/* Braces, not boxes: a brace map is about a physical whole being
              divided, and the bracket is the notation for exactly that. */}
          <path
            d="M40 8c-6 0-6 28-12 32 6 4 6 32 12 32"
            stroke={strong}
            strokeWidth="3"
            strokeLinecap="round"
          />
          {[16, 32, 48, 64].map((y) => (
            <line key={y} x1="48" y1={y} x2="76" y2={y} stroke={line} strokeWidth="1.5" strokeDasharray="3 3" />
          ))}
          <path
            d="M88 24c-4 0-4 14-8 16 4 2 4 16 8 16"
            stroke={strong}
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.8"
          />
          {[32, 48].map((y) => (
            <line key={y} x1="94" y1={y} x2="112" y2={y} stroke={line} strokeWidth="1.2" strokeDasharray="3 3" />
          ))}
        </svg>
      );

    case MindMapType.BRIDGE:
      return (
        <svg {...common}>
          <line x1="8" y1="44" x2="52" y2="44" stroke={strong} strokeWidth="2" />
          <text x="14" y="60" fill={strong} fontSize="11" fontFamily="monospace">
            RF
          </text>
          {/* The triangles are the bridge: each pair sits either side of one. */}
          <path
            d="M60 44h8l6-12 6 12h10l6-12 6 12h10"
            stroke={line}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}
