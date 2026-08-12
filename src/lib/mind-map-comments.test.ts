import { MindMapType } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

/**
 * What happens to a node's comments when the node goes.
 *
 * `MindMapComment.nodeId` points into a JSON column, so there is no foreign key
 * to cascade — the node is not a row. The cleanup is a `deleteMany` run when a
 * map is saved, and it has one genuinely surprising case: Prisma's `notIn: []`
 * matches *everything*, the opposite of `in: []`. Getting that backwards either
 * leaves every comment orphaned forever or deletes all of them on the next save,
 * and neither shows up until somebody notices a conversation missing.
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

describe.skipIf(!CONFIGURED)("mind map comment cleanup", () => {
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

  /** Exactly the query `updateMindMapData` runs after a save. */
  async function pruneTo(surviving: string[]) {
    await prisma.mindMapComment.deleteMany({
      where: { mapId, nodeId: { notIn: surviving } },
    });
    const left = await prisma.mindMapComment.findMany({
      where: { mapId },
      select: { nodeId: true },
    });
    return left.map((row) => row.nodeId).sort();
  }

  it("keeps the comments whose node survived and drops the rest", async () => {
    await seed(["keep", "keep", "gone", "also-gone"]);
    expect(await pruneTo(["keep", "other"])).toEqual(["keep", "keep"]);
  });

  it("leaves everything alone when every node is still there", async () => {
    await seed(["a", "b"]);
    expect(await pruneTo(["a", "b"])).toEqual(["a", "b"]);
  });

  it("deletes every comment when the map is saved with no nodes at all", async () => {
    // The `notIn: []` case. Semantically right — no nodes means no node
    // comments — but it is the opposite of how `in: []` behaves, so it is pinned
    // here rather than left to be rediscovered.
    await seed(["a", "b"]);
    expect(await pruneTo([])).toEqual([]);
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
