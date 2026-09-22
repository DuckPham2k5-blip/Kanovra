/**
 * Per-page accent colours driving the ambient backdrop.
 *
 * These are whole colours, not hues, and that distinction is load-bearing.
 * An earlier version animated the hue as a bare number, which meant a move
 * from indigo (243) to amber (38) swept the value down through 200, 168, 120
 * and 60 — so the page flashed blue, then teal, then green, then yellow before
 * settling. Interpolating the colour itself takes the direct path through
 * colour space instead, and the transition reads as one clean cross-fade.
 *
 * Every colour sits at the same saturation and lightness, so no page's
 * backdrop is heavier than another's and none of them can overpower text.
 */

export type PageAccent = {
  /** Fully-resolved CSS colour, interpolated directly on route change. */
  color: string;
  /** Human label, used for the `data-accent` hook and debugging. */
  name: string;
};

/** One shared lightness/saturation so the pages stay visually level. */
const accent = (hue: number, name: string): PageAccent => ({
  color: `hsl(${hue} 88% 60%)`,
  name,
});

const ACCENTS = {
  overview: accent(243, "overview"), // indigo — matches --primary
  tasks: accent(168, "tasks"), // teal
  projects: accent(268, "projects"), // violet
  calendar: accent(202, "calendar"), // sky
  analytics: accent(38, "analytics"), // amber
  notifications: accent(340, "notifications"), // rose
  /* Chosen by measurement, under two constraints rather than one. Twelve hues
     are already spoken for — eight map types and the other sections — so there
     is no gap that clears everything. The furthest hue overall is 124, and it
     is useless here: its nearest neighbours are the lime circle map and the
     green brace map, which is the original problem again.

     So: maximise the distance from the eight *types*, which share the page,
     subject to staying at least 28 degrees from any other section, which do
     not. 312 wins — 44 degrees from the nearest map, 28 from rose.

     The section began as lime, sitting on top of a lime circle map, a green
     brace map and a cyan bubble map. Darkening those cards was tried twice and
     could not work: a card in the same colour family as the wash behind it
     reads as part of the page no matter how opaque it is. */
  maps: accent(312, "maps"),
  members: accent(190, "members"), // cyan
  settings: accent(220, "settings"), // slate-blue
  marketing: accent(255, "marketing"), // deep violet for the landing page
  /* The assistant is violet, not the indigo it borrowed at first — that read as
     the same page as Overview, which keeps indigo as the workspace's home colour
     (it matches --primary). Violet is 47° off it, clearly a different place, and
     the brighter, more electric hue suits the AI page — the same violet the
     assistant's own emblem leans on. */
  ai: accent(290, "ai"),
} as const satisfies Record<string, PageAccent>;

export const DEFAULT_ACCENT = ACCENTS.overview;

/**
 * Maps a pathname to its accent. Matching is done on the segment after the
 * workspace slug (`/w/<slug>/<section>`), so every nested route inherits its
 * section's colour — a task detail under `/projects/…` still reads as violet.
 */
export function accentForPath(pathname: string): PageAccent {
  if (!pathname.startsWith("/w/")) {
    // Landing, onboarding, auth and invite screens.
    return ACCENTS.marketing;
  }

  // "/w/acme/projects/123/board" -> ["w", "acme", "projects", "123", "board"]
  const section = pathname.split("/").filter(Boolean)[2];

  switch (section) {
    case undefined:
      return ACCENTS.overview;
    case "my-tasks":
      return ACCENTS.tasks;
    case "maps":
      return ACCENTS.maps;
    case "projects":
      return ACCENTS.projects;
    case "calendar":
      return ACCENTS.calendar;
    case "analytics":
      return ACCENTS.analytics;
    case "notifications":
      return ACCENTS.notifications;
    case "members":
      return ACCENTS.members;
    case "settings":
      return ACCENTS.settings;
    case "ai":
      return ACCENTS.ai;
    default:
      return DEFAULT_ACCENT;
  }
}
