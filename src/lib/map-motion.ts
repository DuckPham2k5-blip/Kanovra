/**
 * Whether the lights behind a map drift, and who decides.
 *
 * The system preference is the default and stays the default: somebody whose
 * computer asks for less movement gets less movement without touching anything
 * here. What this adds is the other half — the person looking may put the
 * movement back, for themselves.
 *
 * ## Why this is not stored on the map
 *
 * It was going to be a column beside the background, which is where the rest of
 * a map's appearance lives. It cannot be. `prefers-reduced-motion` exists
 * because moving pictures make some people ill, and a document that could switch
 * motion *on* for whoever opens it would be the exact harm the preference is
 * there to prevent — the author would be answering a medical question on behalf
 * of a reader they have never met.
 *
 * So it lives in the browser it was chosen in. The cost is real and small: the
 * choice does not follow you to another machine.
 *
 * The override is also one-directional in the sense that matters. Choosing
 * `moving` only ever affects the chooser; choosing `still` is always allowed,
 * because asking for less movement needs no permission from anybody.
 */

export type MotionChoice = "system" | "moving" | "still";

/** Where the choice is kept. One key for every map — it is about the person. */
export const MOTION_KEY = "tf-map-motion";

/** Reads whatever `localStorage` holds, tolerating anything it might hold. */
export function readMotionChoice(raw: string | null | undefined): MotionChoice {
  return raw === "moving" || raw === "still" ? raw : "system";
}

/**
 * Whether the lights should be moving, given the choice and what the system
 * asked for.
 */
export function motionIsOn(choice: MotionChoice, systemPrefersReduced: boolean): boolean {
  if (choice === "moving") return true;
  if (choice === "still") return false;
  return !systemPrefersReduced;
}

/**
 * The class the map surface wears.
 *
 * Nothing at all while the choice is `system`, so the media query in the
 * stylesheet is left to answer on its own — a class that restated the system
 * preference would have to be recomputed whenever that preference changed, and
 * CSS already tracks it for free.
 */
export function motionClass(choice: MotionChoice): string {
  if (choice === "moving") return "tf-map-moving";
  if (choice === "still") return "tf-map-still";
  return "";
}

/**
 * The choice to store when somebody flips the switch.
 *
 * Always explicit, never back to `system`. Flipping a switch is a decision, and
 * writing "system" for the value that currently matches the system would make
 * the switch silently change meaning the day that preference changed.
 */
export function choiceFromSwitch(on: boolean): MotionChoice {
  return on ? "moving" : "still";
}
