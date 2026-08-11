"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { z } from "zod";

import { ForbiddenError, getMembership, getProjectContext, requireUser } from "@/lib/auth";
import { logActivity, notifyMany } from "@/lib/events";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  BANNER_MIME_TYPES,
  bannerPresetCss,
  MAX_BANNER_BYTES,
  sanitiseBannerUrl,
} from "@/lib/project-banners";
import { verifyRemoteImage } from "@/lib/remote-image";
import { deleteAttachment, saveAttachment } from "@/lib/storage";
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
        message: `${user.name} created the project ${project.name}`,
      }),
      notifyMany(
        workspace.members.map((m) => m.userId),
        {
          workspaceId: workspace.id,
          actorId: user.id,
          type: "PROJECT_UPDATED",
          title: `New project: ${project.name}`,
          body: `${user.name} just created a project in ${workspace.name}`,
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
      message: `${user.name} updated the project ${project.name}`,
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
      message: `${user.name} ${archived ? "archived" : "restored"} the project ${ctx.project.name}`,
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
    if (!target) return fail("They are not a member of this workspace yet.");

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

/**
 * Sets the project header's backdrop: a built-in gradient, an uploaded
 * picture, or neither.
 *
 * Gated on `project:update` rather than a new permission — a banner is a
 * property of the project like its colour or its icon, and inventing a
 * parallel axis for decoration would mean two places to get wrong.
 *
 * Uploads reuse the attachment store, so the bytes land outside the web root
 * under a generated id and are served by a route that re-checks membership.
 * The previous picture is deleted once the new row is written, in that order:
 * a row pointing at bytes that are gone shows a broken header, while bytes
 * with no row are merely an orphan nobody sees.
 */
export async function setProjectBanner(formData: FormData): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();

    const projectId = parse(z.string().min(1), formData.get("projectId"));
    const mode = parse(
      z.enum(["preset", "upload", "clear", "position", "link"]),
      formData.get("mode"),
    );

    const ctx = await getProjectContext(user.id, projectId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "project:update")) throw new ForbiddenError();

    const previousImageId = ctx.project.bannerImageId;

    if (mode === "clear") {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          bannerPreset: null,
          bannerImageId: null,
          bannerImageMime: null,
          bannerImageUrl: null,
        },
      });
      if (previousImageId) await deleteAttachment(previousImageId);
    }

    if (mode === "preset") {
      const preset = parse(z.string().min(1), formData.get("preset"));
      if (!bannerPresetCss(preset)) return fail("That backdrop does not exist.");

      // The upload is dropped as well as unset. Keeping it would leave bytes on
      // disk that nothing references and nobody can reach.
      await prisma.project.update({
        where: { id: projectId },
        data: {
          bannerPreset: preset,
          bannerImageId: null,
          bannerImageMime: null,
          bannerImageUrl: null,
        },
      });
      if (previousImageId) await deleteAttachment(previousImageId);
    }

    if (mode === "link") {
      const url = sanitiseBannerUrl(parse(z.string().min(1), formData.get("url")));
      if (!url) {
        return fail("Use a full https:// link to a picture, with no username or password in it.");
      }

      // Fetched once here so the failure is reported now, with a reason, rather
      // than as an empty header nobody can explain later.
      const check = await verifyRemoteImage(url);
      if (!check.ok) return fail(check.reason);

      await prisma.project.update({
        where: { id: projectId },
        data: {
          bannerImageUrl: url,
          bannerImageId: null,
          bannerImageMime: null,
          bannerPreset: null,
          // A different picture entirely, so the old framing means nothing.
          bannerPositionY: 50,
        },
      });
      if (previousImageId) await deleteAttachment(previousImageId);
    }

    // Framing only — no new bytes, no change of source. Kept as its own mode so
    // dragging the slider does not re-upload the picture on every step.
    if (mode === "position") {
      const y = parse(z.coerce.number().int().min(0).max(100), formData.get("positionY"));
      await prisma.project.update({
        where: { id: projectId },
        data: { bannerPositionY: y },
      });
    }

    if (mode === "upload") {
      const file = formData.get("file");
      if (!(file instanceof File) || file.size === 0) return fail("Choose a picture to upload.");
      if (file.size > MAX_BANNER_BYTES) {
        return fail(
          `That picture is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_BANNER_BYTES / 1024 / 1024} MB.`,
        );
      }
      // The browser supplies this type and a browser can be lied to, which is
      // why the serving route sends `nosniff` and never renders anything
      // inline that is not on this list.
      if (!BANNER_MIME_TYPES.has(file.type)) {
        return fail("Use a PNG, JPEG or WebP picture.");
      }

      const id = crypto.randomUUID();
      await saveAttachment(id, Buffer.from(await file.arrayBuffer()));

      try {
        await prisma.project.update({
          where: { id: projectId },
          // A fresh picture starts centred; the previous framing belonged to a
          // different image and would crop this one at random.
          data: {
            bannerImageId: id,
            bannerImageMime: file.type,
            bannerPreset: null,
            bannerImageUrl: null,
            bannerPositionY: 50,
          },
        });
      } catch (error) {
        await deleteAttachment(id);
        throw error;
      }

      if (previousImageId) await deleteAttachment(previousImageId);
    }

    await logActivity({
      workspaceId: ctx.workspace.id,
      projectId,
      actorId: user.id,
      type: "PROJECT_UPDATED",
      message: `${user.name} changed the backdrop for ${ctx.project.name}`,
    });

    revalidatePath(`/w/${ctx.workspace.slug}/projects/${projectId}`, "layout");
    return ok(undefined);
  });
}
