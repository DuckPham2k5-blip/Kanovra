import { describe, expect, it } from "vitest";

import {
  GENERAL_SUGGESTIONS,
  IMAGE_SUGGESTIONS,
  pagesWithSuggestions,
  suggestionsFor,
  suggestionsForPath,
} from "@/lib/ai-suggestions";
import { PRODUCT_GUIDE } from "@/lib/product-guide";

describe("suggestionsForPath", () => {
  it("offers questions about the page the person came from", () => {
    const s = suggestionsForPath("/w/acme/projects/p1/board");
    expect(s.length).toBeGreaterThan(0);
    expect(s[0].label).toContain("Kanban board");
    expect(s.every((x) => x.group === "this page")).toBe(true);
  });

  /*
   * The point of building these from the guide rather than writing them twice:
   * a suggestion can only ever name a control that is really described, so
   * pressing one cannot produce a question the assistant has no grounding for.
   */
  it("only ever quotes a control that the guide actually describes", () => {
    for (const entry of PRODUCT_GUIDE) {
      const concrete = entry.route.replace("[slug]", "acme").replace(/\[[^\]]+\]/g, "x1");
      for (const s of suggestionsForPath(concrete)) {
        const quoted = s.label.match(/"([^"]+)"/)?.[1];
        if (!quoted) continue;
        expect(
          entry.controls.some((c) => c.label === quoted),
          `${entry.name}: suggestion quotes "${quoted}", which is not a control on that page`,
        ).toBe(true);
      }
    }
  });

  it("says nothing for a page it does not know", () => {
    expect(suggestionsForPath("/w/acme/nope")).toEqual([]);
    expect(suggestionsForPath(null)).toEqual([]);
    expect(suggestionsForPath(undefined)).toEqual([]);
  });
});

describe("suggestionsFor", () => {
  it("puts the current page first, then the general ones", () => {
    const s = suggestionsFor({ pathname: "/w/acme/my-tasks" });
    expect(s[0].group).toBe("this page");
    expect(s.some((x) => x.group === "learn")).toBe(true);
  });

  it("still offers something when the page is unknown", () => {
    const s = suggestionsFor({ pathname: "/w/acme/nowhere" });
    expect(s.length).toBeGreaterThan(0);
  });

  it("caps the list, because nobody reads twenty options", () => {
    expect(suggestionsFor({ pathname: "/w/acme/my-tasks" }).length).toBeLessThanOrEqual(6);
    expect(suggestionsFor({ pathname: null, limit: 3 })).toHaveLength(3);
  });

  /*
   * Claude cannot make pictures. Offering "Make a picture" with only Claude
   * configured is a button that fails when pressed — which teaches people the
   * suggestions are decorative.
   */
  it("offers picture-making only when something can make pictures", () => {
    const without = suggestionsFor({ pathname: null, limit: 50, canMakeImages: false });
    const with_ = suggestionsFor({ pathname: null, limit: 50, canMakeImages: true });
    expect(without.some((s) => s.group === "make")).toBe(false);
    expect(with_.some((s) => s.group === "make")).toBe(true);
  });
});

describe("the suggestions themselves", () => {
  const all = [...GENERAL_SUGGESTIONS, ...IMAGE_SUGGESTIONS];

  it("send more than they show", () => {
    // The label fits a button; the prompt has to be specific enough to get a
    // useful answer. A suggestion whose prompt is just its label is a wasted
    // press.
    for (const s of all) {
      expect(s.prompt.length, s.label).toBeGreaterThan(s.label.length);
      expect(s.label.length, s.label).toBeLessThan(40);
    }
  });

  it("has no duplicate labels", () => {
    const labels = all.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  /*
   * A suggestion is a promise. "Ask it to set up your recurring reports" would
   * commit the product to something it does not do, and the assistant would
   * have to refuse a question the application itself offered.
   */
  it("never promises the assistant will act on the app", () => {
    for (const s of all) {
      expect(s.prompt, s.label).not.toMatch(
        /\b(create|delete|assign|move|archive|send|invite|publish) (the|my|a) (task|project|board|member|link)\b/i,
      );
    }
  });

  it("knows every page, so the grounded set cannot go stale", () => {
    expect(pagesWithSuggestions()).toHaveLength(PRODUCT_GUIDE.length);
  });
});
