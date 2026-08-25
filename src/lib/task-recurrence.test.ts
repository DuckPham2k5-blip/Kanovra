import { Priority, TaskStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { formatRecurrence } from "@/lib/recurrence";
import { spawnNextOccurrence } from "@/lib/task-recurrence";

/**
 * What the next occurrence inherits, and what it must not.
 *
 * The arithmetic is covered by `recurrence.test.ts` without a database. This is
 * the copying, which is where the mistakes are invisible: a checklist that comes
 * back already ticked, a rule left on both rows so the task doubles every cycle,
 * or last week's comments arriving on this week's work.
 *
 * Skipped with no database configured. Configured but unreachable is a failure.
 */
const CONFIGURED = !!process.env.DATABASE_URL;
const TAG = `rec-test-${Date.now().toString(36)}`;

let userId = "";
let workspaceId = "";
let projectId = "";
let todoColumnId = "";
let labelId = "";

describe.skipIf(!CONFIGURED)("spawnNextOccurrence", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { clerkId: `${TAG}-clerk`, email: `${TAG}@example.test`, name: "Recurrence Fixture" },
    });
    userId = user.id;

    const workspace = await prisma.workspace.create({
      data: { name: "Recurrence Fixture", slug: TAG, ownerId: user.id },
    });
    workspaceId = workspace.id;

    const project = await prisma.project.create({
      data: { workspaceId, name: "Recurrence", key: "REC", createdById: user.id },
    });
    projectId = project.id;

    const column = await prisma.boardColumn.create({
      data: { projectId, name: "Todo", order: 1000, status: TaskStatus.TODO },
    });
    todoColumnId = column.id;

    const label = await prisma.label.create({ data: { workspaceId, name: `${TAG}-label` } });
    labelId = label.id;
  }, 30_000);

  afterAll(async () => {
    if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });

  async function seedWeekly(number: number, dueDate: Date | null) {
    const task = await prisma.task.create({
      data: {
        projectId,
        columnId: todoColumnId,
        number,
        title: "Weekly report",
        description: "the usual",
        status: TaskStatus.DONE,
        priority: Priority.HIGH,
        estimate: 2,
        assigneeId: userId,
        createdById: userId,
        dueDate,
        recurrence: formatRecurrence({ freq: "WEEKLY", interval: 1 }),
      },
    });

    await prisma.taskLabel.create({ data: { taskId: task.id, labelId } });
    await prisma.checklistItem.create({
      data: { taskId: task.id, title: "gather numbers", order: 1000, done: true },
    });
    await prisma.comment.create({
      data: { taskId: task.id, authorId: userId, content: "done for this week" },
    });

    return task;
  }

  it("carries the work over and leaves the record behind", async () => {
    const task = await seedWeekly(100, new Date("2026-03-02T00:00:00.000Z"));

    const spawned = await spawnNextOccurrence(task, new Date("2026-03-04T00:00:00.000Z"));
    expect(spawned).not.toBeNull();

    const next = await prisma.task.findUniqueOrThrow({
      where: { id: spawned!.id },
      include: { labels: true, checklistItems: true, comments: true },
    });

    // The work.
    expect(next.title).toBe("Weekly report");
    expect(next.description).toBe("the usual");
    expect(next.priority).toBe(Priority.HIGH);
    expect(next.estimate).toBe(2);
    expect(next.assigneeId).toBe(userId);
    expect(next.labels.map((link) => link.labelId)).toEqual([labelId]);

    // Open, on the Todo column, due a week after the *due date*.
    expect(next.status).toBe(TaskStatus.TODO);
    expect(next.columnId).toBe(todoColumnId);
    expect(next.completedAt).toBeNull();
    expect(next.dueDate?.toISOString().slice(0, 10)).toBe("2026-03-09");

    // The checklist comes back to be done again, not already done.
    expect(next.checklistItems).toHaveLength(1);
    expect(next.checklistItems[0].done).toBe(false);
    expect(next.checklistItems[0].title).toBe("gather numbers");

    // Last week's conversation belongs to last week.
    expect(next.comments).toHaveLength(0);

    await prisma.task.deleteMany({ where: { projectId } });
  });

  /*
   * The guard against doubling. The rule moves rather than being copied, so a
   * task that is reopened and ticked again finds nothing left to fire — without
   * it, every reopen adds an occurrence and a weekly task quietly becomes two.
   */
  it("moves the rule, so a second completion spawns nothing", async () => {
    const task = await seedWeekly(200, new Date("2026-03-02T00:00:00.000Z"));

    const first = await spawnNextOccurrence(task, new Date("2026-03-04T00:00:00.000Z"));
    expect(first).not.toBeNull();

    const cleared = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(cleared.recurrence).toBeNull();

    const again = await spawnNextOccurrence(cleared, new Date("2026-03-05T00:00:00.000Z"));
    expect(again).toBeNull();

    const next = await prisma.task.findUniqueOrThrow({ where: { id: first!.id } });
    expect(next.recurrence).toBe("WEEKLY:1");

    await prisma.task.deleteMany({ where: { projectId } });
  });

  it("does nothing at all for a task that does not repeat", async () => {
    const plain = await prisma.task.create({
      data: { projectId, number: 300, title: "One-off", createdById: userId },
    });

    expect(await spawnNextOccurrence(plain, new Date())).toBeNull();
    expect(await prisma.task.count({ where: { projectId } })).toBe(1);

    await prisma.task.deleteMany({ where: { projectId } });
  });

  it("counts from the completion when there was no due date", async () => {
    const task = await seedWeekly(400, null);

    const spawned = await spawnNextOccurrence(task, new Date("2026-03-04T00:00:00.000Z"));
    const next = await prisma.task.findUniqueOrThrow({ where: { id: spawned!.id } });

    // The date handed back is the date that was written.
    expect(spawned!.dueDate.toISOString()).toBe(next.dueDate?.toISOString());

    expect(next.dueDate?.toISOString().slice(0, 10)).toBe("2026-03-11");

    await prisma.task.deleteMany({ where: { projectId } });
  });
});
