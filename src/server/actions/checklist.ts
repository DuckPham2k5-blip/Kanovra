"use server";

import { revalidatePath } from "next/cache";

import { ForbiddenError, getTaskContext, requireUser } from "@/lib/auth";
import { ORDER_STEP } from "@/lib/constants";
import { logActivity } from "@/lib/events";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  checklistCreateSchema,
  checklistDeleteSchema,
  checklistToggleSchema,
} from "@/lib/validations";
import { fail, NOT_FOUND, ok, parse, withErrorHandling, type ActionResult } from "@/server/action-result";

export async function addChecklistItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(checklistCreateSchema, input);

    const ctx = await getTaskContext(user.id, data.taskId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "checklist:manage")) throw new ForbiddenError();

    const last = await prisma.checklistItem.findFirst({
      where: { taskId: data.taskId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const item = await prisma.checklistItem.create({
      data: {
        taskId: data.taskId,
        title: data.title,
        order: (last?.order ?? 0) + ORDER_STEP,
      },
    });

    revalidatePath(`/w/${ctx.workspace.slug}/projects/${ctx.task.projectId}`, "layout");
    return ok({ id: item.id });
  });
}

export async function toggleChecklistItem(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(checklistToggleSchema, input);

    const item = await prisma.checklistItem.findUnique({
      where: { id: data.itemId },
      select: { taskId: true, title: true },
    });
    if (!item) return fail(NOT_FOUND);

    const ctx = await getTaskContext(user.id, item.taskId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "checklist:manage")) throw new ForbiddenError();

    await prisma.checklistItem.update({
      where: { id: data.itemId },
      data: { done: data.done },
    });

    await logActivity({
      workspaceId: ctx.workspace.id,
      projectId: ctx.task.projectId,
      taskId: item.taskId,
      actorId: user.id,
      type: "CHECKLIST_UPDATED",
      message: `${user.name} ${data.done ? "checked off" : "unchecked"} "${item.title}"`,
    });

    revalidatePath(`/w/${ctx.workspace.slug}/projects/${ctx.task.projectId}`, "layout");
    return ok(undefined);
  });
}

export async function deleteChecklistItem(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(checklistDeleteSchema, input);

    const item = await prisma.checklistItem.findUnique({
      where: { id: data.itemId },
      select: { taskId: true },
    });
    if (!item) return fail(NOT_FOUND);

    const ctx = await getTaskContext(user.id, item.taskId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "checklist:manage")) throw new ForbiddenError();

    await prisma.checklistItem.delete({ where: { id: data.itemId } });

    revalidatePath(`/w/${ctx.workspace.slug}/projects/${ctx.task.projectId}`, "layout");
    return ok(undefined);
  });
}
