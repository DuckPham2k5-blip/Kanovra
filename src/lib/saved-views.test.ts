import { describe, expect, it } from "vitest";

import { viewFilterCount, viewQuery } from "@/lib/saved-views";

/**
 * What is allowed into a saved view.
 *
 * The interesting cases are all about what must *not* survive: the address bar
 * carries the open task panel and whatever else a page has put there, and a view
 * is shared with the workspace.
 */

describe("viewQuery", () => {
  it("keeps the filters", () => {
    const out = viewQuery("status=TODO&assignee=abc&sort=due&q=bill&priority=HIGH&label=xyz");
    expect(new URLSearchParams(out).get("status")).toBe("TODO");
    expect(new URLSearchParams(out).get("assignee")).toBe("abc");
    expect(new URLSearchParams(out).get("q")).toBe("bill");
  });

  /*
   * The one that matters. `?task=` opens the detail panel, and a view carrying it
   * would reopen one person's task for everybody who used the view.
   */
  it("drops the open task panel", () => {
    expect(viewQuery("status=TODO&task=cmsie7x9d001rurfojwpx2ywr")).toBe("status=TODO");
  });

  it("drops anything else it was not told about", () => {
    expect(viewQuery("status=TODO&utm_source=mail&redirect=/elsewhere")).toBe("status=TODO");
  });

  it("gives the same string however the filters were ordered", () => {
    expect(viewQuery("sort=due&status=TODO")).toBe(viewQuery("status=TODO&sort=due"));
  });

  it("drops an empty value rather than storing a filter that does nothing", () => {
    expect(viewQuery("q=&status=TODO")).toBe("status=TODO");
    expect(viewQuery("q=%20%20&status=TODO")).toBe("status=TODO");
  });

  it("survives a query string that is empty or nonsense", () => {
    expect(viewQuery("")).toBe("");
    expect(viewQuery("????")).toBe("");
  });

  it("keeps a search phrase whole, spaces and accents included", () => {
    const out = viewQuery("q=bộ lọc nâng cao");
    expect(new URLSearchParams(out).get("q")).toBe("bộ lọc nâng cao");
  });
});

describe("viewFilterCount", () => {
  it("counts what narrows the list", () => {
    expect(viewFilterCount("status=TODO&assignee=abc")).toBe(2);
  });

  /*
   * A sort is not a filter. Counting it would put "3 filters" on a view that
   * hides nothing and merely reorders, and somebody would go looking for the
   * third one.
   */
  it("does not count the sort", () => {
    expect(viewFilterCount("sort=due")).toBe(0);
    expect(viewFilterCount("status=TODO&sort=due")).toBe(1);
  });

  it("counts nothing in an empty view", () => {
    expect(viewFilterCount("")).toBe(0);
  });
});
