"use server";

import { TaskStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { ForbiddenError, getProjectContext, getTaskContext, requireUser } from "@/lib/auth";
import { ORDER_STEP, PRIORITY_META } from "@/lib/constants";
import { logActivity, notify, notifyMany, taskLink, taskWatchers } from "@/lib/events";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { orderBetween } from "@/lib/utils";
import {
  taskCreateSchema,
  taskDeleteSchema,
  taskMoveSchema,
  taskUpdateSchema,
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

export async function updateTask(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(taskUpdateSchema, input);

    const ctx = await getTaskContext(user.id, data.taskId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "task:update")) throw new ForbiddenError();
    if (data.assigneeId !== undefined && !can(ctx.role, "task:assign")) throw new ForbiddenError();

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

    revalidateProject(ctx.workspace.slug, before.projectId);
    return ok(undefined);
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
export async function toggleTaskDone(taskId: string): Promise<ActionResult<{ done: boolean }>> {
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

    revalidateProject(ctx.workspace.slug, ctx.task.projectId);
    return ok({ done });
  });
}

export async function deleteTask(input: unknown): Promise<ActionResult> {
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

    await prisma.task.delete({ where: { id: data.taskId } });

    await logActivity({
      workspaceId: ctx.workspace.id,
      projectId: ctx.task.projectId,
      actorId: user.id,
      type: "TASK_DELETED",
      message: `${user.name} deleted ${ctx.project.key}-${ctx.task.number}: ${ctx.task.title}`,
    });

    revalidateProject(ctx.workspace.slug, ctx.task.projectId);
    return ok(undefined);
  });
}

/** Copies a task (fields, labels and checklist) into the same column. */
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
