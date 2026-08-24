"use server";

import { Prisma, TaskStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ForbiddenError, getProjectContext, getTaskContext, requireUser } from "@/lib/auth";
import { ORDER_STEP, PRIORITY_META } from "@/lib/constants";
import { logActivity, notify, notifyMany, taskLink, taskWatchers } from "@/lib/events";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { RESOLVED_BLOCKER_STATUSES } from "@/lib/task-dependencies";
import { restoreTasks, snapshotSchema, snapshotTasks } from "@/lib/task-snapshot";
import { orderBetween } from "@/lib/utils";
import {
  taskCreateSchema,
  taskDeleteSchema,
  taskMoveSchema,
  bulkTaskDeleteSchema,
  bulkTaskUpdateSchema,
  taskUpdateSchema,
  type TaskUpdateInput,
} from "@/lib/validations";
import { fail, NOT_FOUND, ok, parse, withErrorHandling, type ActionResult } from "@/server/action-result";

/**
 * Allocates the next per-project task number. Done inside a transaction with
 * an atomic increment so two concurrent creates can never collide on the
 * `(projectId, number)` unique index.
 */
async function nextTaskNumber(projectId: string) {
  const project = await prisma.project.update({
    where: { id: projectId },
    data: { taskCounter: { increment: 1 } },
    select: { taskCounter: true },
  });
  return project.taskCounter;
}

function revalidateProject(slug: string, projectId: string) {
  revalidatePath(`/w/${slug}/projects/${projectId}`, "layout");
  revalidatePath(`/w/${slug}`, "layout");
}

/** How long a deleted task stays recoverable. */
const UNDO_WINDOW_HOURS = 24;

/**
 * Stashes what is about to be deleted, and returns the id the client hands back
 * to undo it.
 *
 * Only the id crosses to the browser. Round-tripping the snapshot itself would
 * let a crafted payload restore a comment under somebody else's name — the
 * server wrote this row and the server is the only thing that reads it.
 *
 * Old rows are swept here rather than on a schedule: a delete is exactly the
 * moment there is a workspace in hand and a reason to touch the table, and a
 * project nobody deletes anything in does not accumulate.
 */
