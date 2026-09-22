/**
 * The one source of truth for the appearance preferences, shared by the runtime
 * that applies them (`use-preferences.tsx`, a client module) and the blocking
 * `<head>` script that applies them before first paint (`layout.tsx`, a server
 * module). Kept in a plain, directive-free module so both sides can import it —
 * a `"use client"` export cannot be read as a real string on the server.
 *
 * Deriving the init script from `ACCENT_HSL` here is what stops the two copies
 * drifting: add a swatch in one place and the no-flash path learns it for free.
 */

export const APPEARANCE_STORAGE_KEY = "kanovra-appearance";

/** The non-default accent swatches, as `--primary` HSL triplets. `default`
 *  clears the override and restores the theme's own indigo, so it is absent. */
export const ACCENT_HSL: Record<string, string> = {
  blue: "217 91% 60%",
  cyan: "189 94% 43%",
  green: "142 71% 45%",
  amber: "38 92% 50%",
  red: "0 84% 60%",
  pink: "330 81% 60%",
  spectrum: "280 89% 63%",
};

/**
 * A self-contained script that reads the stored preferences and applies them to
 * `<html>` synchronously, before the document paints. Mirrors
 * `applyPreferences`; runs in a try/catch so blocked or malformed storage is a
 * no-op that leaves the server-rendered defaults in place.
 */
export const APPEARANCE_INIT_SCRIPT = `(function(){try{
var raw=localStorage.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEY)});
if(!raw)return;
var p=JSON.parse(raw);
var root=document.documentElement;
var accents=${JSON.stringify(ACCENT_HSL)};
if(p.accent==="spectrum")root.dataset.spectrum="on";
else if(p.accent&&accents[p.accent])root.style.setProperty("--primary",accents[p.accent]);
if(p.background)root.dataset.bgStyle=p.background;
root.dataset.motion=p.reduceMotion?"off":"on";
root.dataset.ambient=p.backgroundEffects===false?"off":"on";
root.dataset.density=p.compact?"compact":"cozy";
}catch(e){}})();`;
