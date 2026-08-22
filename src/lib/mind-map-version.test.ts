import { describe, expect, it } from "vitest";

import { mapVersion } from "@/lib/mind-map-version";

/**
 * What counts as "somebody else has changed this map".
 *
 * The two tests that matter here are the two ways this feature fails in the
 * wrong direction. Too sensitive, and a person's own colour change locks their
 * own autosave out for the rest of the session — a false conflict nobody can
 * escape, which is worse than the silent overwrite it replaced. Too blunt, and
 * the overwrite it exists to catch goes through anyway.
 */

const doc = {
  nodes: [{ id: "a", text: "Root", x: 0, y: 0, parentId: null, rank: 1 }],
  radial: { start: -90, sweep: 360 },
  recents: [],
};

describe("mapVersion", () => {
  it("is the same for the same document", () => {
    expect(mapVersion(doc)).toBe(mapVersion(structuredClone(doc)));
  });

  /*
   * The round trip through `jsonb` is the reason this is canonical rather than
   * `JSON.stringify`. Postgres sorts an object's keys as it pleases, so the
   * fingerprint of what was written has to equal the fingerprint of the same
   * document read back — or the save after every save conflicts with itself.
   */
  it("does not care what order the keys arrive in", () => {
    const reordered = {
      recents: [],
      radial: { sweep: 360, start: -90 },
      nodes: [{ rank: 1, parentId: null, y: 0, x: 0, text: "Root", id: "a" }],
    };

    expect(mapVersion(reordered)).toBe(mapVersion(doc));
  });

  it("does care about the order of a list, which is the drawing's own order", () => {
    const swapped = {
      ...doc,
      nodes: [
        { id: "b", text: "Two", x: 10, y: 0, parentId: "a", rank: 1 },
        doc.nodes[0],
      ],
    };
    const other = { ...swapped, nodes: [...swapped.nodes].reverse() };

    expect(mapVersion(swapped)).not.toBe(mapVersion(other));
  });

  it("moves when a node's text changes", () => {
    const edited = { ...doc, nodes: [{ ...doc.nodes[0], text: "Rooted" }] };
    expect(mapVersion(edited)).not.toBe(mapVersion(doc));
  });

  it("moves when a node is added or removed", () => {
    const grown = {
      ...doc,
      nodes: [...doc.nodes, { id: "b", text: "", x: 5, y: 5, parentId: "a", rank: 0 }],
    };

    expect(mapVersion(grown)).not.toBe(mapVersion(doc));
    expect(mapVersion({ ...doc, nodes: [] })).not.toBe(mapVersion(doc));
  });

  it("moves on a change too small to see", () => {
    const nudged = { ...doc, nodes: [{ ...doc.nodes[0], x: 0.0001 }] };
    expect(mapVersion(nudged)).not.toBe(mapVersion(doc));
  });

  it("tells an empty document from a missing one without throwing", () => {
    expect(mapVersion(null)).toBe(mapVersion({}));
    expect(mapVersion(undefined)).toBe(mapVersion({}));
    expect(mapVersion({ nodes: [] })).not.toBe(mapVersion({}));
  });

  it("does not confuse a number with the string of it", () => {
    expect(mapVersion({ rank: 1 })).not.toBe(mapVersion({ rank: "1" }));
  });
});