async function stashForUndo(
  taskIds: string[],
  ctx: { workspaceId: string; projectId: string; actorId: string; summary: string },
) {
  const snapshot = await snapshotTasks(taskIds);
  if (!snapshot.tasks.length) return null;

  /*
   * The snapshot's size is what the delete actually costs, and it is larger than
   * the selection whenever one of the chosen tasks has subtasks: Postgres takes
   * those with it. Reported back so the toast can say how many rows went rather
   * than how many were ticked — under-reporting a destructive action is the
   * wrong direction to be wrong in, and it made undo look like it invented a
   * task ("deleted 4", "restored 5").
   */

  const row = await prisma.deletedTask.create({
    data: {
      workspaceId: ctx.workspaceId,
      projectId: ctx.projectId,
      actorId: ctx.actorId,
      summary: ctx.summary,
      payload: snapshot as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  await prisma.deletedTask.deleteMany({
    where: {
      workspaceId: ctx.workspaceId,
      createdAt: { lt: new Date(Date.now() - UNDO_WINDOW_HOURS * 3600_000) },
    },
  });

  return { id: row.id, rows: snapshot.tasks.length };
}

export async function createTask(input: unknown): Promise<ActionResult<{ id: string }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(taskCreateSchema, input);

    const ctx = await getProjectContext(user.id, data.projectId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "task:create")) throw new ForbiddenError();

    // Resolve the destination column: the one passed in, or the board's first.
    const column = data.columnId
      ? await prisma.boardColumn.findFirst({
          where: { id: data.columnId, projectId: data.projectId },
        })
      : await prisma.boardColumn.findFirst({
          where: { projectId: data.projectId },
          orderBy: { order: "asc" },
        });

    const last = await prisma.task.findFirst({
      where: { projectId: data.projectId, columnId: column?.id ?? null, parentId: data.parentId ?? null },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const number = await nextTaskNumber(data.projectId);

    const task = await prisma.task.create({
      data: {
        projectId: data.projectId,
        columnId: column?.id ?? null,
        parentId: data.parentId ?? null,
        number,
        title: data.title,
        description: data.description || null,
        status: column?.status ?? TaskStatus.TODO,
        priority: data.priority,
        order: (last?.order ?? 0) + ORDER_STEP,
        assigneeId: data.assigneeId ?? null,
        startDate: data.startDate ?? null,
        dueDate: data.dueDate ?? null,
        estimate: data.estimate ?? null,
        createdById: user.id,
        ...(data.labelIds.length
          ? { labels: { create: data.labelIds.map((labelId) => ({ labelId })) } }
          : {}),
      },
    });

    await logActivity({
      workspaceId: ctx.workspace.id,
      projectId: data.projectId,
      taskId: task.id,
      actorId: user.id,
      type: data.parentId ? "SUBTASK_CREATED" : "TASK_CREATED",
      message: `${user.name} created ${data.parentId ? "subtask" : "task"} ${ctx.project.key}-${number}: ${task.title}`,
    });

    if (task.assigneeId) {
      await notify({
        userId: task.assigneeId,
        workspaceId: ctx.workspace.id,
        actorId: user.id,
        type: "TASK_ASSIGNED",
        title: "A new task was assigned to you",
        body: `${ctx.project.key}-${number}: ${task.title}`,
        link: taskLink(ctx.workspace.slug, data.projectId, task.id),
      });
    }

    revalidateProject(ctx.workspace.slug, data.projectId);
    return ok({ id: task.id });
  });
}

type TaskContext = NonNullable<Awaited<ReturnType<typeof getTaskContext>>>;
type Actor = Awaited<ReturnType<typeof requireUser>>;

/**
 * Everything one task update does, minus the auth and the revalidate.
 *
 * Pulled out so a bulk edit runs the *same* path rather than a second one beside
 * it. The write is the easy half; what would drift in a parallel implementation
 * is the rest — moving the card to a column whose status matches, stamping
 * `completedAt`, and the activity rows and notifications that make a change
 * visible to the people watching the task. A bulk edit that quietly skips those
 * is a bulk edit nobody hears about.
 *
 * The caller checks permission and revalidates: one selection is one revalidate,
 * not one per task.
 */
async function applyTaskUpdate(user: Actor, ctx: TaskContext, data: TaskUpdateInput) {
  const before = ctx.task;
  const statusChanged = data.status !== undefined && data.status !== before.status;
  const nowDone = data.status === TaskStatus.DONE;

  // Keep the card on a column whose status matches its new lifecycle state.
  let columnId = before.columnId;
  if (statusChanged) {
    const match = await prisma.boardColumn.findFirst({
      where: { projectId: before.projectId, status: data.status },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    if (match) columnId = match.id;
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: data.taskId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.status !== undefined ? { status: data.status, columnId } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId ?? null } : {}),
        ...(data.startDate !== undefined ? { startDate: data.startDate ?? null } : {}),
        ...(data.dueDate !== undefined ? { dueDate: data.dueDate ?? null } : {}),
        ...(data.estimate !== undefined ? { estimate: data.estimate ?? null } : {}),
        ...(statusChanged ? { completedAt: nowDone ? new Date() : null } : {}),
      },
    });

    if (data.labelIds) {
      await tx.taskLabel.deleteMany({ where: { taskId: data.taskId } });
      if (data.labelIds.length) {
        await tx.taskLabel.createMany({
          data: data.labelIds.map((labelId) => ({ taskId: data.taskId, labelId })),
        });
      }
    }
  });

  const ref = `${ctx.project.key}-${before.number}`;
  const link = taskLink(ctx.workspace.slug, before.projectId, before.id);

  // Activity + notification fan-out for the changes people care about.
  if (statusChanged) {
    await logActivity({
      workspaceId: ctx.workspace.id,
      projectId: before.projectId,
      taskId: before.id,
      actorId: user.id,
      type: nowDone ? "TASK_COMPLETED" : before.status === TaskStatus.DONE ? "TASK_REOPENED" : "TASK_UPDATED",
      message: `${user.name} changed the status of ${ref}`,
      metadata: { from: before.status, to: data.status },
    });
    if (nowDone) {
      await notifyMany(await taskWatchers(before.id), {
        workspaceId: ctx.workspace.id,
        actorId: user.id,
        type: "TASK_COMPLETED",
        title: `${ref} is done`,
        body: before.title,
        link,
      });
    }
  }

  if (data.assigneeId !== undefined && data.assigneeId !== before.assigneeId) {
    await logActivity({
      workspaceId: ctx.workspace.id,
      projectId: before.projectId,
      taskId: before.id,
      actorId: user.id,
      type: data.assigneeId ? "TASK_ASSIGNED" : "TASK_UNASSIGNED",
      message: data.assigneeId
        ? `${user.name} assigned ${ref} to someone`
        : `${user.name} unassigned ${ref}`,
    });
    if (data.assigneeId) {
      await notify({
        userId: data.assigneeId,
        workspaceId: ctx.workspace.id,
        actorId: user.id,
        type: "TASK_ASSIGNED",
        title: "A task was assigned to you",
        body: `${ref}: ${before.title}`,
        link,
      });
    }
  }

  if (data.priority !== undefined && data.priority !== before.priority) {
    await logActivity({
      workspaceId: ctx.workspace.id,
      projectId: before.projectId,
      taskId: before.id,
      actorId: user.id,
      type: "TASK_UPDATED",
      message: `${user.name} set the priority of ${ref} to ${PRIORITY_META[data.priority].label}`,
    });
  }

}

