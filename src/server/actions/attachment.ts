"use server";

import { ActivityType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ForbiddenError, getTaskContext, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/events";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  cleanFilename,
  deleteAttachment,
  MAX_ATTACHMENT_BYTES,
  saveAttachment,
} from "@/lib/storage";
import { fail, NOT_FOUND, ok, parse, withErrorHandling, type ActionResult } from "@/server/action-result";

/**
 * Task attachments.
 *
 * There is no dedicated `attachment:*` permission — attaching a file is a
 * modification of the task, so both actions gate on `task:update`, which keeps
 * viewers read-only without inventing a parallel permission axis.
 */

export async function uploadAttachment(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();

    const taskId = parse(z.string().cuid(), formData.get("taskId"));
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return fail("Choose a file to attach.");
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return fail(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.`,
      );
    }

    const ctx = await getTaskContext(user.id, taskId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "task:update")) throw new ForbiddenError();

    // The id is generated here rather than by the database so the bytes can be
    // written under their final name before the row exists — that way a failed
    // insert never leaves a row pointing at a file that was never stored.
    const id = crypto.randomUUID();
    const name = cleanFilename(file.name);
    await saveAttachment(id, Buffer.from(await file.arrayBuffer()));

    try {
      await prisma.attachment.create({
        data: {
          id,
          taskId,
          name,
          url: `/api/attachments/${id}`,
          mimeType: file.type || null,
          size: file.size,
        },
      });
    } catch (error) {
      await deleteAttachment(id);
      throw error;
    }

    await logActivity({
      workspaceId: ctx.workspace.id,
      actorId: user.id,
      type: ActivityType.TASK_UPDATED,
      message: `attached ${name} to ${ctx.project.key}-${ctx.task.number}`,
      projectId: ctx.project.id,
      taskId,
    });

    revalidatePath(`/w/${ctx.workspace.slug}/projects/${ctx.project.id}`, "layout");
    return ok({ id });
  });
}

const deleteSchema = z.object({ attachmentId: z.string().min(1) });

export async function removeAttachment(input: unknown): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const { attachmentId } = parse(deleteSchema, input);

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { id: true, name: true, taskId: true },
    });
    if (!attachment) return fail(NOT_FOUND);

    const ctx = await getTaskContext(user.id, attachment.taskId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "task:update")) throw new ForbiddenError();

    await prisma.attachment.delete({ where: { id: attachment.id } });
    // Row first, file second: an orphaned file only wastes disk, whereas an
    // orphaned row shows the user a download that 404s.
    await deleteAttachment(attachment.id);

    await logActivity({
      workspaceId: ctx.workspace.id,
      actorId: user.id,
      type: ActivityType.TASK_UPDATED,
      message: `removed ${attachment.name} from ${ctx.project.key}-${ctx.task.number}`,
      projectId: ctx.project.id,
      taskId: attachment.taskId,
    });

    revalidatePath(`/w/${ctx.workspace.slug}/projects/${ctx.project.id}`, "layout");
    return ok(undefined);
  });
}
