"use server";

import { revalidatePath } from "next/cache";

import { ForbiddenError, getProjectContext, requireUser } from "@/lib/auth";
import { ORDER_STEP } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { columnCreateSchema, columnReorderSchema, columnUpdateSchema } from "@/lib/validations";
import { fail, NOT_FOUND, ok, parse, withErrorHandling, type ActionResult } from "@/server/action-result";

export async function createColumn(input: unknown): Promise<ActionResult<{ id: string }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(columnCreateSchema, input);

    const ctx = await getProjectContext(user.id, data.projectId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "board:manage_columns")) throw new ForbiddenError();

    const last = await prisma.boardColumn.findFirst({
      where: { projectId: data.projectId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const column = await prisma.boardColumn.create({
      data: {
        projectId: data.projectId,
        name: data.name,
        color: data.color,
        status: data.status,
        wipLimit: data.wipLimit,
        order: (last?.order ?? 0) + ORDER_STEP,
      },
    });

    revalidatePath(`/w/${ctx.workspace.slug}/projects/${data.projectId}`, "layout");
    return ok({ id: column.id });
  });
}

export async function updateColumn(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(columnUpdateSchema, input);

    const column = await prisma.boardColumn.findUnique({
      where: { id: data.columnId },
      select: { projectId: true },
    });
    if (!column) return fail(NOT_FOUND);

    const ctx = await getProjectContext(user.id, column.projectId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "board:manage_columns")) throw new ForbiddenError();

    await prisma.boardColumn.update({
      where: { id: data.columnId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.wipLimit !== undefined ? { wipLimit: data.wipLimit } : {}),
      },
    });

    revalidatePath(`/w/${ctx.workspace.slug}/projects/${column.projectId}`, "layout");
    return ok(undefined);
  });
}

/**
 * Deletes a column. Its cards are moved to the left-most remaining column so
 * nothing is silently lost; deleting the last column is refused.
 */
export async function deleteColumn(columnId: string): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const column = await prisma.boardColumn.findUnique({
      where: { id: columnId },
      include: { _count: { select: { tasks: true } } },
    });
    if (!column) return fail(NOT_FOUND);

    const ctx = await getProjectContext(user.id, column.projectId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "board:manage_columns")) throw new ForbiddenError();

    const siblings = await prisma.boardColumn.findMany({
      where: { projectId: column.projectId, id: { not: columnId } },
      orderBy: { order: "asc" },
    });
    if (siblings.length === 0) return fail("A board must keep at least one column.");

    const fallback = siblings[0];

    await prisma.$transaction([
      prisma.task.updateMany({
        where: { columnId },
        data: { columnId: fallback.id, status: fallback.status },
      }),
      prisma.boardColumn.delete({ where: { id: columnId } }),
    ]);

    revalidatePath(`/w/${ctx.workspace.slug}/projects/${column.projectId}`, "layout");
    return ok(undefined);
  });
}

/** Persists a new left-to-right column order after a drag. */
export async function reorderColumns(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(columnReorderSchema, input);

    const ctx = await getProjectContext(user.id, data.projectId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "board:manage_columns")) throw new ForbiddenError();

    // Guard against ids from another project sneaking in.
    const owned = await prisma.boardColumn.findMany({
      where: { projectId: data.projectId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((c) => c.id));
    if (data.orderedIds.some((id) => !ownedIds.has(id))) return fail("That column list is not valid.");

    await prisma.$transaction(
      data.orderedIds.map((id, index) =>
        prisma.boardColumn.update({ where: { id }, data: { order: (index + 1) * ORDER_STEP } }),
      ),
    );

    revalidatePath(`/w/${ctx.workspace.slug}/projects/${data.projectId}`, "layout");
    return ok(undefined);
  });
}
