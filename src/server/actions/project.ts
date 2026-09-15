"use server";

import { Prisma, Role } from "@prisma/client";
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
import { ORDER_STEP } from "@/lib/constants";
import {
  columnIndexForStatus,
  templateById,
  type ProjectTemplate,
} from "@/lib/project-templates";
import { projectKeyFromName } from "@/lib/utils";
import { projectCreateSchema, projectUpdateSchema } from "@/lib/validations";
import { fail, NOT_FOUND, ok, parse, withErrorHandling, type ActionResult } from "@/server/action-result";

/**
 * Writes a template's labels and starter tasks into a project that already
 * exists.
 *
 * Not exported: a `"use server"` module may export nothing but server actions,
 * and an exported task-creator here would be callable from any browser — the
 * same reason the recurrence spawner lives in `lib/`.
 */
async function applyTemplateContent(
  template: ProjectTemplate,
  projectId: string,
  workspaceId: string,
  createdById: string,
  columns: { id: string }[],
) {
  /*
   * Labels belong to the workspace, keyed `@@unique([workspaceId, name])`, so
   * the second project built from a template meets labels the first one made.
   * `update: {}` is deliberate: an existing label keeps the name and colour the
   * workspace gave it, because somebody's own choice outranks a preset's.
   */
  const labelIds = new Map<string, string>();
  for (const label of template.labels) {
    const row = await prisma.label.upsert({
      where: { workspaceId_name: { workspaceId, name: label.name } },
      update: {},
      create: { workspaceId, name: label.name, color: label.color },
      select: { id: true, name: true },
    });
    labelIds.set(row.name, row.id);
  }

  if (template.tasks.length === 0) return;

  /*
   * One increment for the whole block, not one per task.
   *
   * `nextTaskNumber` in the task action increments per call, which is right when
   * a person creates one task. Here the count is known, and taking the numbers
   * in a single atomic step means a template of five tasks cannot interleave
   * with somebody creating a task by hand at the same moment and end up with two
   * rows claiming `WEB-3`.
   */
  const { taskCounter } = await prisma.project.update({
    where: { id: projectId },
    data: { taskCounter: { increment: template.tasks.length } },
    select: { taskCounter: true },
  });
  const firstNumber = taskCounter - template.tasks.length + 1;

  for (const [i, task] of template.tasks.entries()) {
    // The columns were created from `template.columns` in order and are read
    // back ordered by `order`, so the two lists line up index for index.
    const column = columns[columnIndexForStatus(template, task.status)];
    // Deduplicated: `TaskLabel` is keyed `@@id([taskId, labelId])`, so the same
    // label named twice on one task would fail the whole create on a primary
    // key violation. A test forbids it in the presets; this makes it impossible
    // rather than merely forbidden.
    const names = [...new Set(task.labels ?? [])];

    await prisma.task.create({
      data: {
        projectId,
        columnId: column?.id ?? null,
        number: firstNumber + i,
        title: task.title,
        description: task.description ?? null,
        status: task.status,
        priority: task.priority,
        order: (i + 1) * ORDER_STEP,
        createdById,
        labels: {
          create: names
            .map((name) => labelIds.get(name))
            .filter((id): id is string => Boolean(id))
            .map((labelId) => ({ labelId })),
        },
      },
    });
  }
}

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
    const template = templateById(data.templateId);

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
          create: template.columns.map((c, i) => ({ ...c, order: (i + 1) * ORDER_STEP })),
        },
      },
      include: { columns: { orderBy: { order: "asc" } } },
    });

    await applyTemplateContent(template, project.id, data.workspaceId, user.id, project.columns);

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
/** One theme's banner columns, so a write targets the light set or the dark. */
function bannerData(
  theme: "light" | "dark",
  values: {
    preset?: string | null;
    imageId?: string | null;
    imageMime?: string | null;
    imageUrl?: string | null;
    positionY?: number;
  },
): Prisma.ProjectUpdateInput {
  if (theme === "dark") {
    const d: Prisma.ProjectUpdateInput = {};
    if ("preset" in values) d.bannerPresetDark = values.preset;
    if ("imageId" in values) d.bannerImageIdDark = values.imageId;
    if ("imageMime" in values) d.bannerImageMimeDark = values.imageMime;
    if ("imageUrl" in values) d.bannerImageUrlDark = values.imageUrl;
    if (values.positionY !== undefined) d.bannerPositionYDark = values.positionY;
    return d;
  }
  const d: Prisma.ProjectUpdateInput = {};
  if ("preset" in values) d.bannerPreset = values.preset;
  if ("imageId" in values) d.bannerImageId = values.imageId;
  if ("imageMime" in values) d.bannerImageMime = values.imageMime;
  if ("imageUrl" in values) d.bannerImageUrl = values.imageUrl;
  if (values.positionY !== undefined) d.bannerPositionY = values.positionY;
  return d;
}

export async function setProjectBanner(formData: FormData): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();

    const projectId = parse(z.string().min(1), formData.get("projectId"));
    const mode = parse(
      z.enum(["preset", "upload", "clear", "position", "link"]),
      formData.get("mode"),
    );
    // Which theme's banner this sets. The dialog is opened in the viewer's
    // current theme and sends it, so setting a backdrop in dark mode leaves the
    // light one alone and vice versa.
    const theme: "light" | "dark" = formData.get("theme") === "dark" ? "dark" : "light";

    const ctx = await getProjectContext(user.id, projectId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "project:update")) throw new ForbiddenError();

    // The uploaded picture this theme is replacing — the *other* theme's picture
    // is a separate row and must not be deleted.
    const previousImageId =
      theme === "dark" ? ctx.project.bannerImageIdDark : ctx.project.bannerImageId;

    if (mode === "clear") {
      await prisma.project.update({
        where: { id: projectId },
        data: bannerData(theme, { preset: null, imageId: null, imageMime: null, imageUrl: null }),
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
        data: bannerData(theme, { preset, imageId: null, imageMime: null, imageUrl: null }),
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
        // A different picture entirely, so the old framing means nothing.
        data: bannerData(theme, {
          imageUrl: url,
          imageId: null,
          imageMime: null,
          preset: null,
          positionY: 50,
        }),
      });
      if (previousImageId) await deleteAttachment(previousImageId);
    }

    // Framing only — no new bytes, no change of source. Kept as its own mode so
    // dragging the slider does not re-upload the picture on every step.
    if (mode === "position") {
      const y = parse(z.coerce.number().int().min(0).max(100), formData.get("positionY"));
      await prisma.project.update({
        where: { id: projectId },
        data: bannerData(theme, { positionY: y }),
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
          data: bannerData(theme, {
            imageId: id,
            imageMime: file.type,
            preset: null,
            imageUrl: null,
            positionY: 50,
          }),
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
