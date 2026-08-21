import { describe, expect, it } from "vitest";

import {
  backgroundImage,
  findBackground,
  isSafeImageUrl,
  MAP_BACKGROUNDS,
  MOTION_STYLES,
  readScenery,
  sceneryCss,
  sceneryInk,
} from "@/lib/map-backgrounds";
import { TONE_NAMES } from "@/lib/mind-map-palette";

describe("the drawn backgrounds", () => {
  it("gives every one its own id", () => {
    const ids = MAP_BACKGROUNDS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every one an accent the palette can actually use", () => {
    for (const item of MAP_BACKGROUNDS) {
      expect(item.palette.hue).toBeGreaterThanOrEqual(0);
      expect(item.palette.hue).toBeLessThan(360);
      expect(TONE_NAMES).toContain(item.palette.tone);
    }
  });

  it("gives every one a motion style the stylesheet knows", () => {
    // The class is built as `tf-motion-${motion}`, so a name with no rule behind
    // it is a background that silently stops moving — nothing fails, nothing
    // logs, and it looks like the switch is off.
    for (const item of MAP_BACKGROUNDS) {
      expect(MOTION_STYLES).toContain(item.motion);
    }
  });

  it("spreads the motion styles about rather than giving them all the same", () => {
    // The whole point of the axis. One style across twenty-seven pictures is the
    // state this replaced.
    const used = new Set(MAP_BACKGROUNDS.map((item) => item.motion));
    expect(used.size).toBeGreaterThanOrEqual(5);
  });

  it("fetches nothing from anywhere", () => {
    // The whole point of drawing these rather than shipping photographs is that
    // opening a map asks the network for nothing. One `<image href="https://…">`
    // slipped into an SVG would put every viewer's address in somebody's logs
    // and would be invisible on screen, because the artwork would still draw.
    for (const item of MAP_BACKGROUNDS) {
      expect(item.svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
      expect(item.svg).not.toMatch(/<image\b/);
      expect(item.svg).not.toMatch(/<script\b/);
    }
  });

  it("wraps each one as a data URI CSS can use", () => {
    const css = backgroundImage(MAP_BACKGROUNDS[0]);
    expect(css.startsWith('url("data:image/svg+xml,')).toBe(true);
    // Encoded, or the first `#` in a colour would end the URI and the rest of
    // the drawing would be read as a fragment.
    expect(css).not.toContain("#");
  });

  it("answers with nothing for an id it does not know", () => {
    expect(findBackground("no-such-thing")).toBeNull();
    expect(findBackground(null)).toBeNull();
  });
});

describe("what counts as a usable link", () => {
  it("takes an ordinary https picture link", () => {
    expect(isSafeImageUrl("https://example.com/a/b.png")).toBe(true);
    expect(isSafeImageUrl("https://example.com/x.gif?v=2&size=large")).toBe(true);
  });

  it("refuses anything that could break out of the CSS it lands in", () => {
    // The value ends up inside `url("…")` in a style declaration.
    for (const bad of [
      'https://e.com/a".png',
      "https://e.com/a'.png",
      "https://e.com/a(b).png",
      "https://e.com/a\\b.png",
      "https://e.com/a b.png",
      "https://e.com/<script>",
    ]) {
      expect(isSafeImageUrl(bad)).toBe(false);
    }
  });

  it("refuses a scheme that is not https", () => {
    expect(isSafeImageUrl("http://example.com/a.png")).toBe(false);
    expect(isSafeImageUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeImageUrl("data:image/svg+xml,<svg/>")).toBe(false);
    expect(isSafeImageUrl("//example.com/a.png")).toBe(false);
  });

  it("refuses one long enough to be a payload rather than an address", () => {
    expect(isSafeImageUrl(`https://e.com/${"a".repeat(3000)}`)).toBe(false);
  });
});

describe("reading the two columns", () => {
  it("is nothing when the map has no scenery", () => {
    expect(readScenery(null, null)).toBeNull();
    expect(readScenery("preset", null)).toBeNull();
    expect(sceneryCss(null)).toBeNull();
    expect(sceneryInk(null)).toBeUndefined();
  });

  it("falls back rather than failing on a preset this build does not have", () => {
    // A row written by a later version, or by one that has since dropped a
    // background. The map draws plainly; it does not draw nothing.
    expect(readScenery("preset", "from-the-future")).toBeNull();
  });

  it("falls back on a link that would not be safe to draw", () => {
    expect(readScenery("url", 'https://e.com/a".png')).toBeNull();
    expect(readScenery("url", "http://e.com/a.png")).toBeNull();
  });

  it("reads a real preset and a real link", () => {
    const preset = readScenery("preset", MAP_BACKGROUNDS[0].id);
    expect(preset?.kind).toBe("preset");
    expect(sceneryCss(preset)?.backgroundSize).toBe("cover");

    const link = readScenery("url", "https://example.com/a.png");
    expect(link).toEqual({ kind: "url", url: "https://example.com/a.png" });
  });

  it("gives light scenery dark ink, and everything else light ink", () => {
    // A node's label would otherwise inherit the theme's foreground, and the
    // theme knows nothing about what the map is standing on.
    const light = MAP_BACKGROUNDS.find((item) => item.scheme === "light");
    const dark = MAP_BACKGROUNDS.find((item) => item.scheme === "dark");
    expect(sceneryInk(readScenery("preset", light!.id))).toBe("#111827");
    expect(sceneryInk(readScenery("preset", dark!.id))).toBe("#e5e7eb");
    // A linked picture is somebody else's and nothing here knows how dark it is.
    expect(sceneryInk(readScenery("url", "https://e.com/a.png"))).toBe("#e5e7eb");
  });
});
