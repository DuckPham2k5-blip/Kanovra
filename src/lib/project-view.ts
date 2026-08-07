import "server-only";

import { notFound } from "next/navigation";

import { requireWorkspace } from "@/lib/auth";
import { toTaskDetailDTO } from "@/lib/dto";
import { prisma } from "@/lib/prisma";
import { getTaskDetail, getWorkspaceMembers } from "@/lib/queries";
import type { LabelDTO, MemberDTO } from "@/types";

/**
 * Shared loader for the three project views (board / list / calendar).
 * Resolves the workspace, asserts the project belongs to it, and pulls the
 * members, labels and optional open-task payload every view needs.
 */
export async function loadProjectView(
  slug: string,
  projectId: string,
  openTaskId?: string,
) {
  const ctx = await requireWorkspace(slug);

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId: ctx.workspace.id },
    select: { id: true, name: true, key: true, color: true, icon: true },
  });
  if (!project) notFound();

  const [rawMembers, rawLabels] = await Promise.all([
    getWorkspaceMembers(ctx.workspace.id),
    prisma.label.findMany({
      where: { workspaceId: ctx.workspace.id },
      orderBy: { name: "asc" },
    }),
  ]);

  const members: MemberDTO[] = rawMembers.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    imageUrl: m.imageUrl,
    role: m.role,
    memberId: m.memberId,
  }));

  const labels: LabelDTO[] = rawLabels.map((l) => ({
    id: l.id,
    name: l.name,
    color: l.color,
  }));

  // The open task must belong to this project — never trust the query string.
  let openTask = null;
  if (openTaskId) {
    const detail = await getTaskDetail(openTaskId);
    if (detail && detail.projectId === project.id) openTask = toTaskDetailDTO(detail);
  }

  return { ...ctx, project, members, labels, openTask };
}
