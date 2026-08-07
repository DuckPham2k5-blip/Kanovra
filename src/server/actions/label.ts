"use server";

import { revalidatePath } from "next/cache";

import { ForbiddenError, getMembership, requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { labelCreateSchema, labelDeleteSchema } from "@/lib/validations";
import { fail, NOT_FOUND, ok, parse, withErrorHandling, type ActionResult } from "@/server/action-result";

export async function createLabel(input: unknown): Promise<ActionResult<{ id: string }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(labelCreateSchema, input);

    const membership = await getMembership(user.id, data.workspaceId);
    if (!can(membership?.role, "workspace:manage_labels")) throw new ForbiddenError();

    const label = await prisma.label.create({
      data: { workspaceId: data.workspaceId, name: data.name, color: data.color },
    });

    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: data.workspaceId },
      select: { slug: true },
    });
    revalidatePath(`/w/${workspace.slug}`, "layout");
    return ok({ id: label.id });
  });
}

export async function deleteLabel(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(labelDeleteSchema, input);

    const label = await prisma.label.findUnique({
      where: { id: data.labelId },
      include: { workspace: { select: { id: true, slug: true } } },
    });
    if (!label) return fail(NOT_FOUND);

    const membership = await getMembership(user.id, label.workspace.id);
    if (!can(membership?.role, "workspace:manage_labels")) throw new ForbiddenError();

    await prisma.label.delete({ where: { id: data.labelId } });

    revalidatePath(`/w/${label.workspace.slug}`, "layout");
    return ok(undefined);
  });
}

/** Adds/removes one label on one task — used by the label picker chips. */
export async function toggleTaskLabel(
  taskId: string,
  labelId: string,
): Promise<ActionResult<{ attached: boolean }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true, project: { select: { workspaceId: true, workspace: { select: { slug: true } } } } },
    });
    if (!task) return fail(NOT_FOUND);

    const membership = await getMembership(user.id, task.project.workspaceId);
    if (!can(membership?.role, "task:update")) throw new ForbiddenError();

    const existing = await prisma.taskLabel.findUnique({
      where: { taskId_labelId: { taskId, labelId } },
    });

    if (existing) {
      await prisma.taskLabel.delete({ where: { taskId_labelId: { taskId, labelId } } });
    } else {
      await prisma.taskLabel.create({ data: { taskId, labelId } });
    }

    revalidatePath(`/w/${task.project.workspace.slug}/projects/${task.projectId}`, "layout");
    return ok({ attached: !existing });
  });
}
