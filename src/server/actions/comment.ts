"use server";

import { revalidatePath } from "next/cache";

import { ForbiddenError, getTaskContext, requireUser } from "@/lib/auth";
import { logActivity, notifyMany, taskLink, taskWatchers } from "@/lib/events";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { commentCreateSchema, commentDeleteSchema } from "@/lib/validations";
import { fail, NOT_FOUND, ok, parse, withErrorHandling, type ActionResult } from "@/server/action-result";

/**
 * Mentions use `@<email-local-part>` — the same handle the mention picker
 * inserts. Returns the ids of workspace members referenced in the text.
 */
async function resolveMentions(content: string, workspaceId: string) {
  const handles = Array.from(content.matchAll(/@([a-zA-Z0-9._-]{2,64})/g)).map((m) =>
    m[1].toLowerCase(),
  );
  if (handles.length === 0) return [];

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: { user: { select: { id: true, email: true } } },
  });

  return members
    .filter((m) => handles.includes(m.user.email.split("@")[0].toLowerCase()))
    .map((m) => m.user.id);
}

export async function createComment(input: unknown): Promise<ActionResult<{ id: string }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(commentCreateSchema, input);

    const ctx = await getTaskContext(user.id, data.taskId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "comment:create")) throw new ForbiddenError();

    const mentions = await resolveMentions(data.content, ctx.workspace.id);

    const comment = await prisma.comment.create({
      data: {
        taskId: data.taskId,
        authorId: user.id,
        content: data.content,
        mentions,
      },
    });

    const ref = `${ctx.project.key}-${ctx.task.number}`;
    const link = taskLink(ctx.workspace.slug, ctx.task.projectId, ctx.task.id);
    const preview = data.content.length > 120 ? `${data.content.slice(0, 120)}…` : data.content;

    await logActivity({
      workspaceId: ctx.workspace.id,
      projectId: ctx.task.projectId,
      taskId: ctx.task.id,
      actorId: user.id,
      type: "COMMENT_CREATED",
      message: `${user.name} commented on ${ref}`,
    });

    // Mentioned people get the stronger notification; everyone else watching
    // the task gets the generic one (and never both).
    await notifyMany(mentions, {
      workspaceId: ctx.workspace.id,
      actorId: user.id,
      type: "COMMENT_MENTION",
      title: `${user.name} mentioned you in ${ref}`,
      body: preview,
      link,
    });

    const watchers = (await taskWatchers(ctx.task.id)).filter((id) => !mentions.includes(id));
    await notifyMany(watchers, {
      workspaceId: ctx.workspace.id,
      actorId: user.id,
      type: "COMMENT_CREATED",
      title: `New comment on ${ref}`,
      body: preview,
      link,
    });

    revalidatePath(`/w/${ctx.workspace.slug}/projects/${ctx.task.projectId}`, "layout");
    return ok({ id: comment.id });
  });
}

export async function deleteComment(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(commentDeleteSchema, input);

    const comment = await prisma.comment.findUnique({
      where: { id: data.commentId },
      select: { authorId: true, taskId: true },
    });
    if (!comment) return fail(NOT_FOUND);

    const ctx = await getTaskContext(user.id, comment.taskId);
    if (!ctx) return fail(NOT_FOUND);

    const isAuthor = comment.authorId === user.id;
    if (!isAuthor && !can(ctx.role, "comment:delete_any")) throw new ForbiddenError();

    await prisma.comment.delete({ where: { id: data.commentId } });

    revalidatePath(`/w/${ctx.workspace.slug}/projects/${ctx.task.projectId}`, "layout");
    return ok(undefined);
  });
}

/** Used by the "@" picker in the comment box. */
export async function getMentionCandidates(taskId: string) {
  const user = await requireUser();
  const ctx = await getTaskContext(user.id, taskId);
  if (!ctx) return [];

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: ctx.workspace.id },
    select: { user: { select: { id: true, name: true, email: true, imageUrl: true } } },
  });

  return members.map((m) => ({
    ...m.user,
    handle: m.user.email.split("@")[0],
  }));
}
