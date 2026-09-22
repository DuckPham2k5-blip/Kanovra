import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * A JSON snapshot of everything in a workspace: its projects, their board
 * structure, and every task with its labels, assignee and subtask links.
 *
 * Gated by workspace membership, re-checked here the same way the attachments
 * route re-checks it — a URL is not access. It is scoped to the workspace a
 * member can already see in full (project reads are workspace-level, not
 * per-project), so this opens no new read path.
 *
 * What travels is an allowlist, not "everything minus a few fields": a new
 * column on Task does not silently reach this file, and no email address is on
 * it — the assignee travels as a name, which is what a member already sees.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspace: { slug } },
    select: { workspace: { select: { id: true, name: true, slug: true, description: true, createdAt: true } } },
  });
  // A workspace the caller is not in answers 404, same as a missing one — the
  // route never confirms a slug exists to someone who cannot read it.
  if (!membership) return new NextResponse("Not found", { status: 404 });

  const workspace = membership.workspace;

  const [labels, projects] = await Promise.all([
    prisma.label.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { name: "asc" },
      select: { name: true, color: true },
    }),
    prisma.project.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ archived: "asc" }, { createdAt: "asc" }],
      select: {
        name: true,
        key: true,
        description: true,
        color: true,
        icon: true,
        status: true,
        archived: true,
        startDate: true,
        dueDate: true,
        createdAt: true,
        columns: {
          orderBy: { order: "asc" },
          select: { name: true, status: true, order: true, wipLimit: true },
        },
        tasks: {
          orderBy: { number: "asc" },
          select: {
            id: true,
            number: true,
            title: true,
            description: true,
            status: true,
            priority: true,
            startDate: true,
            dueDate: true,
            completedAt: true,
            estimate: true,
            parentId: true,
            createdAt: true,
            assignee: { select: { name: true } },
            labels: { select: { label: { select: { name: true } } } },
            checklistItems: { select: { done: true } },
          },
        },
      },
    }),
  ]);

  const data = {
    format: "kanovra-workspace-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: { name: user.name },
    workspace: {
      name: workspace.name,
      slug: workspace.slug,
      description: workspace.description,
      createdAt: workspace.createdAt,
    },
    labels,
    projects: projects.map((project) => {
      // Resolve a subtask's parent to its human key within this project, so the
      // file reads without the internal ids the app never shows.
      const keyById = new Map(
        project.tasks.map((t) => [t.id, `${project.key}-${t.number}`]),
      );
      return {
        name: project.name,
        key: project.key,
        description: project.description,
        color: project.color,
        icon: project.icon,
        status: project.status,
        archived: project.archived,
        startDate: project.startDate,
        dueDate: project.dueDate,
        createdAt: project.createdAt,
        columns: project.columns,
        tasks: project.tasks.map((task) => {
          const checklistDone = task.checklistItems.filter((c) => c.done).length;
          return {
            key: `${project.key}-${task.number}`,
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            startDate: task.startDate,
            dueDate: task.dueDate,
            completedAt: task.completedAt,
            estimate: task.estimate,
            assignee: task.assignee?.name ?? null,
            labels: task.labels.map((l) => l.label.name),
            parent: task.parentId ? (keyById.get(task.parentId) ?? null) : null,
            checklist: task.checklistItems.length
              ? { done: checklistDone, total: task.checklistItems.length }
              : null,
            createdAt: task.createdAt,
          };
        }),
      };
    }),
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `kanovra-${workspace.slug}-export-${stamp}.json`;

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
