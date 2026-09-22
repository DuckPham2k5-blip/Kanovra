import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The workspace JSON export, against a real database.
 *
 * Two things matter and both are proved by exercising the route, not by reading
 * it: it discriminates (a non-member gets the same 404 as a missing workspace,
 * so a slug is never confirmed to an outsider), and it does not leak — the
 * assignee's email is genuinely in Postgres and genuinely absent from the file,
 * exactly the property the public-board export exists to hold. The email test
 * would be meaningless against a fixture that never stored one, so it does.
 */

const session = vi.hoisted(() => ({ user: null as { id: string; name: string } | null }));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => session.user,
}));

const { prisma } = await import("@/lib/prisma");
const { GET } = await import("@/app/api/workspaces/[slug]/export/route");

const CONFIGURED = !!process.env.DATABASE_URL;
const TAG = `wsexport-test-${Date.now().toString(36)}`;
const MEMBER_EMAIL = `${TAG}-member@example.test`;

let memberId = "";
let outsiderId = "";
let workspaceId = "";
const slug = TAG;

function get(s: string) {
  return GET(new Request(`http://localhost:3000/api/workspaces/${s}/export`), {
    params: Promise.resolve({ slug: s }),
  });
}

describe.skipIf(!CONFIGURED)("workspace export route", () => {
  beforeAll(async () => {
    const member = await prisma.user.create({
      data: { clerkId: `${TAG}-m`, email: MEMBER_EMAIL, name: "Export Member" },
    });
    memberId = member.id;
    const outsider = await prisma.user.create({
      data: { clerkId: `${TAG}-o`, email: `${TAG}-out@example.test`, name: "Outsider" },
    });
    outsiderId = outsider.id;

    const workspace = await prisma.workspace.create({
      data: {
        name: "Export Fixture",
        slug,
        ownerId: member.id,
        members: { create: { userId: member.id, role: "OWNER" } },
      },
    });
    workspaceId = workspace.id;

    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: "Alpha",
        key: "EXP",
        createdById: member.id,
        taskCounter: 1,
      },
    });
    await prisma.task.create({
      data: {
        projectId: project.id,
        number: 1,
        title: "First task",
        createdById: member.id,
        assigneeId: member.id,
      },
    });
  }, 30_000);

  afterAll(async () => {
    if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    for (const id of [memberId, outsiderId]) {
      if (id) await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    await prisma.$disconnect().catch(() => {});
  });

  it("refuses an unauthenticated request", async () => {
    session.user = null;
    const res = await get(slug);
    expect(res.status).toBe(401);
  });

  it("answers 404 to a non-member, indistinguishable from a missing workspace", async () => {
    session.user = { id: outsiderId, name: "Outsider" };
    expect((await get(slug)).status).toBe(404);
    expect((await get("no-such-workspace")).status).toBe(404);
  });

  it("exports the workspace to a member, with the assignee as a name", async () => {
    session.user = { id: memberId, name: "Export Member" };
    const res = await get(slug);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");

    const body = await res.json();
    expect(body.workspace.slug).toBe(slug);
    expect(body.projects).toHaveLength(1);
    const project = body.projects[0];
    expect(project.key).toBe("EXP");
    expect(project.tasks[0].key).toBe("EXP-1");
    expect(project.tasks[0].assignee).toBe("Export Member");
  });

  it("never puts an email in the file", async () => {
    session.user = { id: memberId, name: "Export Member" };
    const res = await get(slug);
    const text = await res.text();
    expect(text).not.toContain(MEMBER_EMAIL);
    expect(text).not.toContain("@example.test");
  });
});
