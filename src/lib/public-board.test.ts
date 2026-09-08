import { Priority, TaskStatus } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { getPublicBoard } from "@/lib/public-board";
import { randomShareToken, SHARE_VIEW_STAMP_MS } from "@/lib/share-link";

/**
 * The public read path, against a real database.
 *
 * This is the one query in the application that answers somebody with no
 * session, so the four conditions that gate it are proven here rather than
 * reasoned about: the wrong token, the expired token, the revoked token, and a
 * board that does resolve carrying nothing it should not.
 *
 * It has to be a real database. The interesting failures are a `where` clause
 * that matches more than it says, a `select` that pulls a relation nobody asked
 * for, and a unique index that does not hold — and a mocked client answers all
 * three exactly as its author expected. `email` in particular travels through
 * an `include` two levels down; a fixture would only ever contain what this
 * test put there.
 *
 * Skipped with no `DATABASE_URL`, which is somebody who has just cloned the
 * repo. Configured but unreachable is a failure, not a skip.
 */

const CONFIGURED = !!process.env.DATABASE_URL;
const TAG = `share-test-${Date.now().toString(36)}`;
const ASSIGNEE_EMAIL = `${TAG}-assignee@example.test`;

let userId = "";
let assigneeId = "";
let workspaceId = "";
let projectId = "";
let columnId = "";

