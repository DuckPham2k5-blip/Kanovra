import "server-only";

import { Priority, TaskStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { nextDueDate, parseRecurrence } from "@/lib/recurrence";

/**
 * Hands a finished recurring task on to its next occurrence.
 *
 * Called from both completion paths — the checkbox and a status change — because
 * they are separate code and always have been; a rule that fired from only one
 * of them would repeat or not depending on which control somebody used, which is
 * the kind of difference nobody would think to report.
 *
 * The rule **moves**: the new row carries it and the finished row is cleared. A
 * reopened task ticked a second time therefore spawns nothing, and the completed
 * row reads as a finished piece of work rather than a template.
 *
 * What the next occurrence inherits is what describes the *work*: title, notes,
 * priority, assignee, labels, estimate, and the checklist with every box
 * unticked. What it does not inherit is anything belonging to the occurrence that
 * just ended — its comments, its attachments and its dependencies, all of which
 * are a record of one time it was done.
 *
 * Answers with the new task's id, or null when there was no rule.
 */
export async function spawnNextOccurrence(
  task: {
    id: string;
    projectId: string;
    recurrence: string | null;
    dueDate: Date | null;
    startDate: Date | null;
    title: string;
    description: string | null;
    priority: Priority;
    estimate: number | null;
    assigneeId: string | null;
    createdById: string;
    parentId: string | null;
    order: number;
  },
  completedAt: Date,
): Promise<string | null> {
  const rule = parseRecurrence(task.recurrence);
  if (!rule) return null;

  const dueDate = nextDueDate(rule, task.dueDate, completedAt);

  /*
   * The start date travels the same distance the due date did, so a task that
   * opens three days before it is due keeps that shape. Computed from the gap
   * rather than advanced by the rule on its own: two independent advances drift
   * apart the first time a month is clamped.
   */
  const startDate =
    task.startDate && task.dueDate
      ? new Date(dueDate.getTime() - (task.dueDate.getTime() - task.startDate.getTime()))
      : null;

  const [labels, checklist, column] = await Promise.all([
    prisma.taskLabel.findMany({ where: { taskId: task.id }, select: { labelId: true } }),
    prisma.checklistItem.findMany({
      where: { taskId: task.id },
      orderBy: { order: "asc" },
      select: { title: true, order: true },
    }),
    prisma.boardColumn.findFirst({
      where: { projectId: task.projectId, status: TaskStatus.TODO },
      orderBy: { order: "asc" },
      select: { id: true },
    }),
  ]);

  const number = await nextTaskNumber(task.projectId);

  const created = await prisma.$transaction(async (tx) => {
    const next = await tx.task.create({
      data: {
        projectId: task.projectId,
        columnId: column?.id ?? null,
        parentId: task.parentId,
        number,
        title: task.title,
        description: task.description,
        status: TaskStatus.TODO,
        priority: task.priority,
        order: task.order,
        startDate,
        dueDate,
        estimate: task.estimate,
        assigneeId: task.assigneeId,
        createdById: task.createdById,
        recurrence: task.recurrence,
      },
      select: { id: true },
    });

    if (labels.length) {
      await tx.taskLabel.createMany({
        data: labels.map((link) => ({ taskId: next.id, labelId: link.labelId })),
        skipDuplicates: true,
      });
    }

    if (checklist.length) {
      await tx.checklistItem.createMany({
        data: checklist.map((item) => ({ taskId: next.id, title: item.title, order: item.order })),
      });
    }

    // The handover, in the same transaction as the creation. Apart, a failure
    // between them leaves either two live rules or none.
    await tx.task.update({ where: { id: task.id }, data: { recurrence: null } });

    return next.id;
  });

  return created;
}


/**
 * The next number in a project, allocated atomically.
 *
 * A copy of the allocator in `actions/task.ts` rather than an import, because
 * that file is `"use server"` and may export nothing but server actions — an
 * exported number-allocator there would be callable from any browser.
 */
async function nextTaskNumber(projectId: string) {
  const project = await prisma.project.update({
    where: { id: projectId },
    data: { taskCounter: { increment: 1 } },
    select: { taskCounter: true },
  });
  return project.taskCounter;
}
