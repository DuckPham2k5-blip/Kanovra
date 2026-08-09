"use client";

import { usePathname } from "next/navigation";
import * as React from "react";

import { accentForPath } from "@/lib/page-accent";
import { GLYPHS } from "@/lib/page-glyphs";

/**
 * A large outline drawing behind each page, picked to stand for what the page
 * is about — a board for Projects, a bell for Notifications, and so on.
 *
 * It is drawn in the foreground colour (so white-on-dark, near-black-on-light)
 * at a low opacity: the point is that it reads as texture at a glance and only
 * resolves into a shape if you look for it. It must never compete with the
 * content sitting on top of it.
 *
 * The reveal is a constellation: the joints light up first, one after another,
 * then the lines draw themselves between them. Remounting on every route change
 * (via the `key` on the wrapper) is what replays it.
 */

export function PageGlyph() {
  const pathname = usePathname();
  const accent = accentForPath(pathname);
  const glyph = GLYPHS[accent.name];

  if (!glyph) return null;

  return (
    // Keyed on the section so React tears the SVG down and rebuilds it on every
    // route change — CSS animations only replay for freshly mounted nodes.
    <div key={accent.name} className="tf-glyph" aria-hidden="true">
      <svg viewBox="0 0 200 200" fill="none" className="tf-glyph-svg">
        {/* Deliberately hairline. At 2.5 the drawing competed with dense pages
            like the calendar; thin strokes plus the glow read as light rather
            than as a diagram sitting on the page. */}
        <g
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {glyph.paths.map((d, i) => (
            <path
              key={d}
              d={d}
              className="tf-glyph-line"
              // Lines start after the stars, then draw in sequence.
              style={{ animationDelay: `${520 + i * 130}ms` }}
            />
          ))}
        </g>
        <g fill="currentColor">
          {glyph.nodes.map(([cx, cy], i) => (
            <circle
              key={`${cx}-${cy}`}
              cx={cx}
              cy={cy}
              r="2.1"
              className="tf-glyph-node"
              style={{ animationDelay: `${i * 45}ms` }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
