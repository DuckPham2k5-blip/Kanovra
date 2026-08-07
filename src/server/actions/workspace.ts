"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { ForbiddenError, getMembership, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/events";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { workspaceCreateSchema, workspaceUpdateSchema } from "@/lib/validations";
import { fail, ok, parse, withErrorHandling, type ActionResult } from "@/server/action-result";

/** Finds a free slug by appending `-2`, `-3`, … when the base is taken. */
async function uniqueSlug(base: string) {
  const root = slugify(base) || "workspace";
  let candidate = root;
  let n = 1;
  while (await prisma.workspace.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    n += 1;
    candidate = `${root}-${n}`;
  }
  return candidate;
}

export async function createWorkspace(
  input: unknown,
): Promise<ActionResult<{ slug: string; id: string }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(workspaceCreateSchema, input);

    const workspace = await prisma.workspace.create({
      data: {
        name: data.name,
        slug: await uniqueSlug(data.name),
        description: data.description || null,
        color: data.color,
        ownerId: user.id,
        members: { create: { userId: user.id, role: Role.OWNER } },
      },
    });

    await logActivity({
      workspaceId: workspace.id,
      actorId: user.id,
      type: "MEMBER_JOINED",
      message: `${user.name} đã tạo không gian làm việc ${workspace.name}`,
    });

    revalidatePath("/", "layout");
    return ok({ slug: workspace.slug, id: workspace.id });
  });
}

export async function updateWorkspace(input: unknown): Promise<ActionResult<{ slug: string }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(workspaceUpdateSchema, input);

    const membership = await getMembership(user.id, data.workspaceId);
    if (!can(membership?.role, "workspace:update")) throw new ForbiddenError();

    const workspace = await prisma.workspace.update({
      where: { id: data.workspaceId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.color ? { color: data.color } : {}),
      },
    });

    revalidatePath(`/w/${workspace.slug}`, "layout");
    return ok({ slug: workspace.slug });
  });
}

export async function deleteWorkspace(workspaceId: string): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const membership = await getMembership(user.id, workspaceId);
    if (!can(membership?.role, "workspace:delete")) throw new ForbiddenError();

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true },
    });
    if (workspace?.ownerId !== user.id) {
      return fail("Chỉ chủ sở hữu mới xoá được không gian làm việc.");
    }

    await prisma.workspace.delete({ where: { id: workspaceId } });
    revalidatePath("/", "layout");
    return ok(undefined);
  });
}

/** Leaves a workspace. The owner must transfer ownership first. */
export async function leaveWorkspace(workspaceId: string): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const membership = await getMembership(user.id, workspaceId);
    if (!membership) return fail("Bạn không thuộc không gian làm việc này.");
    if (membership.role === Role.OWNER) {
      return fail("Chủ sở hữu cần chuyển quyền trước khi rời đi.");
    }

    await prisma.workspaceMember.delete({ where: { id: membership.id } });
    revalidatePath("/", "layout");
    return ok(undefined);
  });
}