export async function updateTask(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(taskUpdateSchema, input);

    const ctx = await getTaskContext(user.id, data.taskId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "task:update")) throw new ForbiddenError();
    if (data.assigneeId !== undefined && !can(ctx.role, "task:assign")) throw new ForbiddenError();

    await applyTaskUpdate(user, ctx, data);

    revalidateProject(ctx.workspace.slug, ctx.task.projectId);
    return ok(undefined);
  });
}

/**
 * One edit, applied to a selection.
 *
 * Sequential rather than parallel, and one action rather than one call per task.
 * Server Actions are rate-limited per signed-in user in middleware, so a client
 * loop over twenty cards is twenty requests against that allowance and the tail
 * of the selection silently fails — which looks like "bulk edit only works
 * sometimes". Sequential because each task writes activity and notifications,
 * and twenty concurrent transactions on one project is a deadlock waiting for
 * somebody's slow database.
 *
 * A task that has vanished, or that belongs to a workspace this person is not in,
 * is skipped rather than failing the batch: the selection was assembled from a
 * page that may be seconds out of date, and losing nineteen good edits to one
 * stale id is the wrong answer. Permission is *not* skipped — that throws, since
 * a selection is all in reach or none of it is.
 *
 * Revalidation is per project touched, not per task, which matters because a
 * selection made in "My tasks" can span several.
 */
export async function bulkUpdateTasks(
  input: unknown,
): Promise<ActionResult<{ updated: number; skipped: number }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const { taskIds, ...patch } = parse(bulkTaskUpdateSchema, input);

    const touched = new Map<string, { slug: string; projectId: string }>();
    let updated = 0;

    for (const taskId of taskIds) {
      const ctx = await getTaskContext(user.id, taskId);
      if (!ctx) continue;
      if (!can(ctx.role, "task:update")) throw new ForbiddenError();
      if (patch.assigneeId !== undefined && !can(ctx.role, "task:assign")) {
        throw new ForbiddenError();
      }

      await applyTaskUpdate(user, ctx, { ...patch, taskId });
      updated += 1;
      touched.set(ctx.task.projectId, {
        slug: ctx.workspace.slug,
        projectId: ctx.task.projectId,
      });
    }

    for (const { slug, projectId } of touched.values()) revalidateProject(slug, projectId);
    return ok({ updated, skipped: taskIds.length - updated });
  });
}

/**
 * Drag & drop persistence. `toIndex` is the position the card was dropped at
 * inside the destination column, counted among the cards already there
 * (excluding the moved card itself).
 */
