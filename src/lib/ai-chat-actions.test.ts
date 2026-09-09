import { AiRole } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The conversation actions, against a real database and a real disk.
 *
 * ## One thing is mocked, and only one
 *
 * These are `"use server"` actions, so they begin with `requireUser()` — a
 * Clerk session, which cannot exist outside a request. No other test in this
 * project mocks a module, and that is worth keeping true: a suite full of
 * doubles asserts what its author expected rather than what the code does.
 *
 * So the session is replaced and nothing else is. Prisma is real, the
 * filesystem is real, and every assertion below is about a row or a file. What
 * is being tested — a `where` clause that matches more than it says, and a
 * delete that leaves bytes behind — is invisible to a mocked client by
 * construction.
 *
 * `revalidatePath` goes too, because it is Next asking for a request context
 * that a test runner does not have. It has no observable effect here.
 */

const session = vi.hoisted(() => ({ userId: "" }));

vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ id: session.userId }),
  ForbiddenError: class ForbiddenError extends Error {},
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { deleteAttachment, readAttachment, saveAttachment } = await import("@/lib/storage");
const { clearConversations, deleteConversation, renameConversation } = await import(
  "@/server/actions/ai-chat"
);

const CONFIGURED = !!process.env.DATABASE_URL;
const TAG = `ai-act-test-${Date.now().toString(36)}`;
const NOT_FOUND = "Not found, or you do not have access to it.";

let mineId = "";
let theirsId = "";
let workspaceId = "";
let otherWorkspaceId = "";

/** Every picture this suite writes, so `afterAll` can take them all back. */
const writtenFiles: string[] = [];

/** True while the bytes for `id` are still on disk. */
async function fileExists(id: string) {
  const file = await readAttachment(id);
  // The handle has to be closed or the run leaks one per assertion.
  file?.stream.destroy();
  return file !== null;
}

async function makeConversation(input: {
  userId: string;
  workspaceId: string;
  title: string;
  /** Attaches a real file on disk to one assistant message. */
  withImage?: boolean;
}) {
  const conversation = await prisma.aiConversation.create({
    data: { userId: input.userId, workspaceId: input.workspaceId, title: input.title },
    select: { id: true },
  });

  await prisma.aiMessage.create({
    data: { conversationId: conversation.id, role: AiRole.USER, content: "a question" },
  });

  let imageId: string | null = null;
  if (input.withImage) {
    imageId = `${TAG}-${conversation.id}`;
    writtenFiles.push(imageId);
    await saveAttachment(imageId, Buffer.from("not really a png"));
    await prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: AiRole.ASSISTANT,
        content: "a picture",
        imageId,
        imageMime: "image/png",
      },
    });
  }

  return { id: conversation.id, imageId };
}

