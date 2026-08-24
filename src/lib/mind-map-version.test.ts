import { MindMapType } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import { mapVersion } from "@/lib/mind-map-version";
import { prisma } from "@/lib/prisma";

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

/**
 * The half of this that only a real database can answer.
 *
 * The version handed back after a write has to equal the version the *next*
 * request computes when it reads the row. That sounds like arithmetic and is
 * not: a `Json` column does not round-trip a double needing 17 significant
 * digits. A node dragged to x = 1142.6673120666271 is stored as
 * 1142.667312066627, so fingerprinting the document we *meant* to write
 * described something the database does not hold — and the next save conflicted
 * with itself. It shipped, because every unit test here passed: the fixtures
 * were written by hand and were too tidy to contain a dragged coordinate.
 *
 * Skipped with no database configured. Configured but unreachable is a failure,
 * not a skip.
 */
const CONFIGURED = !!process.env.DATABASE_URL;
const TAG = `mmv-test-${Date.now().toString(36)}`;

describe.skipIf(!CONFIGURED)("a version taken from the row as stored", () => {
  const made: string[] = [];

  afterAll(async () => {
    if (made.length) await prisma.user.deleteMany({ where: { id: { in: made } } });
  }, 30_000);

  it("still matches when the next request reads it back", async () => {
    const user = await prisma.user.create({
      data: { clerkId: `${TAG}-clerk`, email: `${TAG}@example.test`, name: "Version Fixture" },
    });
    made.push(user.id);

    const workspace = await prisma.workspace.create({
      data: { name: "Version Fixture", slug: TAG, ownerId: user.id },
    });

    const map = await prisma.mindMap.create({
      data: {
        workspaceId: workspace.id,
        type: MindMapType.BUBBLE,
        title: "Version Fixture",
        data: {},
        createdById: user.id,
      },
      select: { id: true },
    });

    // Coordinates of the kind a drag produces, which is where this bites.
    const document = {
      nodes: [
        { id: "a", text: "", x: 1142.6673120666271, y: 150, parentId: null, rank: 0 },
        { id: "b", text: "", x: 0.1 + 0.2, y: -906.5000000000001, parentId: "a", rank: 0 },
      ],
      radial: { start: -90, sweep: 360 },
      recents: [],
    };

    const written = await prisma.mindMap.update({
      where: { id: map.id },
      data: { data: document },
      select: { data: true },
    });

    const readAgain = await prisma.mindMap.findUniqueOrThrow({
      where: { id: map.id },
      select: { data: true },
    });

    /*
     * The first line is the whole reason the second one is written the way it
     * is. If this ever stops being true — a Prisma release that keeps the 17th
     * digit — it fails, and that is a signal to come back and read this, not to
     * delete the line.
     */
    expect(mapVersion(document)).not.toBe(mapVersion(readAgain.data));
    expect(mapVersion(written.data)).toBe(mapVersion(readAgain.data));
  }, 30_000);
});
