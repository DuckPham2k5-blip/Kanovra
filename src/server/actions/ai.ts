"use server";

import { TaskStatus } from "@prisma/client";
import { z } from "zod";

import {
  AiNotConfiguredError,
  draftDescription,
  isAiConfigured,
  summariseProject,
  suggestSubtasks,
  type SubtaskSuggestion,
} from "@/lib/ai";
import { ForbiddenError, getProjectContext, getTaskContext, requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fail, NOT_FOUND, ok, parse, withErrorHandling, type ActionResult } from "@/server/action-result";

/**
 * AI assistant actions.
 *
 * These are read-only: the model never writes to the database. Each returns a
 * suggestion the user reviews and applies themselves, so a bad suggestion is
 * always discardable and nothing happens without an explicit click.
 */

const AI_UNAVAILABLE = "The AI assistant is not set up on this server.";

/** Maps the "no key configured" case onto the normal result shape. */
async function withAi<T>(fn: () => Promise<ActionResult<T>>) {
  return withErrorHandling(async () => {
    if (!isAiConfigured()) return fail(AI_UNAVAILABLE);
    try {
      return await fn();
    } catch (error) {
      if (error instanceof AiNotConfiguredError) return fail(AI_UNAVAILABLE);
      throw error;
    }
  });
}

const taskIdSchema = z.object({ taskId: z.string().cuid() });

export async function aiSuggestSubtasks(
  input: unknown,
): Promise<ActionResult<SubtaskSuggestion[]>> {
  return withAi(async () => {
    const user = await requireUser();
    const { taskId } = parse(taskIdSchema, input);

    const ctx = await getTaskContext(user.id, taskId);
    if (!ctx) return fail(NOT_FOUND);
    // Suggestions exist to be turned into subtasks, so gate on the same
    // permission as creating one.
    if (!can(ctx.role, "task:create")) throw new ForbiddenError();

    const suggestions = await suggestSubtasks({
      title: ctx.task.title,
      description: ctx.task.description,
      projectName: ctx.project.name,
    });
    return ok(suggestions);
  });
}

const draftSchema = z.object({
  projectId: z.string().cuid(),
  title: z.string().min(1).max(200),
  existing: z.string().max(10_000).optional(),
});

export async function aiDraftDescription(input: unknown): Promise<ActionResult<string>> {
  return withAi(async () => {
    const user = await requireUser();
    const data = parse(draftSchema, input);

    const ctx = await getProjectContext(user.id, data.projectId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "task:create")) throw new ForbiddenError();

    const text = await draftDescription({
      title: data.title,
      projectName: ctx.project.name,
      existing: data.existing,
    });
    return ok(text);
  });
}

const projectIdSchema = z.object({ projectId: z.string().cuid() });

export async function aiSummariseProject(input: unknown): Promise<ActionResult<string>> {
  return withAi(async () => {
    const user = await requireUser();
    const { projectId } = parse(projectIdSchema, input);

    const ctx = await getProjectContext(user.id, projectId);
    if (!ctx) return fail(NOT_FOUND);

    const now = new Date();
    const [columns, overdueTasks, completed, unassignedCount] = await Promise.all([
      prisma.boardColumn.findMany({
        where: { projectId },
        orderBy: { order: "asc" },
        select: { name: true, _count: { select: { tasks: true } } },
      }),
      prisma.task.findMany({
        where: {
          projectId,
          dueDate: { lt: now },
          status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
        },
        orderBy: { dueDate: "asc" },
        take: 10,
        select: { title: true, dueDate: true },
      }),
      prisma.task.findMany({
        where: { projectId, status: TaskStatus.DONE },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: { title: true },
      }),
      prisma.task.count({
        where: {
          projectId,
          assigneeId: null,
          status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
        },
      }),
    ]);

    const summary = await summariseProject({
      projectName: ctx.project.name,
      columns: columns.map((c) => ({ name: c.name, taskCount: c._count.tasks })),
      overdue: overdueTasks.map((t) => ({
        title: t.title,
        daysLate: Math.floor((now.getTime() - t.dueDate!.getTime()) / 86_400_000),
      })),
      recentlyCompleted: completed.map((t) => t.title),
      unassignedCount,
    });
    return ok(summary);
  });
}
