import { describe, expect, it } from "vitest";

import {
  choiceFromSwitch,
  motionClass,
  motionIsOn,
  readMotionChoice,
} from "@/lib/map-motion";

/**
 * One table, and the row that matters is `still`: it is the only value that
 * stops the lights, and it can only ever be written by the person looking at
 * them.
 */
describe("who decides whether the map moves", () => {
  it("moves until somebody says not to", () => {
    expect(motionIsOn("system")).toBe(true);
    expect(motionIsOn("moving")).toBe(true);
    expect(motionIsOn("still")).toBe(false);
  });

  it("says nothing at all until somebody has chosen", () => {
    // No class, so the stylesheet's own rule runs and the lights drift. Only
    // `still` needs to say anything, because only `still` changes what happens.
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
