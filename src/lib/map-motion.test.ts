import { describe, expect, it } from "vitest";

import {
  choiceFromSwitch,
  motionClass,
  motionIsOn,
  readMotionChoice,
} from "@/lib/map-motion";

/**
 * The whole point of this module is one table, and the row that matters is the
 * last: somebody whose computer asks for less movement, who has not said
 * otherwise, gets none. The switch exists so they *can* say otherwise — for
 * themselves, on their own machine.
 */
describe("who decides whether the map moves", () => {
  it("follows the system until somebody says otherwise", () => {
    expect(motionIsOn("system", false)).toBe(true);
    expect(motionIsOn("system", true)).toBe(false);
  });

  it("lets an explicit choice win in both directions", () => {
    expect(motionIsOn("moving", true)).toBe(true);
    expect(motionIsOn("still", false)).toBe(false);
  });

  it("says nothing at all while the choice is the system's", () => {
    // No class, so the stylesheet's own media query answers. A class restating
    // the system preference would have to be recomputed every time it changed.
    expect(motionClass("system")).toBe("");
    expect(motionClass("moving")).toBe("tf-map-moving");
    expect(motionClass("still")).toBe("tf-map-still");
  });

  it("treats anything it does not recognise as no choice at all", () => {
    // The value comes out of `localStorage`, which anybody can write anything to.
    expect(readMotionChoice(null)).toBe("system");
    expect(readMotionChoice("")).toBe("system");
    expect(readMotionChoice("yes please")).toBe("system");
    expect(readMotionChoice("moving")).toBe("moving");
    expect(readMotionChoice("still")).toBe("still");
  });

  it("writes an explicit value on either side of the switch", () => {
    // Never back to "system": flipping a switch is a decision, and storing
    // "system" for the side that happens to match today would make the switch
    // change meaning the day that preference changed.
    expect(choiceFromSwitch(true)).toBe("moving");
    expect(choiceFromSwitch(false)).toBe("still");
  });
});
