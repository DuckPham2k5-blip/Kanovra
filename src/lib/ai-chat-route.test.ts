import { AiRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The one endpoint in this application that costs money and serves somebody's
 * private conversation, against a real database.
 *
 * Everything the middleware does for the rest of the app has to be done by hand
 * here — `/api/` is not a Server Action and this route is not public — so the
 * session, the membership, the ownership scoping and the spend limit are four
 * separate things that can each be forgotten. None of them had a test.
 *
 * Two doubles, and no more. The session, because Clerk cannot exist outside a
 * request; and the network, because a test must never reach a provider. The
 * *real* `streamChat` runs against that stubbed network, so the provider
 * adapter and the SSE reassembly are exercised rather than skipped.
 */

const session = vi.hoisted(() => ({ user: null as { id: string } | null }));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => session.user,
  requireUser: async () => session.user,
  ForbiddenError: class ForbiddenError extends Error {},
}));

const { prisma } = await import("@/lib/prisma");
const { resetRateLimits, AI_LIMIT } = await import("@/lib/rate-limit");
const { POST } = await import("@/app/api/ai/chat/route");

const CONFIGURED = !!process.env.DATABASE_URL;
const TAG = `ai-route-test-${Date.now().toString(36)}`;
const CHAT_MODEL = "gemini-2.5-flash";

let mineId = "";
let theirsId = "";
let workspaceId = "";
let outsiderWorkspaceId = "";

