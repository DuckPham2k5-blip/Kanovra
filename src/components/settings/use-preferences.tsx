"use client";

import * as React from "react";

import { ACCENT_HSL, APPEARANCE_STORAGE_KEY } from "@/components/settings/appearance-init";

/**
 * Per-browser appearance preferences, applied to the document element and
 * persisted in `localStorage`.
 *
 * These are genuinely applied, not decorative: `accent` overrides the global
 * `--primary` HSL triplet (so every primary button, switch and active state
 * recolours), and the four flags drive `data-*` attributes that CSS in
 * `globals.css` reads. Theme (light/dark/system) is deliberately *not* here —
 * that is `next-themes`, which owns its own storage key and its own no-flash
 * script; duplicating it would fight that script.
 *
 * Nothing here crosses to the server. Like the map appearance switch and the
 * AI "About you" note, an appearance choice is a property of the browser a
 * person is sitting at, not of their account.
 */

export type AccentKey =
  | "default"
  | "blue"
  | "cyan"
  | "green"
  | "amber"
  | "red"
  | "pink"
  | "spectrum";

export type BackgroundKey = "aurora" | "grid" | "dots" | "minimal" | "constellation";

export type Preferences = {
  accent: AccentKey;
  background: BackgroundKey;
  reduceMotion: boolean;
  backgroundEffects: boolean;
  compact: boolean;
};

export const DEFAULT_PREFERENCES: Preferences = {
  accent: "default",
  background: "aurora",
  reduceMotion: false,
  backgroundEffects: true,
  compact: false,
};

/** The eight accent swatches. `default` clears the override and restores the
 *  theme's own indigo (which differs between light and dark); every other one
 *  is a single HSL triplet from `ACCENT_HSL`, applied in both themes. The
 *  spectrum swatch previews as a wheel but resolves to one vivid `--primary`. */
export const ACCENT_SWATCHES: { key: AccentKey; label: string; hsl: string | null; preview: string }[] = [
  { key: "default", label: "Indigo", hsl: null, preview: "hsl(243 75% 59%)" },
  { key: "blue", label: "Blue", hsl: ACCENT_HSL.blue, preview: `hsl(${ACCENT_HSL.blue})` },
  { key: "cyan", label: "Cyan", hsl: ACCENT_HSL.cyan, preview: `hsl(${ACCENT_HSL.cyan})` },
  { key: "green", label: "Green", hsl: ACCENT_HSL.green, preview: `hsl(${ACCENT_HSL.green})` },
  { key: "amber", label: "Amber", hsl: ACCENT_HSL.amber, preview: `hsl(${ACCENT_HSL.amber})` },
  { key: "red", label: "Red", hsl: ACCENT_HSL.red, preview: `hsl(${ACCENT_HSL.red})` },
  { key: "pink", label: "Pink", hsl: ACCENT_HSL.pink, preview: `hsl(${ACCENT_HSL.pink})` },
  {
    key: "spectrum",
    label: "Spectrum",
    hsl: ACCENT_HSL.spectrum,
    preview: "conic-gradient(from 180deg, #6366f1, #22d3ee, #22c55e, #f59e0b, #ef4444, #ec4899, #6366f1)",
  },
];

export const BACKGROUND_OPTIONS: { key: BackgroundKey; label: string }[] = [
  { key: "aurora", label: "Aurora" },
  { key: "grid", label: "Grid" },
  { key: "dots", label: "Dots" },
  { key: "minimal", label: "Minimal" },
  { key: "constellation", label: "Constellation" },
];

function readStored(): Preferences {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/** Push the whole preference set onto `<html>`. Idempotent — safe to call on
 *  every change. */
export function applyPreferences(prefs: Preferences) {
  const root = document.documentElement;

  const swatch = ACCENT_SWATCHES.find((s) => s.key === prefs.accent);
  if (swatch?.hsl) root.style.setProperty("--primary", swatch.hsl);
  else root.style.removeProperty("--primary");

  root.dataset.bgStyle = prefs.background;
  root.dataset.motion = prefs.reduceMotion ? "off" : "on";
  root.dataset.ambient = prefs.backgroundEffects ? "on" : "off";
  root.dataset.density = prefs.compact ? "compact" : "cozy";
}

type PreferencesContext = {
  prefs: Preferences;
  setPref: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  ready: boolean;
};

const Ctx = React.createContext<PreferencesContext | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = React.useState<Preferences>(DEFAULT_PREFERENCES);
  const [ready, setReady] = React.useState(false);

  // Read and apply once on mount. The server render and the first client render
  // both use the defaults, so they agree; the stored values land right after.
  // `useEffect` rather than `useLayoutEffect` so there is no SSR warning — the
  // theme's own no-flash script already covers the one visible pref (dark/light).
  React.useEffect(() => {
    const stored = readStored();
    setPrefs(stored);
    applyPreferences(stored);
    setReady(true);
  }, []);

  const setPref = React.useCallback<PreferencesContext["setPref"]>((key, value) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      applyPreferences(next);
      try {
        localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Not persisting is fine; it still applies for this session.
      }
      return next;
    });
  }, []);

  const value = React.useMemo(() => ({ prefs, setPref, ready }), [prefs, setPref, ready]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePreferences(): PreferencesContext {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("usePreferences must be used within a PreferencesProvider");
  return ctx;
}
