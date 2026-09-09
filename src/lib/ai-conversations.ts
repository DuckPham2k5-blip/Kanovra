import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Reading somebody's own conversations.
 *
 * ## Every query is scoped by owner in its `where`, never checked afterwards
 *
 * A conversation is private in a way nothing else in this application is: a
 * Viewer may have as many as an Owner, and an Owner may not read a Viewer's, so
 * the role matrix has nothing to say here. Ownership *is* the permission model.
 *
 * That is why the owner is a condition of the query rather than a comparison
 * after it. Fetching by id and then testing `row.userId === user.id` gives the
 * same answer and a different failure: the two lines can drift apart, and the
 * moment one caller forgets the second line it reads somebody else's chat with
 * nothing failing. Scoped in the `where`, "not yours" and "does not exist" are
 * the same answer by construction, so a conversation id cannot even be probed
 * for existence.
 *
 * These live here rather than inline in the page and the route so that property
 * has one place to be true and one place to be tested — against a real
 * database, because what is being asserted is what a `where` clause matches.
 */

export const DEFAULT_CONVERSATION_LIMIT = 60;

/** This person's conversations in this workspace, most recently used first. */
export async function listConversations(input: {
  userId: string;
  workspaceId: string;
  take?: number;
}) {
  return prisma.aiConversation.findMany({
    where: { userId: input.userId, workspaceId: input.workspaceId },
    orderBy: { updatedAt: "desc" },
    take: input.take ?? DEFAULT_CONVERSATION_LIMIT,
    select: { id: true, title: true, updatedAt: true },
  });
}

/**
 * One conversation with its turns, or null.
 *
 * Null covers every reason equally: no such id, somebody else's, or the right
 * conversation reached from the wrong workspace. The caller cannot tell them
 * apart, which is the point.
 */
export async function openConversation(input: {
  conversationId: string;
  userId: string;
  workspaceId: string;
}) {
  return prisma.aiConversation.findFirst({
    where: {
      id: input.conversationId,
      userId: input.userId,
      workspaceId: input.workspaceId,
    },
    select: {
      id: true,
      title: true,
      messages: {
        // Oldest first: this is a transcript, and it is read in the order it
        // happened. `id` breaks a tie so two rows written in the same
        // millisecond cannot swap places between one load and the next.
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          role: true,
          content: true,
          model: true,
          imageId: true,
          createdAt: true,
        },
      },
    },
  });
}

/** Just the id, for a caller that only needs to know the conversation is theirs. */
export async function findOwnConversation(input: {
  conversationId: string;
  userId: string;
  workspaceId: string;
}) {
  return prisma.aiConversation.findFirst({
    where: {
      id: input.conversationId,
      userId: input.userId,
      workspaceId: input.workspaceId,
    },
    select: { id: true },
  });
}

/**
 * The most recent turns of a conversation, oldest first.
 *
 * The `take` bites at the *recent* end — reversed here rather than ordered
 * ascending, because ordering ascending with a `take` would send a long
 * conversation's opening and forget everything since.
 */
export async function recentTurns(conversationId: string, take: number) {
  const rows = await prisma.aiMessage.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: { role: true, content: true },
  });
  return rows.reverse();
}