export async function moveTask(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(taskMoveSchema, input);

    const ctx = await getTaskContext(user.id, data.taskId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "task:move")) throw new ForbiddenError();

    const column = await prisma.boardColumn.findFirst({
      where: { id: data.toColumnId, projectId: ctx.task.projectId },
    });
    if (!column) return fail("That column does not belong to this project.");

    const siblings = await prisma.task.findMany({
      where: {
        projectId: ctx.task.projectId,
        columnId: data.toColumnId,
        parentId: null,
        id: { not: data.taskId },
      },
      orderBy: { order: "asc" },
      select: { id: true, order: true },
    });

    const index = Math.min(Math.max(data.toIndex, 0), siblings.length);
    const before = index > 0 ? siblings[index - 1].order : null;
    const after = index < siblings.length ? siblings[index].order : null;
    const order = orderBetween(before, after);

    const statusChanged = column.status !== ctx.task.status;
    const nowDone = column.status === TaskStatus.DONE;

    await prisma.task.update({
      where: { id: data.taskId },
      data: {
        columnId: column.id,
        order,
        status: column.status,
        ...(statusChanged ? { completedAt: nowDone ? new Date() : null } : {}),
      },
    });

    if (statusChanged) {
      const ref = `${ctx.project.key}-${ctx.task.number}`;
      await logActivity({
        workspaceId: ctx.workspace.id,
        projectId: ctx.task.projectId,
        taskId: ctx.task.id,
        actorId: user.id,
        type: nowDone ? "TASK_COMPLETED" : "TASK_MOVED",
        message: `${user.name} moved ${ref} to ${column.name}`,
        metadata: { column: column.name, from: ctx.task.status, to: column.status },
      });
      if (nowDone) {
        await notifyMany(await taskWatchers(ctx.task.id), {
          workspaceId: ctx.workspace.id,
          actorId: user.id,
          type: "TASK_COMPLETED",
          title: `${ref} is done`,
          body: ctx.task.title,
          link: taskLink(ctx.workspace.slug, ctx.task.projectId, ctx.task.id),
        });
      }
    }

    revalidateProject(ctx.workspace.slug, ctx.task.projectId);
    return ok(undefined);
  });
}

/** One-click complete/reopen used by the list and my-tasks views. */
/**
 * The checkbox on a card and on a list row.
 *
 * Reports `stillWaiting` alongside `done`: completing something that is still
 * waiting on unfinished work is allowed and worth saying out loud. Refusing it
 * was the other option and is worse on a shared board — the way people get past
 * a refusal is to delete the dependency, which destroys the record of why the
 * order mattered. Telling them costs nothing and leaves the link in place.
 */
export async function toggleTaskDone(
  taskId: string,
): Promise<ActionResult<{ done: boolean; stillWaiting: number }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const ctx = await getTaskContext(user.id, taskId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "task:update")) throw new ForbiddenError();

    const done = ctx.task.status !== TaskStatus.DONE;
    const nextStatus = done ? TaskStatus.DONE : TaskStatus.TODO;

    const column = await prisma.boardColumn.findFirst({
      where: { projectId: ctx.task.projectId, status: nextStatus },
      orderBy: { order: "asc" },
      select: { id: true },
    });

    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: nextStatus,
        completedAt: done ? new Date() : null,
        ...(column ? { columnId: column.id } : {}),
      },
    });

    await logActivity({
      workspaceId: ctx.workspace.id,
      projectId: ctx.task.projectId,
      taskId,
      actorId: user.id,
      type: done ? "TASK_COMPLETED" : "TASK_REOPENED",
      message: `${user.name} ${done ? "completed" : "reopened"} ${ctx.project.key}-${ctx.task.number}`,
    });

    // Counted after the write, and only when finishing: reopening a task says
    // nothing about what it waits on.
    const stillWaiting = done
      ? await prisma.taskDependency.count({
          where: {
            blockedTaskId: taskId,
            blockingTask: { status: { notIn: RESOLVED_BLOCKER_STATUSES } },
          },
        })
      : 0;

    revalidateProject(ctx.workspace.slug, ctx.task.projectId);
    return ok({ done, stillWaiting });
  });
}

