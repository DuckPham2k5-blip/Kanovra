import { TaskStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { restoreTasks, snapshotSchema, snapshotTasks } from "@/lib/task-snapshot";

/**
 * Deleting a task and putting it back.
 *
 * Against a real database, because the whole risk here is drift: the snapshot
 * lists columns by hand, and a field added to `Task` next month is a field this
 * silently stops carrying. A restore that loses the due date is not an error
 * anybody sees — the task comes back looking almost right.
 *
 * The delete itself is Postgres's own cascade, so exercising it here is also the
 * only place that proves the cascade reaches what the snapshot claims to cover.
 *
 * Skipped when there is no database configured — someone checked the repo out
 * and ran the tests. Configured but unreachable is a failure, not a skip.
 */

const CONFIGURED = !!process.env.DATABASE_URL;
const TAG = `snap-test-${Date.now().toString(36)}`;

let userId = "";
let workspaceId = "";
let projectId = "";
let columnId = "";
let labelId = "";

describe.skipIf(!CONFIGURED)("task snapshot and restore", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { clerkId: `${TAG}-clerk`, email: `${TAG}@example.test`, name: "Snapshot Fixture" },
    });
    userId = user.id;

    const workspace = await prisma.workspace.create({
      data: { name: "Snapshot Fixture", slug: TAG, ownerId: user.id },
    });
    workspaceId = workspace.id;

    const project = await prisma.project.create({
      data: { workspaceId, name: "Snapshot", key: "SNP", createdById: user.id },
    });
    projectId = project.id;

    const column = await prisma.boardColumn.create({
      data: { projectId, name: "Todo", order: 1000, status: TaskStatus.TODO },
    });
    columnId = column.id;

    const label = await prisma.label.create({
      data: { workspaceId, name: "urgent", color: "#f00" },
    });
    labelId = label.id;
  }, 30_000);

  afterAll(async () => {
    if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });

  /** A parent with a subtask, a label, a checklist item, a comment and a file. */
  async function seedTree(number: number) {
    const parent = await prisma.task.create({
      data: {
        projectId,
        columnId,
        number,
        title: "Parent",
        description: "has everything",
        status: TaskStatus.IN_PROGRESS,
        createdById: userId,
        assigneeId: userId,
        dueDate: new Date("2026-09-01T00:00:00Z"),
        estimate: 3.5,
      },
    });

    await prisma.task.create({
      data: { projectId, number: number + 1, title: "Child", createdById: userId, parentId: parent.id },
    });
    await prisma.taskLabel.create({ data: { taskId: parent.id, labelId } });
    await prisma.checklistItem.create({
      data: { taskId: parent.id, title: "step one", order: 1000, done: true },
    });
    await prisma.comment.create({
      data: { taskId: parent.id, authorId: userId, content: "a remark" },
    });
    await prisma.attachment.create({
      data: { taskId: parent.id, name: "note.pdf", url: "abc123", size: 42, mimeType: "application/pdf" },
    });

    return parent.id;
  }

  it("captures the whole tree, parents before children", async () => {
    const rootId = await seedTree(100);
    const snapshot = await snapshotTasks([rootId]);

    expect(snapshot.tasks).toHaveLength(2);
    expect(snapshot.tasks[0].id).toBe(rootId);
    expect(snapshot.tasks[1].parentId).toBe(rootId);

    const root = snapshot.tasks[0];
    expect(root.labelIds).toEqual([labelId]);
    expect(root.checklist).toHaveLength(1);
    expect(root.comments).toHaveLength(1);
    expect(root.attachments).toHaveLength(1);

    await prisma.task.deleteMany({ where: { projectId } });
  });

  /*
   * The whole point. A restore that loses a field is invisible — the task comes
   * back looking almost right — so every column the snapshot claims to carry is
   * compared, not just the title.
   */
  it("puts the tree back with its fields, ids and children intact", async () => {
    const rootId = await seedTree(200);
    const before = await prisma.task.findUniqueOrThrow({
      where: { id: rootId },
      include: { labels: true, checklistItems: true, comments: true, attachments: true },
    });
    const snapshot = await snapshotTasks([rootId]);

    await prisma.task.delete({ where: { id: rootId } });
    expect(await prisma.task.count({ where: { projectId } })).toBe(0);

    // Through the schema, exactly as the action does after reading the JSON back.
    const parsed = snapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)));
    // One task restored, not two: the subtask came back as part of its parent,
    // which is how the delete counted it and how the list shows it.
    const counts = await restoreTasks(parsed, projectId);
    expect(counts).toEqual({ restored: 1, skipped: 0 });

    const after = await prisma.task.findUniqueOrThrow({
      where: { id: rootId },
      include: { labels: true, checklistItems: true, comments: true, attachments: true },
    });

    expect(after.title).toBe(before.title);
    expect(after.description).toBe(before.description);
    expect(after.status).toBe(before.status);
    expect(after.number).toBe(before.number);
    expect(after.columnId).toBe(before.columnId);
    expect(after.assigneeId).toBe(before.assigneeId);
    expect(after.estimate).toBe(before.estimate);
    expect(after.dueDate?.toISOString()).toBe(before.dueDate?.toISOString());
    expect(after.createdAt.toISOString()).toBe(before.createdAt.toISOString());

    expect(after.labels.map((l) => l.labelId)).toEqual([labelId]);
    expect(after.checklistItems[0].title).toBe(before.checklistItems[0].title);
    expect(after.checklistItems[0].done).toBe(true);
    expect(after.comments[0].id).toBe(before.comments[0].id);
    expect(after.comments[0].content).toBe(before.comments[0].content);
    expect(after.attachments[0].url).toBe(before.attachments[0].url);

    // The subtask came back too, still hanging off its parent.
    const child = await prisma.task.findFirst({ where: { parentId: rootId } });
    expect(child?.title).toBe("Child");

    await prisma.task.deleteMany({ where: { projectId } });
  });

  /*
   * Pressing undo twice is the ordinary way this goes wrong: the toast is still
   * on screen after the first press. The second must be inert rather than a
   * primary-key error surfaced as "something went wrong".
   */
  it("is safe to restore twice", async () => {
    const rootId = await seedTree(300);
    const snapshot = await snapshotTasks([rootId]);
    await prisma.task.delete({ where: { id: rootId } });

    await restoreTasks(snapshot, projectId);
    await expect(restoreTasks(snapshot, projectId)).resolves.toBeDefined();
    expect(await prisma.task.count({ where: { projectId } })).toBe(2);

    await prisma.task.deleteMany({ where: { projectId } });
  });

  /*
   * A label deleted while the task was in the bin must not block the rescue. The
   * task is what somebody is trying to get back; the label is not.
   */
  it("still restores the task when something it referenced has gone", async () => {
    const rootId = await seedTree(400);

    // A second label, disposable, so the shared fixture survives for the tests
    // after this one — deleting that one made the next two fail to seed at all.
    const doomed = await prisma.label.create({
      data: { workspaceId, name: "doomed", color: "#0f0" },
    });
    await prisma.taskLabel.create({ data: { taskId: rootId, labelId: doomed.id } });

    const snapshot = await snapshotTasks([rootId]);
    await prisma.task.delete({ where: { id: rootId } });
    await prisma.label.delete({ where: { id: doomed.id } });

    const counts = await restoreTasks(snapshot, projectId);
    expect(counts.restored).toBe(1);

    const after = await prisma.task.findUniqueOrThrow({
      where: { id: rootId },
      include: { labels: true },
    });
    // The label that survived comes back; the one that went is simply absent,
    // and its absence did not stop the task returning.
    expect(after.labels.map((link) => link.labelId)).toEqual([labelId]);
    expect(after.title).toBe("Parent");

    await prisma.task.deleteMany({ where: { projectId } });
  });

  it("refuses to write a snapshot into a project it did not come from", async () => {
    const other = await prisma.project.create({
      data: { workspaceId, name: "Elsewhere", key: "ELS", createdById: userId },
    });
    const rootId = await seedTree(500);
    const snapshot = await snapshotTasks([rootId]);
    await prisma.task.delete({ where: { id: rootId } });

    const counts = await restoreTasks(snapshot, other.id);
    expect(counts).toEqual({ restored: 0, skipped: 2 });
    expect(await prisma.task.count({ where: { projectId: other.id } })).toBe(0);
  });
});
