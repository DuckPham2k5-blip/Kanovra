"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { ForbiddenError, getMembership, getProjectContext, requireUser } from "@/lib/auth";
import { logActivity, notifyMany } from "@/lib/events";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { DEFAULT_COLUMNS, ORDER_STEP } from "@/lib/constants";
import { projectKeyFromName } from "@/lib/utils";
import { projectCreateSchema, projectUpdateSchema } from "@/lib/validations";
import { fail, NOT_FOUND, ok, parse, withErrorHandling, type ActionResult } from "@/server/action-result";

/** Ensures the project key is unique inside the workspace (`WEB`, `WEB2`, …). */
async function uniqueKey(workspaceId: string, base: string) {
  let candidate = base.slice(0, 6).toUpperCase();
  let n = 1;
  while (
    await prisma.project.findUnique({
      where: { workspaceId_key: { workspaceId, key: candidate } },
      select: { id: true },
    })
  ) {
    n += 1;
    candidate = `${base.slice(0, 5).toUpperCase()}${n}`;
  }
  return candidate;
}

export async function createProject(input: unknown): Promise<ActionResult<{ id: string }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(projectCreateSchema, input);

    const membership = await getMembership(user.id, data.workspaceId);
    if (!can(membership?.role, "project:create")) throw new ForbiddenError();

    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: data.workspaceId },
      select: { slug: true, id: true, name: true, members: { select: { userId: true } } },
    });

    const key = await uniqueKey(data.workspaceId, data.key || projectKeyFromName(data.name));

    const project = await prisma.project.create({
      data: {
        workspaceId: data.workspaceId,
        name: data.name,
        key,
        description: data.description || null,
        color: data.color,
        icon: data.icon,
        status: data.status,
        startDate: data.startDate ?? null,
        dueDate: data.dueDate ?? null,
        createdById: user.id,
        members: { create: { userId: user.id, role: Role.OWNER } },
        columns: {
          create: DEFAULT_COLUMNS.map((c, i) => ({ ...c, order: (i + 1) * ORDER_STEP })),
        },
      },
    });

    await Promise.all([
      logActivity({
        workspaceId: workspace.id,
        projectId: project.id,
        actorId: user.id,
        type: "PROJECT_CREATED",
        message: `${user.name} đã tạo dự án ${project.name}`,
      }),
      notifyMany(
        workspace.members.map((m) => m.userId),
        {
          workspaceId: workspace.id,
          actorId: user.id,
          type: "PROJECT_UPDATED",
          title: `Dự án mới: ${project.name}`,
          body: `${user.name} vừa tạo một dự án trong ${workspace.name}`,
          link: `/w/${workspace.slug}/projects/${project.id}/board`,
        },
      ),
    ]);

    revalidatePath(`/w/${workspace.slug}`, "layout");
    return ok({ id: project.id });
  });
}

export async function updateProject(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(projectUpdateSchema, input);

    const ctx = await getProjectContext(user.id, data.projectId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "project:update")) throw new ForbiddenError();

    const project = await prisma.project.update({
      where: { id: data.projectId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
        ...(data.icon !== undefined ? { icon: data.icon } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.startDate !== undefined ? { startDate: data.startDate ?? null } : {}),
        ...(data.dueDate !== undefined ? { dueDate: data.dueDate ?? null } : {}),
      },
    });

    await logActivity({
      workspaceId: ctx.workspace.id,
      projectId: project.id,
      actorId: user.id,
      type: "PROJECT_UPDATED",
      message: `${user.name} đã cập nhật dự án ${project.name}`,
    });

    revalidatePath(`/w/${ctx.workspace.slug}`, "layout");
    return ok(undefined);
  });
}

export async function setProjectArchived(
  projectId: string,
  archived: boolean,
): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const ctx = await getProjectContext(user.id, projectId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "project:archive")) throw new ForbiddenError();

    await prisma.project.update({
      where: { id: projectId },
      data: { archived, ...(archived ? { status: "ARCHIVED" as const } : {}) },
    });

    await logActivity({
      workspaceId: ctx.workspace.id,
      projectId,
      actorId: user.id,
      type: "PROJECT_UPDATED",
      message: `${user.name} đã ${archived ? "lưu trữ" : "khôi phục"} dự án ${ctx.project.name}`,
    });

    revalidatePath(`/w/${ctx.workspace.slug}`, "layout");
    return ok(undefined);
  });
}

export async function deleteProject(projectId: string): Promise<ActionResult<{ slug: string }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const ctx = await getProjectContext(user.id, projectId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "project:delete")) throw new ForbiddenError();

    await prisma.project.delete({ where: { id: projectId } });

    revalidatePath(`/w/${ctx.workspace.slug}`, "layout");
    return ok({ slug: ctx.workspace.slug });
  });
}

/** Adds or removes a project member (project membership narrows the workspace one). */
export async function toggleProjectMember(
  projectId: string,
  userId: string,
): Promise<ActionResult<{ added: boolean }>> {
  // Explicit type argument — inference would narrow `added` to a literal.
  return withErrorHandling<{ added: boolean }>(async () => {
    const user = await requireUser();
    const ctx = await getProjectContext(user.id, projectId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "project:update")) throw new ForbiddenError();

    const target = await getMembership(userId, ctx.workspace.id);
    if (!target) return fail("Người này chưa thuộc không gian làm việc.");

    const existing = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });

    if (existing) {
      await prisma.projectMember.delete({ where: { id: existing.id } });
      revalidatePath(`/w/${ctx.workspace.slug}/projects/${projectId}`, "layout");
      return ok({ added: false });
    }

    await prisma.projectMember.create({
      data: { projectId, userId, role: target.role },
    });
    revalidatePath(`/w/${ctx.workspace.slug}/projects/${projectId}`, "layout");
    return ok({ added: true });
  });
}
