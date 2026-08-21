import { describe, expect, it } from "vitest";

import {
  fillBorder,
  fillCss,
  fillInk,
  gradientEnds,
  luminance,
  nodeFillSchema,
  RECENT_FILL_LIMIT,
  rememberFill,
  type NodeFill,
} from "@/lib/mind-map-fill";

const solid = (hex: string): NodeFill => ({ colors: [hex], angle: 135 });

describe("what a fill will accept", () => {
  it("takes one to four hex colours", () => {
    expect(nodeFillSchema.safeParse({ colors: ["#ffffff"] }).success).toBe(true);
    expect(
      nodeFillSchema.safeParse({ colors: ["#000000", "#ffffff", "#ff0000", "#00ff00"] }).success,
    ).toBe(true);
    expect(nodeFillSchema.safeParse({ colors: [] }).success).toBe(false);
    expect(
      nodeFillSchema.safeParse({ colors: ["#1", "#2", "#3", "#4", "#5"] }).success,
    ).toBe(false);
  });

  it("refuses anything that is not a plain hex colour", () => {
    // This string is interpolated into `linear-gradient(...)` and into an SVG
    // `stop-color`, and the map document is JSON anybody with edit rights can
    // post. A CSS colour followed by a semicolon is the whole problem.
    for (const bad of [
      "red",
      "hsl(0 0% 0%)",
      "#fff",
      "#gggggg",
      "#000000; background: url(x)",
      "url(#evil)",
    ]) {
      expect(nodeFillSchema.safeParse({ colors: [bad] }).success).toBe(false);
    }
  });

  it("refuses an angle off the circle", () => {
    expect(nodeFillSchema.safeParse({ colors: ["#ffffff"], angle: 360 }).success).toBe(false);
    expect(nodeFillSchema.safeParse({ colors: ["#ffffff"], angle: -1 }).success).toBe(false);
  });
});

describe("drawing a fill", () => {
  it("is the colour itself when there is only one", () => {
    expect(fillCss(solid("#123456"))).toBe("#123456");
  });

  it("is a gradient in the chosen direction when there are more", () => {
    expect(fillCss({ colors: ["#000000", "#ffffff"], angle: 90 })).toBe(
      "linear-gradient(90deg, #000000, #ffffff)",
    );
  });
});

describe("keeping a filled node readable", () => {
  it("weighs green far above blue, as the eye does", () => {
    // A plain average calls pure blue mid-bright and puts dark text on it.
    expect(luminance("#00ff00")).toBeGreaterThan(luminance("#0000ff"));
    expect(luminance("#0000ff")).toBeLessThan(0.2);
  });

  it("puts dark ink on light fills and light ink on dark ones", () => {
    expect(fillInk(solid("#fef08a"))).toBe("#101828");
    expect(fillInk(solid("#1e3a8a"))).toBe("#f8fafc");
  });

  it("judges a blend by its lightest stop, because the words cross all of it", () => {
    // Dark ink chosen for the average would be unreadable over the pale end.
    const blend: NodeFill = { colors: ["#1e3a8a", "#fef08a"], angle: 0 };
    expect(fillInk(blend)).toBe(fillInk(solid("#fef08a")));
  });

  it("always gives a filled node an edge, whatever it is filled with", () => {
    // A fill can land on the backdrop's own colour, and a node with no visible
    // extent is a node nobody can find.
    for (const hex of ["#ffffff", "#000000", "#0c1222", "#7c3aed"]) {
      const border = fillBorder(solid(hex));
      expect(border).toMatch(/^#[0-9a-f]{6}$/);
      expect(Math.abs(luminance(border) - luminance(hex))).toBeGreaterThan(0.1);
    }
  });
});

describe("a gradient's direction", () => {
  it("runs top to bottom at 180 and left to right at 90, as CSS does", () => {
    const down = gradientEnds(180);
    expect(down.y2).toBeGreaterThan(down.y1);
    expect(Math.abs(down.x2 - down.x1)).toBeLessThan(0.001);

    const across = gradientEnds(90);
    expect(across.x2).toBeGreaterThan(across.x1);
  });
});

describe("what a map remembers", () => {
  it("puts the newest first", () => {
    const list = rememberFill([solid("#000000")], solid("#ffffff"));
    expect(list[0].colors).toEqual(["#ffffff"]);
  });

  it("does not keep the same colour twice", () => {
    let list = rememberFill([], solid("#ffffff"));
    list = rememberFill(list, solid("#000000"));
    list = rememberFill(list, solid("#ffffff"));
    expect(list).toHaveLength(2);
    expect(list[0].colors).toEqual(["#ffffff"]);
  });

  it("keeps a blend apart from the colours it is made of", () => {
    // Remixing a gradient is the part that costs effort, so it is remembered
    // whole rather than as its stops.
    let list = rememberFill([], solid("#000000"));
    list = rememberFill(list, { colors: ["#000000", "#ffffff"], angle: 45 });
    expect(list).toHaveLength(2);
  });

  it("treats the same colours at a different angle as a different mix", () => {
    let list = rememberFill([], { colors: ["#000000", "#ffffff"], angle: 45 });
    list = rememberFill(list, { colors: ["#000000", "#ffffff"], angle: 180 });
    expect(list).toHaveLength(2);
  });

  it("stops growing", () => {
    let list: NodeFill[] = [];
    for (let i = 0; i < RECENT_FILL_LIMIT + 10; i++) {
      list = rememberFill(list, solid(`#${i.toString(16).padStart(6, "0")}`));
    }
    expect(list).toHaveLength(RECENT_FILL_LIMIT);
  });
});