export async function deleteTask(input: unknown): Promise<ActionResult<{ undoId: string | null }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(taskDeleteSchema, input);

    const ctx = await getTaskContext(user.id, data.taskId);
    if (!ctx) return fail(NOT_FOUND);
    // Members may delete their own tasks; removing someone else's needs admin.
    const isAuthor = ctx.task.createdById === user.id;
    if (!can(ctx.role, "task:delete") || (!isAuthor && !can(ctx.role, "comment:delete_any"))) {
      throw new ForbiddenError();
    }

    // Captured before the row goes, or there is nothing left to read.
    const stash = await stashForUndo([data.taskId], {
      workspaceId: ctx.workspace.id,
      projectId: ctx.task.projectId,
      actorId: user.id,
      summary: `${ctx.project.key}-${ctx.task.number}`,
    });

    await prisma.task.delete({ where: { id: data.taskId } });

    await logActivity({
      workspaceId: ctx.workspace.id,
      projectId: ctx.task.projectId,
      actorId: user.id,
      type: "TASK_DELETED",
      message: `${user.name} deleted ${ctx.project.key}-${ctx.task.number}: ${ctx.task.title}`,
    });

    revalidateProject(ctx.workspace.slug, ctx.task.projectId);
    return ok({ undoId: stash?.id ?? null });
  });
}

/**
 * Puts back what a delete stashed.
 *
 * Offered only to whoever deleted it. A restore is the other half of one
 * person's action, not a general recovery tool — anybody who should be able to
 * resurrect somebody else's deletion is asking for a different feature, with a
 * different surface, that says whose work it is bringing back.
 *
 * Permission is re-checked against the project now rather than trusted from when
 * the row was written: the window is a day long, and a role can change inside it.
 */
export async function restoreDeletedTasks(
  input: unknown,
): Promise<ActionResult<{ restored: number; skipped: number }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const id = parse(z.string().min(1), input);

    const row = await prisma.deletedTask.findUnique({ where: { id } });
    if (!row || row.actorId !== user.id) return fail(NOT_FOUND);

    const snapshot = parse(snapshotSchema, row.payload);

    /*
     * Permission per project in the payload, not per stash.
     *
     * `row.projectId` records where the delete was started, and a selection made
     * in "My tasks" spans the whole workspace — checking only that one project
     * and restoring only into it is what lost two tasks out of six. Each project
     * present is checked on its own, and one the caller can no longer write to is
     * skipped rather than failing the rest: the same rule the delete uses, and
     * for the same reason.
     */
    const wanted = new Set(snapshot.tasks.map((task) => task.projectId));
    const allowed = new Set<string>();
    const places: { slug: string; projectId: string }[] = [];

    for (const projectId of wanted) {
      const ctx = await getProjectContext(user.id, projectId);
      if (!ctx || !can(ctx.role, "task:create")) continue;
      allowed.add(projectId);
      places.push({ slug: ctx.workspace.slug, projectId });
    }
    if (!allowed.size) return fail(NOT_FOUND);

    const counts = await restoreTasks(snapshot, allowed);

    // The row goes whether or not everything landed. Leaving it would offer the
    // same undo again, and the second press would find the tasks already back
    // and report restoring nothing.
    await prisma.deletedTask.delete({ where: { id } }).catch(() => {});

    await logActivity({
      workspaceId: row.workspaceId,
      projectId: row.projectId,
      actorId: user.id,
      type: "TASK_UPDATED",
      message: `${user.name} restored ${counts.restored} task(s)`,
    });

    for (const place of places) revalidateProject(place.slug, place.projectId);
    return ok(counts);
  });
}

/** Copies a task (fields, labels and checklist) into the same column. */
/**
 * Removes a selection.
 *
 * The permission rule is the per-task one, applied per task: a member may delete
 * what they wrote, and somebody else's needs admin. So a mixed selection is
 * *partly* deletable, and this deletes that part rather than refusing the lot —
 * refusing would make the feature unusable on any shared board, and deleting
 * everything would be a quiet privilege escalation.
 *
 * The count comes back so the caller can say "6 of 9 deleted" instead of
 * reporting success and leaving three cards on screen with no explanation.
 */
