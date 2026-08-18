"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ForbiddenError, getMembership, requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fail, NOT_FOUND, ok, parse, withErrorHandling, type ActionResult } from "@/server/action-result";

/**
 * Comments on a single node of a mind map.
 *
 * Separate from the map's own save, deliberately. A map is one JSON document
 * saved explicitly and all at once, so a comment stored inside it would be
 * overwritten the next time anybody saved their version of the drawing — and
 * the loss would be silent, because the person who lost it was not looking at
 * the map when it happened.
 *
 * Reuses the task comment permissions rather than inventing a parallel axis:
 * anybody who may comment on a task may comment on a node, and deleting
 * somebody else's still needs `comment:delete_any`.
 */

/** Locates a map and the caller's standing in its workspace, or nothing. */
async function mapContext(userId: string, mapId: string) {
  const map = await prisma.mindMap.findUnique({
    where: { id: mapId },
    select: { id: true, workspaceId: true, workspace: { select: { slug: true } } },
  });
  if (!map) return null;

  // Membership first: the same answer for "no such map" and "not your
  // workspace" keeps an id from confirming that it exists.
  const membership = await getMembership(userId, map.workspaceId);
  if (!membership) return null;

  return { map, role: membership.role };
}

const createSchema = z.object({
  mapId: z.string().min(1),
  nodeId: z.string().min(1).max(64),
  body: z.string().trim().min(1, "Write something first").max(2000),
});

export async function createMindMapComment(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(createSchema, input);

    const ctx = await mapContext(user.id, data.mapId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "comment:create")) throw new ForbiddenError();

    /*
     * The node is checked against the map's own JSON before the comment is
     * written. `nodeId` has no foreign key to enforce it — the node is not a
     * row — so without this a comment can be attached to an id that has never
     * existed, and it would sit in the table forever, invisible and
     * unreachable.
     */
    const stored = await prisma.mindMap.findUnique({
      where: { id: data.mapId },
      select: { data: true },
    });
    const nodes = (stored?.data as { nodes?: { id?: unknown }[] } | null)?.nodes ?? [];
    if (!nodes.some((node) => node?.id === data.nodeId)) return fail(NOT_FOUND);

    const comment = await prisma.mindMapComment.create({
      data: {
        mapId: data.mapId,
        nodeId: data.nodeId,
        authorId: user.id,
        body: data.body,
      },
    });

    /*
     * No activity row and no notification.
     *
     * `logActivity` is what publishes to the realtime bus, and a map redraws
     * from its own props — so an activity here would push every reader's canvas
     * to refetch a document they may be halfway through editing, discarding
     * unsaved work to deliver a comment. The comment list refreshes on the next
     * navigation or reload, which for discussion is soon enough.
     */
    revalidatePath(`/w/${ctx.map.workspace.slug}/maps/${data.mapId}`);
    return ok({ id: comment.id });
  });
}

export async function deleteMindMapComment(commentId: string): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const id = parse(z.string().min(1), commentId);

    const comment = await prisma.mindMapComment.findUnique({
      where: { id },
      select: { authorId: true, mapId: true },
    });
    if (!comment) return fail(NOT_FOUND);

    const ctx = await mapContext(user.id, comment.mapId);
    if (!ctx) return fail(NOT_FOUND);

    const isAuthor = comment.authorId === user.id;
    if (!isAuthor && !can(ctx.role, "comment:delete_any")) throw new ForbiddenError();

    await prisma.mindMapComment.delete({ where: { id } });

    revalidatePath(`/w/${ctx.map.workspace.slug}/maps/${comment.mapId}`);
    return ok(undefined);
  });
}

/**
 * Records that this person has now read the discussion on a node.
 *
 * An upsert on `(userId, mapId, nodeId)`, so opening a thread twice is one row
 * and the second open simply moves the timestamp forward. That is also why the
 * row stores a time rather than a flag: a reply posted after you last looked has
 * to be able to make an already-read node unread again, and a boolean cannot say
 * that without somebody clearing it for every reader when a comment is written.
 *
 * Membership is checked the same way as writing a comment — through
 * `mapContext`, which answers the same "not found" for a map in somebody else's
 * workspace as for a map that does not exist. No permission beyond membership:
 * marking something read is a statement about yourself.
 *
 * Deliberately does **not** revalidate. This fires when a panel opens, and
 * re-rendering the page underneath the panel that just opened is a visible jolt
 * for a change the reader already knows about — the badge is updated in the
 * browser, and the next real navigation picks up the row.
 */
export async function markNodeCommentsRead(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const { mapId, nodeId } = parse(
      z.object({ mapId: z.string().min(1), nodeId: z.string().min(1).max(64) }),
      input,
    );

    const ctx = await mapContext(user.id, mapId);
    if (!ctx) return fail(NOT_FOUND);

    const readAt = new Date();
    await prisma.mindMapCommentRead.upsert({
      where: { userId_mapId_nodeId: { userId: user.id, mapId, nodeId } },
      create: { userId: user.id, mapId, nodeId, readAt },
      update: { readAt },
    });

    return ok(undefined);
  });
}
