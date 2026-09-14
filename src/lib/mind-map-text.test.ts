import { describe, expect, it } from "vitest";

import {
  DEFAULT_FONT,
  FONT_SCALES,
  FONTS,
  fontScaleOf,
  fontStack,
  stepFontScale,
  textFaceCss,
} from "@/lib/mind-map-text";

describe("fontStack", () => {
  it("maps a known key to its stack", () => {
    expect(fontStack("serif")).toBe(FONTS.find((f) => f.key === "serif")!.stack);
  });

  it("falls back to the default for an absent or unknown key — never passes the value through", () => {
    // The key comes from a document anybody with edit rights can post, so an
    // unrecognised one must not reach `font-family`.
    expect(fontStack(undefined)).toBe(DEFAULT_FONT.stack);
    expect(fontStack("'); background:url(x)")).toBe(DEFAULT_FONT.stack);
  });
});

describe("fontScaleOf", () => {
  it("defaults to 1 and clamps nonsense", () => {
    expect(fontScaleOf({ fontScale: null })).toBe(1);
    expect(fontScaleOf({ fontScale: Number.NaN })).toBe(1);
    expect(fontScaleOf({ fontScale: 99 })).toBe(4);
    expect(fontScaleOf({ fontScale: 0 })).toBe(0.4);
    expect(fontScaleOf({ fontScale: 1.25 })).toBe(1.25);
  });
});

describe("stepFontScale", () => {
  it("moves to the next step up and down", () => {
    expect(stepFontScale(1, 1)).toBe(FONT_SCALES[FONT_SCALES.indexOf(1) + 1]);
    expect(stepFontScale(1, -1)).toBe(FONT_SCALES[FONT_SCALES.indexOf(1) - 1]);
  });

  it("holds at the ends, so a button can disable itself", () => {
    const min = FONT_SCALES[0];
    const max = FONT_SCALES[FONT_SCALES.length - 1];
    expect(stepFontScale(min, -1)).toBe(min);
    expect(stepFontScale(max, 1)).toBe(max);
  });

  it("snaps a between-steps value onto the grid", () => {
    expect(stepFontScale(0.9, 1)).toBe(1);
    expect(stepFontScale(0.9, -1)).toBe(0.8);
  });
});

describe("textFaceCss", () => {
  it("emits only what is set, and never a raw font string", () => {
    expect(textFaceCss({})).toEqual({
      fontWeight: undefined,
      fontStyle: undefined,
      textDecoration: undefined,
      fontFamily: DEFAULT_FONT.stack,
    });
    const styled = textFaceCss({ bold: true, italic: true, underline: true, font: "mono" });
    expect(styled.fontWeight).toBe(700);
    expect(styled.fontStyle).toBe("italic");
    expect(styled.textDecoration).toBe("underline");
    expect(styled.fontFamily).toBe(FONTS.find((f) => f.key === "mono")!.stack);
  });
});
