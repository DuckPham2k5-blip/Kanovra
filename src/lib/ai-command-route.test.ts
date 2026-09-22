import { NextRequest } from "next/server";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The assistant *doing* what it was told, against a real database.
 *
 * "tạo project tên Duc" must create a real project through the same guarded
 * action New project uses — so this posts the command and then reads the row
 * back, the only proof that the write happened rather than the reply merely
 * claiming it did. The session is the one double (Clerk cannot exist outside a
 * request); `getMembership` still runs against the real database, so the
 * permission check is exercised, not skipped.
 */

const session = vi.hoisted(() => ({ user: null as { id: string } | null }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => session.user,
  requireUser: async () => {
    if (!session.user) throw new Error("Not signed in");
    return session.user;
  },
  getMembership: async (userId: string, workspaceId: string) => {
    const { prisma } = await import("@/lib/prisma");
    return prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
  },
  ForbiddenError: class ForbiddenError extends Error {},
}));

const { prisma } = await import("@/lib/prisma");
const { resetRateLimits } = await import("@/lib/rate-limit");
const { POST } = await import("@/app/api/ai/chat/route");

const CONFIGURED = !!process.env.DATABASE_URL;
const BUILTIN = "kanovra-guide";

let userId = "";
let workspaceId = "";
let slug = "";
let n = 0;

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost:3000/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe.skipIf(!CONFIGURED)("POST /api/ai/chat — create commands", () => {
  beforeAll(async () => {
    const u = await prisma.user.create({
      data: {
        clerkId: `ai-cmd-${Date.now().toString(36)}`,
        email: `ai-cmd-${Date.now().toString(36)}@example.test`,
        name: "Cmd",
      },
    });
    userId = u.id;
  });

  // A fresh workspace per test, deleted whole afterwards so its projects, maps
  // and conversations go with it.
  beforeEach(async () => {
    n += 1;
    slug = `ai-cmd-${Date.now().toString(36)}-${n}`;
    const ws = await prisma.workspace.create({ data: { name: "Cmd", slug, ownerId: userId } });
    workspaceId = ws.id;
    await prisma.workspaceMember.create({ data: { workspaceId, userId, role: "OWNER" } });
    session.user = { id: userId };
    resetRateLimits();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  });

  afterAll(async () => {
    if (!CONFIGURED) return;
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("creates a real project from a chat command and answers with its link", async () => {
    const response = await post({
      workspaceSlug: slug,
      message: "tạo cho tôi một project có tên là Duc đi",
      modelId: BUILTIN,
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { kind: string; link: string | null };
    expect(data.kind).toBe("action");
    expect(data.link).toMatch(/\/projects\/.+\/board$/);

    const project = await prisma.project.findFirst({ where: { workspaceId, name: "Duc" } });
    expect(project).not.toBeNull();
  });

  it("creates the map kind and title it was asked for", async () => {
    const response = await post({
      workspaceSlug: slug,
      message: "tạo map circle tên Quy trình",
      modelId: BUILTIN,
    });

    const data = (await response.json()) as { link: string | null };
    expect(data.link).toMatch(/\/maps\//);

    const map = await prisma.mindMap.findFirst({ where: { workspaceId, title: "Quy trình" } });
    expect(map?.type).toBe("CIRCLE");
  });

  it("answers a question without creating anything", async () => {
    const response = await post({
      workspaceSlug: slug,
      message: "làm sao để tạo project?",
      modelId: BUILTIN,
    });

    // A question is not a command: it falls through to the built-in answer,
    // which is a text stream, and writes no project.
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await prisma.project.count({ where: { workspaceId } })).toBe(0);
  });

  it("draws a picture when asked for an image of a map, not the create-map apology", async () => {
    // The image service is stubbed — the point is that "an image of a mind map"
    // is drawn, not grabbed by the create-map parser and refused.
    const fake = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 20, g: 30, b: 40 } },
    })
      .jpeg()
      .toBuffer();
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(new Uint8Array(fake), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
    );

    const response = await post({
      workspaceSlug: slug,
      message: "hãy tạo cho tôi một ảnh về 1 mindmap bất kỳ",
      modelId: "kanovra-image",
    });

    const data = (await response.json()) as { kind: string };
    expect(data.kind).toBe("image");
    // and no map was created in the app
    expect(await prisma.mindMap.count({ where: { workspaceId } })).toBe(0);
  });

  it("answers a question in image mode as text instead of drawing it", async () => {
    // The image model turns everything into a picture; a plain question must be
    // answered, not drawn. No network is touched — it falls to the built-in text
    // stream — so this needs no image-service stub.
    const response = await post({
      workspaceSlug: slug,
      message: "giải thích cho tôi ý nghĩa của logo này",
      modelId: "kanovra-image",
    });

    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(response.headers.get("content-type")).not.toContain("application/json");
  });

  it("apologises for a map kind that does not exist, and creates nothing", async () => {
    const response = await post({
      workspaceSlug: slug,
      message: "tạo map spider tên Gì Đó",
      modelId: BUILTIN,
    });

    const data = (await response.json()) as { link: string | null; reply: string };
    expect(data.link).toBeNull();
    expect(data.reply).toMatch(/Circle|Bubble/);
    expect(await prisma.mindMap.count({ where: { workspaceId } })).toBe(0);
  });
});
