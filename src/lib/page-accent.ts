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
  members: accent(190, "members"), // cyan
  settings: accent(220, "settings"), // slate-blue
  marketing: accent(255, "marketing"), // deep violet for the landing page
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
    default:
      return DEFAULT_ACCENT;
  }
}
