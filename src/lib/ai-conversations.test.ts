import { AiRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  findOwnConversation,
  listConversations,
  openConversation,
  recentTurns,
} from "@/lib/ai-conversations";
import { prisma } from "@/lib/prisma";

/**
 * Ownership scoping, against a real database.
 *
 * A conversation is the most private thing this application stores — somebody
 * thinking out loud, including the question they did not want to ask a
 * colleague — and the role matrix has nothing to say about it. Ownership *is*
 * the permission model, expressed as a condition inside every `where`.
 *
 * That is exactly the kind of claim a mocked client cannot test: what is being
 * asserted is what a `where` clause matches, and a fixture answers whatever its
 * author expected. So there are two real people here, in two real workspaces,
 * and the interesting assertions are all about the answers one of them does
 * *not* get.
 *
 * Skipped with no `DATABASE_URL` — somebody who has just cloned the repo.
 * Configured but unreachable is a failure, not a skip.
 */

const CONFIGURED = !!process.env.DATABASE_URL;
const TAG = `ai-conv-test-${Date.now().toString(36)}`;

let mineId = "";
let theirsId = "";
let workspaceId = "";
let otherWorkspaceId = "";

/** Conversation ids, named for whose they are and where they live. */
let myFirst = "";
let mySecond = "";
let mineElsewhere = "";
let theirsHere = "";