/** A Gemini stream that says `text`, delivered in pieces the way a socket does. */
function geminiSaying(text: string) {
  const frames = text
    .split(" ")
    .map((word) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: `${word} ` }] } }] })}\n\n`)
    .join("");

  return new Response(
    new ReadableStream({
      start(controller) {
        const bytes = new TextEncoder().encode(frames);
        // Chopped mid-frame on purpose: the reassembler is part of what this
        // exercises, and a whole-body stream would never test it.
        for (let i = 0; i < bytes.length; i += 11) controller.enqueue(bytes.slice(i, i + 11));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost:3000/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/** Drains a streaming response into the text a reader would have seen. */
async function readAll(response: Response) {
  return response.body ? await new Response(response.body).text() : "";
}

describe.skipIf(!CONFIGURED)("POST /api/ai/chat", () => {
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
      data: { name: "Route Fixture", slug: TAG, ownerId: me.id },
    });
    workspaceId = workspace.id;
    await prisma.workspaceMember.create({
      data: { workspaceId, userId: mineId, role: "OWNER" },
    });

    /*
     * A workspace somebody else belongs to and this caller does not.
     *
     * The membership row is the whole point and was missing at first:
     * `workspace.create({ ownerId })` sets a column and creates no member, so
     * the workspace had no members at all — and the "not a member" test passed
     * against a *broken* check, because a query with the caller filter removed
     * still found nothing. A fixture has to contain the row the query is
     * supposed to be filtering out, or it proves the query ran rather than that
     * it discriminates.
     */
    const outsider = await prisma.workspace.create({
      data: { name: "Not Mine", slug: `${TAG}-outsider`, ownerId: them.id },
    });
    outsiderWorkspaceId = outsider.id;
    await prisma.workspaceMember.create({
      data: { workspaceId: outsiderWorkspaceId, userId: theirsId, role: "OWNER" },
    });
  });

  beforeEach(() => {
    session.user = { id: mineId };
    resetRateLimits();
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-key-abcdefghijklmnopqrstuvwxyz");
    vi.stubGlobal("fetch", async () => geminiSaying("The share button is in the menu"));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await prisma.aiConversation.deleteMany({ where: { workspaceId } });
  });

  afterAll(async () => {
    if (!CONFIGURED) return;
    await prisma.workspace.deleteMany({
      where: { id: { in: [workspaceId, outsiderWorkspaceId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [mineId, theirsId] } } });
  });

  describe("who is allowed to ask", () => {
    it("refuses somebody with no session", async () => {
      session.user = null;
      const response = await post({ workspaceSlug: TAG, message: "hi", modelId: CHAT_MODEL });
      expect(response.status).toBe(401);
    });

    /*
     * A workspace the caller is not in answers exactly as one that does not
     * exist — the same rule every other read in this application follows, and
     * the reason it is 404 rather than 403.
     */
    it("answers 404 for a workspace the caller is not a member of", async () => {
      const response = await post({
        workspaceSlug: `${TAG}-outsider`,
        message: "hi",
        modelId: CHAT_MODEL,
      });
      expect(response.status).toBe(404);
    });

    it("answers 404 for a workspace that does not exist", async () => {
      const response = await post({
        workspaceSlug: "no-such-workspace",
        message: "hi",
        modelId: CHAT_MODEL,
      });
      expect(response.status).toBe(404);
    });

    it("refuses somebody else's conversation, and does not write to it", async () => {
      const theirs = await prisma.aiConversation.create({
        data: { workspaceId, userId: theirsId, title: "Theirs" },
        select: { id: true },
      });

      const response = await post({
        workspaceSlug: TAG,
        conversationId: theirs.id,
        message: "let me in",
        modelId: CHAT_MODEL,
      });

      expect(response.status).toBe(404);
      // The message must not have been written on the way to being refused.
      expect(await prisma.aiMessage.count({ where: { conversationId: theirs.id } })).toBe(0);
    });
  });

  describe("what it refuses to read", () => {
    it("answers 400 for a body it cannot parse", async () => {
      const response = await POST(
        new NextRequest("http://localhost:3000/api/ai/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "not json",
        }),
      );
      expect(response.status).toBe(400);
    });

    it("answers 400 for an empty message and for one that is too long", async () => {
      expect(
        (await post({ workspaceSlug: TAG, message: "   ", modelId: CHAT_MODEL })).status,
      ).toBe(400);
      expect(
        (await post({ workspaceSlug: TAG, message: "x".repeat(8001), modelId: CHAT_MODEL }))
          .status,
      ).toBe(400);
    });

    it("answers 400 for a model it does not know", async () => {
      const response = await post({
        workspaceSlug: TAG,
        message: "hi",
        modelId: "gpt-4-turbo",
      });
      expect(response.status).toBe(400);
    });

    /*
     * Nothing may be written on a rejected request. A conversation created
     * before the model was checked would leave an empty thread in the sidebar
     * for every typo.
     */
    it("writes nothing when it refuses", async () => {
      await post({ workspaceSlug: TAG, message: "hi", modelId: "gpt-4-turbo" });
      expect(await prisma.aiConversation.count({ where: { workspaceId } })).toBe(0);
    });
  });

  describe("what it costs", () => {
    /*
     * The limit is checked before anything is spent, and before the body is
     * even read — this is the first endpoint in the application where a request
     * costs money rather than database time, so a runaway client loop is a bill.
     */
    it("stops answering once the allowance is gone", async () => {
      for (let i = 0; i < AI_LIMIT.limit; i += 1) {
        const ok = await post({ workspaceSlug: TAG, message: `q${i}`, modelId: CHAT_MODEL });
        await readAll(ok);
      }

      const refused = await post({ workspaceSlug: TAG, message: "one more", modelId: CHAT_MODEL });
      expect(refused.status).toBe(429);
      expect(refused.headers.get("Retry-After")).toBeTruthy();
    });

    it("charges the person, not the conversation", async () => {
      // Two conversations, one allowance: a limit keyed on anything narrower
      // than the caller is stepped around by starting a new chat.
      for (let i = 0; i < AI_LIMIT.limit; i += 1) {
        await readAll(await post({ workspaceSlug: TAG, message: `q${i}`, modelId: CHAT_MODEL }));
      }

      const fresh = await post({ workspaceSlug: TAG, message: "new chat", modelId: CHAT_MODEL });
      expect(fresh.status).toBe(429);
    });
  });

  describe("what it writes", () => {
    it("starts a conversation, titles it from the question, and keeps both turns", async () => {
      const response = await post({
        workspaceSlug: TAG,
        message: "How do I share a board?",
        modelId: CHAT_MODEL,
      });

      expect(response.status).toBe(200);
      const conversationId = response.headers.get("x-conversation-id");
      expect(conversationId).toBeTruthy();

      const answer = await readAll(response);
      expect(answer).toContain("share button");

      const conversation = await prisma.aiConversation.findUnique({
        where: { id: conversationId! },
        select: {
          title: true,
          userId: true,
          messages: { orderBy: { createdAt: "asc" }, select: { role: true, model: true } },
        },
      });

      expect(conversation?.title).toBe("How do I share a board?");
      expect(conversation?.userId).toBe(mineId);
      expect(conversation?.messages.map((m) => m.role)).toEqual([
        AiRole.USER,
        AiRole.ASSISTANT,
      ]);
      // The model is recorded on the row that it wrote, not on the conversation:
      // the picker can change mid-thread.
      expect(conversation?.messages[1].model).toBe(CHAT_MODEL);
      expect(conversation?.messages[0].model).toBeNull();
    });

    it("continues an existing conversation rather than starting another", async () => {
      const first = await post({ workspaceSlug: TAG, message: "first", modelId: CHAT_MODEL });
      const conversationId = first.headers.get("x-conversation-id")!;
      await readAll(first);

      const second = await post({
        workspaceSlug: TAG,
        conversationId,
        message: "second",
        modelId: CHAT_MODEL,
      });
      expect(second.headers.get("x-conversation-id")).toBe(conversationId);
      await readAll(second);

      expect(await prisma.aiConversation.count({ where: { workspaceId } })).toBe(1);
      expect(await prisma.aiMessage.count({ where: { conversationId } })).toBe(4);
    });

    it("sends the whole thread back, not only the newest question", async () => {
      const bodies: string[] = [];
      vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
        bodies.push(String(init.body));
        return geminiSaying("ok");
      });

      const first = await post({ workspaceSlug: TAG, message: "remember apples", modelId: CHAT_MODEL });
      const conversationId = first.headers.get("x-conversation-id")!;
      await readAll(first);

      await readAll(
        await post({
          workspaceSlug: TAG,
          conversationId,
          message: "what did I say?",
          modelId: CHAT_MODEL,
        }),
      );

      // The second request has to carry the first exchange, or the assistant
      // has no memory and every answer starts from nothing.
      expect(bodies[1]).toContain("remember apples");
      expect(bodies[1]).toContain("what did I say?");
    });
  });

  describe("the headers a stream needs", () => {
    it("declines to be cached and declines to be buffered", async () => {
      const response = await post({ workspaceSlug: TAG, message: "hi", modelId: CHAT_MODEL });

      expect(response.headers.get("cache-control")).toContain("no-store");
      // Nginx buffers a proxied response by default, which would hold the whole
      // answer back and deliver it in one lump — the exact thing streaming is
      // for, undone by a default nobody in the application can see.
      expect(response.headers.get("x-accel-buffering")).toBe("no");
      await readAll(response);
    });
  });

  describe("when the provider fails mid-answer", () => {
    /*
     * The reader has already seen part of an answer, so there is no status code
     * left to send. A stream that simply stops looks like the model having
     * nothing more to say — so the failure is written into the text they are
     * reading, and kept, so the transcript does not lie about what happened.
     */
    it("says so in the answer and keeps what arrived", async () => {
      vi.stubGlobal("fetch", async () =>
        new Response("nope", { status: 500, statusText: "Server Error" }),
      );

      const response = await post({ workspaceSlug: TAG, message: "hi", modelId: CHAT_MODEL });
      const answer = await readAll(response);

      expect(answer).toMatch(/stopped early|refused the request/i);

      const saved = await prisma.aiMessage.findFirst({
        where: { role: AiRole.ASSISTANT, conversation: { workspaceId } },
        select: { content: true },
      });
      expect(saved?.content).toMatch(/stopped early|refused the request/i);
    });
  });
});
