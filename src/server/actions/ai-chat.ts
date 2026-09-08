"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteAttachment } from "@/lib/storage";
import { fail, NOT_FOUND, ok, parse, withErrorHandling, type ActionResult } from "@/server/action-result";

/**
 * Keeping, renaming and discarding conversations.
 *
 * ## Ownership is the whole permission model here
 *
 * There is no role check anywhere in this file, and that is deliberate rather
 * than an omission. A conversation belongs to one person; a Viewer may have as
 * many as an Owner, and an Owner may not read a Viewer's. So every query is
 * scoped by `userId` in its `where` clause rather than by a `can()` call — and
 * scoping the *query* is what makes "not yours" and "does not exist" the same
 * answer, so the id of somebody else's conversation cannot be probed for.
 *
 * The messages themselves are written by the streaming route, not from here:
 * an answer arrives a token at a time and only exists in full once the stream
 * has ended, which is not a shape a Server Action can hold.
 */

const idSchema = z.object({ conversationId: z.string().min(1) });

const renameSchema = z.object({
  conversationId: z.string().min(1),
  title: z.string().trim().min(1, "Give it a name").max(80),
});

export async function renameConversation(input: unknown): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(renameSchema, input);

    const { count } = await prisma.aiConversation.updateMany({
      // Scoped by owner, not checked after the fact: a `findUnique` then a
      // comparison is the same thing with a window in the middle.
      where: { id: data.conversationId, userId: user.id },
      data: { title: data.title },
    });
    if (count === 0) return fail(NOT_FOUND);

    revalidatePath("/w", "layout");
    return ok(undefined);
  });
}

/**
 * Throws a conversation away.
 *
 * Rows cascade from the conversation, but a generated picture is a file on
 * disk with no foreign key to cascade along — so it is removed here, before the
 * rows that name it are gone. Doing it afterwards would leave the ids
 * unreachable and the bytes on the disk for ever, which is the silent half of
 * this: nothing fails, the disk just fills up over months.
 */
export async function deleteConversation(input: unknown): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(idSchema, input);

    const conversation = await prisma.aiConversation.findFirst({
      where: { id: data.conversationId, userId: user.id },
      select: { id: true, messages: { where: { imageId: { not: null } }, select: { imageId: true } } },
    });
    if (!conversation) return fail(NOT_FOUND);

    for (const message of conversation.messages) {
      if (message.imageId) await deleteAttachment(message.imageId).catch(() => {});
    }

    await prisma.aiConversation.delete({ where: { id: conversation.id } });

    revalidatePath("/w", "layout");
    return ok(undefined);
  });
}

/** Every conversation of this person's, in this workspace. Newest first. */
export async function clearConversations(input: unknown): Promise<ActionResult<{ removed: number }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(z.object({ workspaceId: z.string().min(1) }), input);

    const conversations = await prisma.aiConversation.findMany({
      where: { userId: user.id, workspaceId: data.workspaceId },
      select: { id: true, messages: { where: { imageId: { not: null } }, select: { imageId: true } } },
    });

    for (const conversation of conversations) {
      for (const message of conversation.messages) {
        if (message.imageId) await deleteAttachment(message.imageId).catch(() => {});
      }
    }

    const { count } = await prisma.aiConversation.deleteMany({
      where: { userId: user.id, workspaceId: data.workspaceId },
    });

    revalidatePath("/w", "layout");
    return ok({ removed: count });
  });
}