describe.skipIf(!CONFIGURED)("reading conversations", () => {
  beforeAll(async () => {
    const me = await prisma.user.create({
      data: { clerkId: `${TAG}-me`, email: `${TAG}-me@example.test`, name: "Me" },
    });
    mineId = me.id;

    const them = await prisma.user.create({
      data: { clerkId: `${TAG}-them`, email: `${TAG}-them@example.test`, name: "Them" },
    });
    theirsId = them.id;

    const workspace = await prisma.workspace.create({
      data: { name: "Conv Fixture", slug: TAG, ownerId: me.id },
    });
    workspaceId = workspace.id;

    const other = await prisma.workspace.create({
      data: { name: "Other Fixture", slug: `${TAG}-other`, ownerId: me.id },
    });
    otherWorkspaceId = other.id;

    // Written oldest first, with `updatedAt` set explicitly: the list is
    // ordered by it, and rows created milliseconds apart would otherwise make
    // the ordering assertion a coin toss.
    const first = await prisma.aiConversation.create({
      data: {
        workspaceId,
        userId: mineId,
        title: "Older of mine",
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
    });
    myFirst = first.id;

    const second = await prisma.aiConversation.create({
      data: {
        workspaceId,
        userId: mineId,
        title: "Newer of mine",
        updatedAt: new Date("2026-06-01T00:00:00Z"),
      },
    });
    mySecond = second.id;

    const elsewhere = await prisma.aiConversation.create({
      data: { workspaceId: otherWorkspaceId, userId: mineId, title: "Mine, other workspace" },
    });
    mineElsewhere = elsewhere.id;

    const theirs = await prisma.aiConversation.create({
      data: { workspaceId, userId: theirsId, title: "Theirs, same workspace" },
    });
    theirsHere = theirs.id;

    // A transcript on the older one, written out of order on purpose so the
    // ordering assertions are about the query rather than about insertion.
    await prisma.aiMessage.createMany({
      data: [
        {
          conversationId: myFirst,
          role: AiRole.ASSISTANT,
          content: "a1",
          createdAt: new Date("2026-01-01T00:00:02Z"),
        },
        {
          conversationId: myFirst,
          role: AiRole.USER,
          content: "u1",
          createdAt: new Date("2026-01-01T00:00:01Z"),
        },
        {
          conversationId: myFirst,
          role: AiRole.USER,
          content: "u2",
          createdAt: new Date("2026-01-01T00:00:03Z"),
        },
      ],
    });
  });

  afterAll(async () => {
    if (!CONFIGURED) return;
    // Conversations cascade from the workspaces; the users own them.
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [mineId, theirsId] } } });
  });

  describe("listConversations", () => {
    it("returns mine in this workspace, newest first", async () => {
      const rows = await listConversations({ userId: mineId, workspaceId });
      expect(rows.map((r) => r.id)).toEqual([mySecond, myFirst]);
    });

    /*
     * The one that matters. Another person's conversation sits in the same
     * workspace, and this list is the sidebar — a filter written as a
     * comparison after the query is one forgotten line from drawing it.
     */
    it("never lists somebody else's, even in a workspace we share", async () => {
      const rows = await listConversations({ userId: mineId, workspaceId });
      expect(rows.map((r) => r.id)).not.toContain(theirsHere);
    });

    it("does not leak a conversation across workspaces", async () => {
      const rows = await listConversations({ userId: mineId, workspaceId });
      expect(rows.map((r) => r.id)).not.toContain(mineElsewhere);

      const elsewhere = await listConversations({
        userId: mineId,
        workspaceId: otherWorkspaceId,
      });
      expect(elsewhere.map((r) => r.id)).toEqual([mineElsewhere]);
    });

    it("gives the other person their own, and only their own", async () => {
      const rows = await listConversations({ userId: theirsId, workspaceId });
      expect(rows.map((r) => r.id)).toEqual([theirsHere]);
    });

    it("honours a limit", async () => {
      const rows = await listConversations({ userId: mineId, workspaceId, take: 1 });
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(mySecond);
    });
  });

  describe("openConversation", () => {
    it("returns the conversation with its turns, oldest first", async () => {
      const conversation = await openConversation({
        conversationId: myFirst,
        userId: mineId,
        workspaceId,
      });

      expect(conversation?.title).toBe("Older of mine");
      // Written a1, u1, u2 — the query has to sort them, not echo the insert.
      expect(conversation?.messages.map((m) => m.content)).toEqual(["u1", "a1", "u2"]);
    });

    /*
     * Three ways to be refused, one answer. A caller must not be able to tell
     * "that is not yours" from "there is no such thing", or the id becomes a
     * way to discover that somebody's conversation exists.
     */
    it("answers null for somebody else's id", async () => {
      expect(
        await openConversation({ conversationId: theirsHere, userId: mineId, workspaceId }),
      ).toBeNull();
    });

    it("answers null for my own conversation reached from the wrong workspace", async () => {
      expect(
        await openConversation({ conversationId: mineElsewhere, userId: mineId, workspaceId }),
      ).toBeNull();
    });

    it("answers null for an id that does not exist", async () => {
      expect(
        await openConversation({ conversationId: "no-such-id", userId: mineId, workspaceId }),
      ).toBeNull();
    });

    it("gives the other person theirs", async () => {
      const theirs = await openConversation({
        conversationId: theirsHere,
        userId: theirsId,
        workspaceId,
      });
      expect(theirs?.title).toBe("Theirs, same workspace");
    });
  });

  describe("findOwnConversation", () => {
    it("finds mine and refuses theirs, with the same shape of answer", async () => {
      expect(
        (await findOwnConversation({ conversationId: myFirst, userId: mineId, workspaceId }))?.id,
      ).toBe(myFirst);
      expect(
        await findOwnConversation({ conversationId: theirsHere, userId: mineId, workspaceId }),
      ).toBeNull();
    });
  });

  describe("recentTurns", () => {
    it("returns turns oldest first", async () => {
      const turns = await recentTurns(myFirst, 10);
      expect(turns.map((t) => t.content)).toEqual(["u1", "a1", "u2"]);
    });

    /*
     * The trim has to bite at the *recent* end. Ordered ascending with a `take`
     * it would send a long conversation's opening and forget everything since —
     * an assistant that remembers how the chat started and nothing after it.
     */
    it("keeps the most recent turns when it has to choose", async () => {
      const turns = await recentTurns(myFirst, 2);
      expect(turns.map((t) => t.content)).toEqual(["a1", "u2"]);
    });

    it("answers with nothing for a conversation that has none", async () => {
      expect(await recentTurns(mySecond, 10)).toEqual([]);
    });
  });
});