export async function bulkDeleteTasks(
  input: unknown,
): Promise<ActionResult<{ deleted: number; skipped: number; undoId: string | null }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const { taskIds } = parse(bulkTaskDeleteSchema, input);

    const touched = new Map<string, { slug: string; projectId: string }>();
    let deleted = 0;

    /*
     * Two passes, because the snapshot has to be taken while the rows still
     * exist and the permission answer decides which rows go into it. Collecting
     * the allowed ones first means one stash for the whole selection — one row,
     * one undo, one press to bring it all back.
     */
    const allowed: { taskId: string; ctx: TaskContext }[] = [];
    for (const taskId of taskIds) {
      const ctx = await getTaskContext(user.id, taskId);
      if (!ctx) continue;

      const isAuthor = ctx.task.createdById === user.id;
      if (!can(ctx.role, "task:delete") || (!isAuthor && !can(ctx.role, "comment:delete_any"))) {
        continue;
      }
      allowed.push({ taskId, ctx });
    }

    /*
     * The stash is filed under the first task's project, and that is a *label*,
     * not a claim about the rest: "My tasks" spans the workspace, so a selection
     * made there routinely covers several. The payload carries each task's own
     * project and the restore reads them from there — an earlier version trusted
     * this single id and silently dropped everything else.
     */
    const home = allowed[0]?.ctx;
    const stash = home
      ? await stashForUndo(
          allowed.map((entry) => entry.taskId),
          {
            workspaceId: home.workspace.id,
            projectId: home.task.projectId,
            actorId: user.id,
            summary: `${allowed.length} tasks`,
          },
        )
      : null;

    for (const { taskId, ctx } of allowed) {
      /*
       * `deleteMany` rather than `delete`, and the count is read rather than
       * assumed.
       *
       * Selecting a task and one of its own subtasks is ordinary — they sit next
       * to each other on the board. Deleting the parent cascades the child away,
       * so by the time this loop reaches the child there is nothing there, and
       * `delete` would throw on a row that is already gone exactly as it would
       * on a real fault. `deleteMany` answers with zero for the first case and
       * still raises the second, which is the difference worth keeping.
       */
      const { count } = await prisma.task.deleteMany({ where: { id: taskId } });
      if (!count) continue;

      await logActivity({
        workspaceId: ctx.workspace.id,
        projectId: ctx.task.projectId,
        actorId: user.id,
        type: "TASK_DELETED",
        message: `${user.name} deleted ${ctx.project.key}-${ctx.task.number}: ${ctx.task.title}`,
      });

      deleted += 1;
      touched.set(ctx.task.projectId, {
        slug: ctx.workspace.slug,
        projectId: ctx.task.projectId,
      });
    }

    for (const { slug, projectId } of touched.values()) revalidateProject(slug, projectId);
    return ok({
      /*
       * Tasks you chose, not rows the database touched.
       *
       * This briefly reported the whole snapshot — five when four were ticked —
       * on the reasoning that a destructive action should not under-report
       * itself. The owner's answer was that a subtask is *part of* its parent
       * rather than a task standing beside it, so removing a parent is removing
       * one thing however many rows go with it. The list is being changed to
       * show them that way too, and the count has to agree with what is on
       * screen or it is telling a different story from the interface.
       */
      deleted,
      skipped: taskIds.length - deleted,
      undoId: stash?.id ?? null,
    });
  });
}

export async function duplicateTask(taskId: string): Promise<ActionResult<{ id: string }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const ctx = await getTaskContext(user.id, taskId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "task:create")) throw new ForbiddenError();

    const source = await prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      include: { labels: true, checklistItems: { orderBy: { order: "asc" } } },
    });

    const number = await nextTaskNumber(source.projectId);

    const copy = await prisma.task.create({
      data: {
        projectId: source.projectId,
        columnId: source.columnId,
        parentId: source.parentId,
        number,
        title: `${source.title} (copy)`,
        description: source.description,
        status: source.status,
        priority: source.priority,
        order: source.order + ORDER_STEP / 2,
        startDate: source.startDate,
        dueDate: source.dueDate,
        estimate: source.estimate,
        assigneeId: source.assigneeId,
        createdById: user.id,
        labels: { create: source.labels.map((l) => ({ labelId: l.labelId })) },
        checklistItems: {
          create: source.checklistItems.map((c) => ({
            title: c.title,
            done: false,
            order: c.order,
          })),
        },
      },
    });

    revalidateProject(ctx.workspace.slug, source.projectId);
    return ok({ id: copy.id });
  });
}
