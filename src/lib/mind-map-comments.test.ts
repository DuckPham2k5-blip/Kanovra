import { MindMapType } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

/**
 * What happens to a node's comments when the node goes.
 *
 * `MindMapComment.nodeId` points into a JSON column, so there is no foreign key
 * to cascade — the node is not a row. Saving used to sweep the orphans with a
 * `deleteMany`, whose genuinely surprising case was Prisma's `notIn: []`
 * matching *everything*, the opposite of `in: []`.
 *
 * That sweep is gone. It was safe while a save took a deliberate press and is
 * not safe on a 1.2-second timer: the same query would fire a moment after a
 * mis-click, destroying a thread nobody was looking at. An orphan is now hidden
 * instead — nothing reads a comment whose node is not in the document — and the
 * row survives to be recovered.
 *
 * The rule is pinned in that direction rather than left untested, because it is
 * still true that getting it wrong either way stays invisible until somebody
 * notices a conversation missing.
 *
 * Skipped when there is no database configured — someone checked the repo out
 * and ran the tests. Configured but unreachable is a failure, not a skip: that
 * is a broken environment, and swallowing it would let this suite report success
 * without once touching the thing it exists to prove.
 */

const CONFIGURED = !!process.env.DATABASE_URL;
const TAG = `mmc-test-${Date.now().toString(36)}`;

let mapId = "";
let userId = "";
let workspaceId = "";

describe.skipIf(!CONFIGURED)("mind map comments when a node goes", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { clerkId: `${TAG}-clerk`, email: `${TAG}@example.test`, name: "Cleanup Fixture" },
    });
    userId = user.id;

    const workspace = await prisma.workspace.create({
      data: { name: "Cleanup Fixture", slug: TAG, ownerId: user.id },
    });
    workspaceId = workspace.id;

    const map = await prisma.mindMap.create({
      data: {
        workspaceId: workspace.id,
        type: MindMapType.BUBBLE,
        title: "Cleanup Fixture",
        data: { nodes: [] },
        createdById: user.id,
      },
    });
    mapId = map.id;
  }, 30_000);

  afterAll(async () => {
    // Deleting the workspace cascades to the map; deleting the user cascades to
    // anything of theirs left behind. Nothing of this fixture survives the run.
    if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });

  async function seed(nodeIds: string[]) {
    await prisma.mindMapComment.deleteMany({ where: { mapId } });
    await prisma.mindMapComment.createMany({
      data: nodeIds.map((nodeId, index) => ({
        mapId,
        nodeId,
        authorId: userId,
        body: `comment ${index}`,
      })),
    });
  }

  /**
   * What a save now leaves behind.
   *
   * `updateMindMapData` used to run `deleteMany({ nodeId: { notIn: surviving } })`
   * here, and these tests pinned it — including the `notIn: []` case, which
   * matches everything and is the exact opposite of `in: []`.
   *
   * That query is gone. It was safe while saving took a deliberate press: remove
   * a box, decide you meant it, press Save. Autosave fires a second after the
   * box disappears, which would turn a mis-click into a destroyed thread on a
   * timer, with nobody watching — you are not looking at a comment panel at the
   * moment you delete the node it hangs off.
   *
   * So the rule inverted, and it is pinned in that direction rather than left
   * untested. Getting this wrong in either direction is invisible until somebody
   * notices a conversation missing, which is the whole reason this file exists.
   */
  async function afterSaveWith(surviving: string[]) {
    await updateMapData(surviving);
    const left = await prisma.mindMapComment.findMany({
      where: { mapId },
      select: { nodeId: true },
    });
    return left.map((row) => row.nodeId).sort();
  }

  /** The half of `updateMindMapData` that touches this map's rows. */
  async function updateMapData(nodeIds: string[]) {
    await prisma.mindMap.update({
      where: { id: mapId },
      data: {
        data: {
          nodes: nodeIds.map((id) => ({ id, text: "", x: 0, y: 0, parentId: null, rank: 0 })),
        },
      },
    });
  }

  it("keeps a comment whose node has gone, so a mis-click can be undone", async () => {
    await seed(["keep", "keep", "gone", "also-gone"]);
    expect(await afterSaveWith(["keep", "other"])).toEqual([
      "also-gone",
      "gone",
      "keep",
      "keep",
    ]);
  });

  it("leaves everything alone when every node is still there", async () => {
    await seed(["a", "b"]);
    expect(await afterSaveWith(["a", "b"])).toEqual(["a", "b"]);
  });

  it("keeps them even when the map is saved with no nodes at all", async () => {
    // This was the `notIn: []` case, and it deleted every comment in the map.
    // An empty document is exactly when somebody has cleared the canvas by
    // accident, which is the worst possible moment to also drop the discussion.
    await seed(["a", "b"]);
    expect(await afterSaveWith([])).toEqual(["a", "b"]);
  });

  it("takes its comments with it when the map is deleted", async () => {
    const map = await prisma.mindMap.create({
      data: {
        workspaceId,
        type: MindMapType.BUBBLE,
        title: "Doomed",
        data: { nodes: [] },
        createdById: userId,
      },
    });
    await prisma.mindMapComment.create({
      data: { mapId: map.id, nodeId: "n1", authorId: userId, body: "goodbye" },
    });

    await prisma.mindMap.delete({ where: { id: map.id } });

    expect(await prisma.mindMapComment.count({ where: { mapId: map.id } })).toBe(0);
  });
});