describe.skipIf(!CONFIGURED)("conversation actions", () => {
  beforeAll(async () => {
    const me = await prisma.user.create({
      data: { clerkId: `${TAG}-me`, email: `${TAG}-me@example.test`, name: "Me" },
    });
    mineId = me.id;

    const them = await prisma.user.create({
      data: { clerkId: `${TAG}-them`, email: `${TAG}-them@example.test`, name: "Them" },
    });
    theirsId = them.id;

    workspaceId = (
      await prisma.workspace.create({
        data: { name: "Act Fixture", slug: TAG, ownerId: me.id },
      })
    ).id;

    otherWorkspaceId = (
      await prisma.workspace.create({
        data: { name: "Act Other", slug: `${TAG}-other`, ownerId: me.id },
      })
    ).id;
  });

  beforeEach(() => {
    session.userId = mineId;
  });

  afterAll(async () => {
    if (!CONFIGURED) return;
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [mineId, theirsId] } } });

    /*
     * Rows cascade; files do not — and the files this suite deliberately leaves
     * behind are the ones proving a refusal did *not* delete somebody else's
     * picture. Without this the upload directory gains seven files per run, for
     * ever, which is the same failure the code under test is checked for.
     */
    for (const id of writtenFiles) await deleteAttachment(id).catch(() => {});
  });

  describe("renameConversation", () => {
    it("renames my own", async () => {
      const { id } = await makeConversation({ userId: mineId, workspaceId, title: "Before" });

      const result = await renameConversation({ conversationId: id, title: "After" });
      expect(result.success).toBe(true);

      const row = await prisma.aiConversation.findUnique({ where: { id }, select: { title: true } });
      expect(row?.title).toBe("After");
    });

    /*
     * The assertion that matters is the second one. A refusal that still wrote
     * would report failure and change the row anyway — and nobody checks the
     * database after being told no.
     */
    it("refuses somebody else's, and leaves their title alone", async () => {
      const { id } = await makeConversation({
        userId: theirsId,
        workspaceId,
        title: "Theirs",
      });

      const result = await renameConversation({ conversationId: id, title: "Hijacked" });
      expect(result.success).toBe(false);
      expect(result.success === false && result.error).toBe(NOT_FOUND);

      const row = await prisma.aiConversation.findUnique({ where: { id }, select: { title: true } });
      expect(row?.title).toBe("Theirs");
    });

    it("answers a made-up id exactly as it answers somebody else's", async () => {
      const result = await renameConversation({ conversationId: "no-such-id", title: "x" });
      expect(result.success === false && result.error).toBe(NOT_FOUND);
    });

    it("refuses an empty name and one that is too long", async () => {
      const { id } = await makeConversation({ userId: mineId, workspaceId, title: "Keep" });

      expect((await renameConversation({ conversationId: id, title: "   " })).success).toBe(false);
      expect(
        (await renameConversation({ conversationId: id, title: "x".repeat(81) })).success,
      ).toBe(false);

      const row = await prisma.aiConversation.findUnique({ where: { id }, select: { title: true } });
      expect(row?.title).toBe("Keep");
    });
  });

  describe("deleteConversation", () => {
    it("deletes mine, and its messages go with it", async () => {
      const { id } = await makeConversation({ userId: mineId, workspaceId, title: "Doomed" });

      expect((await deleteConversation({ conversationId: id })).success).toBe(true);

      expect(await prisma.aiConversation.findUnique({ where: { id } })).toBeNull();
      expect(await prisma.aiMessage.count({ where: { conversationId: id } })).toBe(0);
    });

    /*
     * A picture is a file with no foreign key to cascade along, so it is
     * removed in the action. This is the silent half: nothing fails when it is
     * forgotten, the ids simply become unreachable and the bytes stay on the
     * disk for ever.
     */
    it("removes the picture from disk, not only the row", async () => {
      const { id, imageId } = await makeConversation({
        userId: mineId,
        workspaceId,
        title: "With a picture",
        withImage: true,
      });

      expect(await fileExists(imageId!)).toBe(true);
      expect((await deleteConversation({ conversationId: id })).success).toBe(true);
      expect(await fileExists(imageId!)).toBe(false);
    });

    it("refuses somebody else's, and the conversation is still there", async () => {
      const { id } = await makeConversation({ userId: theirsId, workspaceId, title: "Theirs" });

      const result = await deleteConversation({ conversationId: id });
      expect(result.success === false && result.error).toBe(NOT_FOUND);
      expect(await prisma.aiConversation.findUnique({ where: { id } })).not.toBeNull();
    });

    /*
     * And the file survives the refusal too. The action removes pictures before
     * it removes the row, so a check that ran in the wrong order would delete
     * somebody else's bytes and then decline to delete their conversation —
     * leaving a row pointing at nothing, which nothing would report.
     */
    it("does not touch somebody else's picture when it refuses", async () => {
      const { id, imageId } = await makeConversation({
        userId: theirsId,
        workspaceId,
        title: "Theirs, with a picture",
        withImage: true,
      });

      expect((await deleteConversation({ conversationId: id })).success).toBe(false);
      expect(await fileExists(imageId!)).toBe(true);
    });
  });

  describe("clearConversations", () => {
    it("removes all of mine in this workspace and counts them", async () => {
      await makeConversation({ userId: mineId, workspaceId, title: "One" });
      await makeConversation({ userId: mineId, workspaceId, title: "Two" });

      const before = await prisma.aiConversation.count({ where: { userId: mineId, workspaceId } });
      const result = await clearConversations({ workspaceId });

      expect(result.success).toBe(true);
      expect(result.success && result.data.removed).toBe(before);
      expect(await prisma.aiConversation.count({ where: { userId: mineId, workspaceId } })).toBe(0);
    });

    it("leaves my conversations in another workspace alone", async () => {
      const kept = await makeConversation({
        userId: mineId,
        workspaceId: otherWorkspaceId,
        title: "Elsewhere",
      });
      await makeConversation({ userId: mineId, workspaceId, title: "Here" });

      await clearConversations({ workspaceId });

      expect(await prisma.aiConversation.findUnique({ where: { id: kept.id } })).not.toBeNull();
    });

    it("leaves somebody else's alone, in the same workspace", async () => {
      const theirs = await makeConversation({ userId: theirsId, workspaceId, title: "Theirs" });
      await makeConversation({ userId: mineId, workspaceId, title: "Mine" });

      const result = await clearConversations({ workspaceId });

      expect(await prisma.aiConversation.findUnique({ where: { id: theirs.id } })).not.toBeNull();
      // And it is not counted, or the message would report deleting more than
      // it did — a number that reads as data loss to whoever sees it.
      expect(result.success && result.data.removed).toBe(1);
    });

    it("removes every picture it deletes, and none that it keeps", async () => {
      const mine = await makeConversation({
        userId: mineId,
        workspaceId,
        title: "Mine with a picture",
        withImage: true,
      });
      const theirs = await makeConversation({
        userId: theirsId,
        workspaceId,
        title: "Theirs with a picture",
        withImage: true,
      });

      await clearConversations({ workspaceId });

      expect(await fileExists(mine.imageId!)).toBe(false);
      expect(await fileExists(theirs.imageId!)).toBe(true);
    });

    it("answers zero rather than failing when there is nothing to clear", async () => {
      await clearConversations({ workspaceId });
      const again = await clearConversations({ workspaceId });
      expect(again.success && again.data.removed).toBe(0);
    });
  });
});
