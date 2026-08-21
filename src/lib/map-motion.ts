/**
 * Whether the lights behind a map drift, and who decides.
 *
 * The lights move by default, for everybody, and the switch is how one person
 * stops them in their own browser. It began the other way round — following
 * `prefers-reduced-motion` — and the owner asked twice for a backdrop that
 * moves, could not see it move on their own machine because of that preference,
 * and asked again once it was explained. `globals.css` carries the trade in
 * full.
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
 * Either way the choice only ever affects the person who made it. Asking for
 * less movement needs no permission from anybody, and asking for more cannot be
 * done on anybody else's behalf.
 */

export type MotionChoice = "system" | "moving" | "still";

/** Where the choice is kept. One key for every map — it is about the person. */
export const MOTION_KEY = "tf-map-motion";

/** Reads whatever `localStorage` holds, tolerating anything it might hold. */
export function readMotionChoice(raw: string | null | undefined): MotionChoice {
  return raw === "moving" || raw === "still" ? raw : "system";
}

/**
 * Whether the lights should be moving.
 *
 * They move unless somebody has said not to. `prefers-reduced-motion` used to
 * decide this and no longer does — see the note in `globals.css` for what that
 * costs and why it was asked for anyway. The choice is still per person and per
 * browser; what changed is only which way it starts.
 */
export function motionIsOn(choice: MotionChoice): boolean {
  return choice !== "still";
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
