import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { Role, type User, type Workspace } from "@prisma/client";
import { redirect } from "next/navigation";
import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { can, type Permission } from "@/lib/permissions";

/**
 * Thrown by the guards below when an authenticated user lacks a permission.
 * Server actions convert it into a friendly `{ error }` result; pages let it
 * bubble so the nearest error boundary renders.
 */
export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Returns the local `User` row for the signed-in Clerk user, creating it on
 * first sight. The Clerk webhook is the primary sync path; this just-in-time
 * upsert covers the window before the webhook lands (and local dev without a
 * public webhook URL).
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const { userId } = await auth();
  if (!userId) return null;

  const existing = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (existing) return existing;

  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) return null;

  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    clerkUser.username ||
    email.split("@")[0];

  // `upsert` on email as well, so a seeded placeholder row gets adopted rather
  // than colliding on the unique index.
  return prisma.user.upsert({
    where: { email },
    update: { clerkId: userId, name, imageUrl: clerkUser.imageUrl },
    create: { clerkId: userId, email, name, imageUrl: clerkUser.imageUrl },
  });
});

/** Same as `getCurrentUser` but redirects to sign-in when unauthenticated. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export type WorkspaceContext = {
  user: User;
  workspace: Workspace;
  role: Role;
  can: (permission: Permission) => boolean;
};

/**
 * Loads the workspace by slug and asserts membership. Redirects to onboarding
 * when the user is not a member — we deliberately do not leak whether the
 * workspace exists.
 */
export const requireWorkspace = cache(
  async (slug: string): Promise<WorkspaceContext> => {
    const user = await requireUser();

    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: user.id, workspace: { slug } },
      include: { workspace: true },
    });

    if (!membership) redirect("/onboarding");

    return {
      user,
      workspace: membership.workspace,
      role: membership.role,
      can: (permission: Permission) => can(membership.role, permission),
    };
  },
);

/** Workspace context + permission assertion in one call. */
export async function requirePermission(slug: string, permission: Permission) {
  const ctx = await requireWorkspace(slug);
  if (!ctx.can(permission)) throw new ForbiddenError();
  return ctx;
}

/**
 * Membership lookup used by server actions, which receive ids rather than
 * slugs. Returns `null` instead of redirecting so actions can respond with a
 * structured error.
 */
export async function getMembership(userId: string, workspaceId: string) {
  return prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
}

/** Resolves the workspace that owns a project, together with the caller's role. */
export async function getProjectContext(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { workspace: true },
  });
  if (!project) return null;

  const membership = await getMembership(userId, project.workspaceId);
  if (!membership) return null;

  return { project, workspace: project.workspace, role: membership.role };
}

/** Resolves the project + workspace that own a task. */
export async function getTaskContext(userId: string, taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { include: { workspace: true } } },
  });
  if (!task) return null;

  const membership = await getMembership(userId, task.project.workspaceId);
  if (!membership) return null;

  return {
    task,
    project: task.project,
    workspace: task.project.workspace,
    role: membership.role,
  };
}

/** All workspaces the user belongs to, most recently active first. */
export const getUserWorkspaces = cache(async (userId: string) => {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: {
        include: { _count: { select: { members: true, projects: true } } },
      },
    },
    orderBy: { joinedAt: "asc" },
  });
  return memberships.map((m) => ({ ...m.workspace, role: m.role }));
});
