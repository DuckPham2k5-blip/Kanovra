import { describe, expect, it } from "vitest";

import { emphasisSegments, plainText, type TextSegment } from "@/lib/rich-text";

/** Compact view of a result, so an expectation reads like the input did. */
const shape = (segments: TextSegment[]) =>
  segments.map((s) => (s.bold ? `[${s.text}]` : s.text)).join("");

describe("emphasisSegments", () => {
  it("leaves plain text alone", () => {
    expect(emphasisSegments("just an answer")).toEqual([
      { text: "just an answer", bold: false },
    ]);
  });

  it("emphasises a closed run", () => {
    expect(shape(emphasisSegments("press **Export** to download"))).toBe(
      "press [Export] to download",
    );
  });

  it("handles several runs in one answer", () => {
    expect(shape(emphasisSegments("**one** and **two** and **three**"))).toBe(
      "[one] and [two] and [three]",
    );
  });

  /*
   * The behaviour this module was extracted to fix. A plain `split("**")` makes
   * every odd piece bold, so one unclosed delimiter turns the entire rest of an
   * answer bold — and the comment beside that code claimed the opposite, which
   * is how it survived review.
   */
  it("does not let an unclosed run swallow the rest of the answer", () => {
    expect(shape(emphasisSegments("use the **Export button to download"))).toBe(
      "use the Export button to download",
    );
  });

  it("still emphasises the closed runs before an unclosed one", () => {
    expect(shape(emphasisSegments("**one** then **unclosed"))).toBe("[one] then unclosed");
  });

  it("copes with a lone delimiter and with nothing at all", () => {
    expect(emphasisSegments("**")).toEqual([]);
    expect(emphasisSegments("")).toEqual([]);
    expect(shape(emphasisSegments("a ** b"))).toBe("a  b");
  });

  it("drops empty pieces rather than emitting nodes that draw nothing", () => {
    // `**bold**` splits to ["", "bold", ""] and the two ends render nothing.
    expect(emphasisSegments("**bold**")).toEqual([{ text: "bold", bold: true }]);
  });

  it("keeps newlines and spacing, which carry the shape of an answer", () => {
    const segments = emphasisSegments("first line\n\n- a step\n- another");
    expect(segments[0].text).toContain("\n\n");
    expect(plainText("first line\n\n- a step")).toBe("first line\n\n- a step");
  });

  /**
   * The security property, and the reason this returns segments at all.
   *
   * Model output is shaped by what the reader typed. Nothing here may produce a
   * string that a caller could reasonably hand to `innerHTML` — every piece
   * comes back exactly as it went in, tags and all, for the component to put
   * inside a text node.
   */
  describe("it never produces markup", () => {
    const hostile = [
      '<img src=x onerror="alert(1)">',
      "<script>alert(1)</script>",
      "**<b>bold and tagged</b>**",
      "javascript:alert(1)",
      "<style>body{display:none}</style>",
      "&lt;already escaped&gt;",
    ];

    it.each(hostile)("passes %s through untouched, as text", (input) => {
      const segments = emphasisSegments(input);
      const rebuilt = segments.map((s) => s.text).join("");

      // Byte for byte what came in, minus only the emphasis delimiters.
      expect(rebuilt).toBe(input.split("**").join(""));

      // And nothing was invented: no segment carries anything but text.
      for (const segment of segments) {
        expect(Object.keys(segment).sort()).toEqual(["bold", "text"]);
        expect(typeof segment.text).toBe("string");
        expect(typeof segment.bold).toBe("boolean");
      }
    });

    it("does not treat any other markdown as formatting", () => {
      // Only `**` is honoured. Underscores, backticks, brackets and hashes are
      // left as the characters they are — an answer full of half-rendered
      // markdown reads worse than one with none.
      const input = "_em_ `code` [link](http://x) # heading > quote";
      expect(shape(emphasisSegments(input))).toBe(input);
    });
  });
});

describe("plainText", () => {
  it("removes the delimiters and keeps everything else", () => {
    expect(plainText("press **Export** now")).toBe("press Export now");
    expect(plainText("use the **Export button")).toBe("use the Export button");
  });
});
