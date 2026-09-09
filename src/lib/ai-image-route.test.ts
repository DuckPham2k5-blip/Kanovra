import { AiRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Serving a picture the assistant made, against a real database and a real disk.
 *
 * The check here is narrower than the one on attachments, and that is the point
 * worth testing: an attachment asks for workspace *membership*, and this asks
 * whether the conversation is **yours**. A conversation is private even from
 * the people you share a workspace with, so membership would be the wrong
 * question — and getting it wrong is invisible, because the picture would
 * render perfectly for somebody who should not see it.
 *
 * Only the session is mocked. The rows and the bytes are real.
 */

const session = vi.hoisted(() => ({ user: null as { id: string } | null }));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => session.user,
  requireUser: async () => session.user,
  ForbiddenError: class ForbiddenError extends Error {},
}));

const { prisma } = await import("@/lib/prisma");
const { deleteAttachment, saveAttachment } = await import("@/lib/storage");
const { GET } = await import("@/app/api/ai/image/[id]/route");

const CONFIGURED = !!process.env.DATABASE_URL;
const TAG = `ai-img-test-${Date.now().toString(36)}`;
const PIXELS = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

let mineId = "";
let theirsId = "";
let workspaceId = "";

/** Message ids, named for whose conversation they sit in. */
let myPicture = "";
let myPictureFileId = "";
let theirPicture = "";
let myPlainMessage = "";
let myMissingFile = "";

const written: string[] = [];

function get(id: string) {
  return GET(new NextRequest(`http://localhost:3000/api/ai/image/${id}`), {
    params: Promise.resolve({ id }),
  });
}

async function addPicture(input: {
  conversationId: string;
  mime: string;
  /** Skip writing the bytes, to make a row whose file is gone. */
  onDisk?: boolean;
}) {
  const imageId = `${TAG}-${Math.random().toString(36).slice(2)}`;
  if (input.onDisk !== false) {
    written.push(imageId);
    await saveAttachment(imageId, PIXELS);
  }
  const message = await prisma.aiMessage.create({
    data: {
      conversationId: input.conversationId,
      role: AiRole.ASSISTANT,
      content: "a picture",
      imageId,
      imageMime: input.mime,
    },
    select: { id: true },
  });
  return { messageId: message.id, imageId };
}

describe.skipIf(!CONFIGURED)("GET /api/ai/image/[id]", () => {
  beforeAll(async () => {
    mineId = (
      await prisma.user.create({
        data: { clerkId: `${TAG}-me`, email: `${TAG}-me@example.test`, name: "Me" },
      })
    ).id;
    theirsId = (
      await prisma.user.create({
        data: { clerkId: `${TAG}-them`, email: `${TAG}-them@example.test`, name: "Them" },
      })
    ).id;

    workspaceId = (
      await prisma.workspace.create({
        data: { name: "Img Fixture", slug: TAG, ownerId: mineId },
      })
    ).id;

    // Both people are members of the same workspace. That is what makes the
    // ownership check meaningful rather than incidental.
    await prisma.workspaceMember.createMany({
      data: [
        { workspaceId, userId: mineId, role: "OWNER" },
        { workspaceId, userId: theirsId, role: "MEMBER" },
      ],
    });

    const mine = await prisma.aiConversation.create({
      data: { workspaceId, userId: mineId, title: "Mine" },
      select: { id: true },
    });
    const theirs = await prisma.aiConversation.create({
      data: { workspaceId, userId: theirsId, title: "Theirs" },
      select: { id: true },
    });

    const a = await addPicture({ conversationId: mine.id, mime: "image/png" });
    myPicture = a.messageId;
    myPictureFileId = a.imageId;

    theirPicture = (await addPicture({ conversationId: theirs.id, mime: "image/png" })).messageId;

    myPlainMessage = (
      await prisma.aiMessage.create({
        data: { conversationId: mine.id, role: AiRole.USER, content: "no picture here" },
        select: { id: true },
      })
    ).id;

    myMissingFile = (
      await addPicture({ conversationId: mine.id, mime: "image/png", onDisk: false })
    ).messageId;
  });

  beforeEach(() => {
    session.user = { id: mineId };
  });

  afterAll(async () => {
    if (!CONFIGURED) return;
    await prisma.workspace.delete({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: { in: [mineId, theirsId] } } });
    for (const id of written) await deleteAttachment(id).catch(() => {});
  });

  it("serves my own picture", async () => {
    const response = await get(myPicture);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PIXELS);
  });

  /*
   * The assertion this file exists for. Both people are in the same workspace,
   * so a membership check — the question attachments ask — would hand this
   * over. A conversation is private from colleagues, not only from strangers.
   */
  it("refuses a picture from somebody else's conversation, in a shared workspace", async () => {
    const response = await get(theirPicture);
    expect(response.status).toBe(404);
  });

  it("gives them their own", async () => {
    session.user = { id: theirsId };
    expect((await get(theirPicture)).status).toBe(200);
    expect((await get(myPicture)).status).toBe(404);
  });

  /*
   * Every refusal is the same answer, so an id cannot be probed: not signed in,
   * not yours, no such message, a message with no picture and a row whose file
   * has gone all read identically from outside.
   */
  it("answers 404 for everything it declines, without distinguishing them", async () => {
    session.user = null;
    expect((await get(myPicture)).status).toBe(404);

    session.user = { id: mineId };
    expect((await get("no-such-message")).status).toBe(404);
    expect((await get(myPlainMessage)).status).toBe(404);
    expect((await get(myMissingFile)).status).toBe(404);
  });

  describe("the headers", () => {
    it("sends nosniff, and a private cache directive", async () => {
      const response = await get(myPicture);

      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      // Private, because this is one person's conversation and a shared cache
      // in front of the app must never hand it to the next reader.
      expect(response.headers.get("cache-control")).toContain("private");
      expect(response.headers.get("content-length")).toBe(String(PIXELS.length));
    });

    /*
     * The type is pinned to an image and never echoed from the row.
     *
     * `imageMime` is written from a provider's response, so it is not something
     * this application chose. Echoing it would let a stored `text/html` be
     * served as markup **on our own origin** — which is the same stored-XSS
     * reasoning that makes an uploaded `.svg` download rather than render.
     * `nosniff` is what makes the pin work: the browser will not guess, so
     * anything but a true type simply fails to draw.
     */
    it("never serves a row's own content type, whatever it says", async () => {
      const conversation = await prisma.aiConversation.findFirst({
        where: { userId: mineId, workspaceId },
        select: { id: true },
      });
      const hostile = await addPicture({
        conversationId: conversation!.id,
        mime: "text/html",
      });

      const response = await get(hostile.messageId);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(response.headers.get("content-type")).not.toContain("html");
    });

    it("passes a jpeg through as a jpeg", async () => {
      const conversation = await prisma.aiConversation.findFirst({
        where: { userId: mineId, workspaceId },
        select: { id: true },
      });
      const jpeg = await addPicture({ conversationId: conversation!.id, mime: "image/jpeg" });

      expect((await get(jpeg.messageId)).headers.get("content-type")).toBe("image/jpeg");
    });
  });

  it("leaves the file on disk after serving it", async () => {
    // A read must not be a move. Obvious, and exactly the kind of thing a
    // stream-consuming implementation gets wrong once.
    await get(myPicture);
    await get(myPicture);
    const again = await get(myPicture);
    expect(Buffer.from(await again.arrayBuffer())).toEqual(PIXELS);
    expect(myPictureFileId).toBeTruthy();
  });
});