describe.skipIf(!CONFIGURED)("getPublicBoard", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { clerkId: `${TAG}-clerk`, email: `${TAG}@example.test`, name: "Share Fixture" },
    });
    userId = user.id;

    const assignee = await prisma.user.create({
      data: {
        clerkId: `${TAG}-clerk-2`,
        email: ASSIGNEE_EMAIL,
        name: "Assigned Person",
      },
    });
    assigneeId = assignee.id;

    const workspace = await prisma.workspace.create({
      data: { name: "Share Fixture", slug: TAG, ownerId: user.id },
    });
    workspaceId = workspace.id;

    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: "Share Fixture Project",
        key: "SHR",
        description: "A board that goes public",
        createdById: user.id,
      },
    });
    projectId = project.id;

    const column = await prisma.boardColumn.create({
      data: { projectId: project.id, name: "Doing", order: 1, status: TaskStatus.IN_PROGRESS },
    });
    columnId = column.id;

    await prisma.task.create({
      data: {
        projectId: project.id,
        columnId: column.id,
        number: 1,
        title: "A visible task",
        status: TaskStatus.IN_PROGRESS,
        priority: Priority.HIGH,
        order: 1,
        createdById: user.id,
        assigneeId: assignee.id,
      },
    });
  }, 30_000);

  afterAll(async () => {
    if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    if (assigneeId) await prisma.user.delete({ where: { id: assigneeId } }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });

  beforeEach(async () => {
    await prisma.shareLink.deleteMany({ where: { projectId } });
  });

  async function publish(expiresAt: Date | null = null, lastViewedAt: Date | null = null) {
    const token = randomShareToken();
    await prisma.shareLink.create({
      data: { projectId, token, createdById: userId, expiresAt, lastViewedAt },
    });
    return token;
  }

  it("serves the board behind a live token", async () => {
    const token = await publish();
    const board = await getPublicBoard(token);

    expect(board).not.toBeNull();
    expect(board?.project.name).toBe("Share Fixture Project");
    expect(board?.project.key).toBe("SHR");
    expect(board?.columns.map((c) => c.name)).toEqual(["Doing"]);
    expect(board?.tasks.map((t) => t.title)).toEqual(["A visible task"]);
    expect(board?.tasks[0]?.columnId).toBe(columnId);
  });

  /*
   * The reason the narrowing exists, proven end to end rather than on a hand
   * written card. The assignee's address is really in this database, really
   * pulled by `getBoardData`'s include, and must not be in what comes back.
   */
  it("does not carry the assignee's email address off the server", async () => {
    const token = await publish();
    const board = await getPublicBoard(token);

    expect(board?.tasks[0]?.assignee?.name).toBe("Assigned Person");
    expect(JSON.stringify(board)).not.toContain(ASSIGNEE_EMAIL);
    expect(JSON.stringify(board)).not.toContain("@example.test");
  });

  it("carries nothing that identifies the workspace or the project row", async () => {
    const token = await publish();
    const serialised = JSON.stringify(await getPublicBoard(token));

    // A visitor gets a board, not a way to address anything behind it.
    expect(serialised).not.toContain(workspaceId);
    expect(serialised).not.toContain(projectId);
    expect(serialised).not.toContain(TAG);
  });

  it("answers a token that was never issued with nothing", async () => {
    await publish();
    expect(await getPublicBoard(randomShareToken())).toBeNull();
  });

  it("answers a malformed token without touching the database", async () => {
    await publish();
    for (const junk of ["", "wp-admin", "../../projects", "a".repeat(200)]) {
      expect(await getPublicBoard(junk), junk).toBeNull();
    }
  });

  it("stops serving an expired link", async () => {
    const token = await publish(new Date(Date.now() - 1000));
    expect(await getPublicBoard(token)).toBeNull();
  });

  it("still serves a link that expires later today", async () => {
    const token = await publish(new Date(Date.now() + 60_000));
    expect(await getPublicBoard(token)).not.toBeNull();
  });

  /*
   * Two calls with the same token, either side of a delete, must give different
   * answers — so nothing between the address bar and the row is holding an
   * older copy. This is why the read path is not wrapped in React's `cache`:
   * within one request there is exactly one caller, and a memo nobody exercises
   * is a memo whose behaviour has never been seen.
   */
  it("stops serving the moment the row is deleted", async () => {
    const token = await publish();
    expect(await getPublicBoard(token)).not.toBeNull();

    await prisma.shareLink.deleteMany({ where: { token } });
    expect(await getPublicBoard(token)).toBeNull();
  });

  /*
   * One board, one secret. Two links to one project would leave an address that
   * the interface never shows and therefore nobody can revoke, so the database
   * refuses the second rather than the application remembering to.
   */
  it("refuses a second link on the same project", async () => {
    await publish();
    await expect(
      prisma.shareLink.create({
        data: { projectId, token: randomShareToken(), createdById: userId },
      }),
    ).rejects.toThrow();
  });

  it("records a view, and then holds off", async () => {
    const token = await publish();
    await getPublicBoard(token);

    // The stamp is deliberately not awaited by the read, so give it a moment.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const first = await prisma.shareLink.findUnique({ where: { token } });
    expect(first?.lastViewedAt).not.toBeNull();

    // One link per project, so the first has to go before the next is minted —
    // which is the unique index above being enforced rather than assumed.
    await prisma.shareLink.deleteMany({ where: { projectId } });
    const fresh = await publish(null, new Date(Date.now() - SHARE_VIEW_STAMP_MS + 60_000));
    const before = (await prisma.shareLink.findUnique({ where: { token: fresh } }))?.lastViewedAt;
    await getPublicBoard(fresh);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const after = (await prisma.shareLink.findUnique({ where: { token: fresh } }))?.lastViewedAt;
    expect(after?.toISOString()).toBe(before?.toISOString());
  });

  it("takes the link with the project when the project goes", async () => {
    const throwaway = await prisma.project.create({
      data: {
        workspaceId,
        name: "Throwaway",
        key: "THR",
        createdById: userId,
      },
    });
    const token = randomShareToken();
    await prisma.shareLink.create({
      data: { projectId: throwaway.id, token, createdById: userId },
    });

    await prisma.project.delete({ where: { id: throwaway.id } });
    expect(await prisma.shareLink.findUnique({ where: { token } })).toBeNull();
    expect(await getPublicBoard(token)).toBeNull();
  });
});
