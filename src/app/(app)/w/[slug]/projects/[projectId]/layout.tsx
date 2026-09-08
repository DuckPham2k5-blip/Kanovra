import { notFound } from "next/navigation";

import { ProjectHeader } from "@/components/project/project-header";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getShareLink } from "@/lib/public-board";
import { getWorkspaceMembers } from "@/lib/queries";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = await params;
  const { workspace, role, can } = await requireWorkspace(slug);

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId: workspace.id },
    include: {
      _count: { select: { tasks: true } },
      members: {
        include: { user: { select: { id: true, name: true, imageUrl: true, email: true } } },
      },
    },
  });

  if (!project) notFound();

  const workspaceMembers = await getWorkspaceMembers(workspace.id);

  /*
   * The share link is fetched only for people who may act on it. A token is a
   * password to the board, and there is no reason it should reach the browser
   * of somebody who cannot create or revoke one — a page that ships a secret it
   * only intends to hide has published it.
   */
  const canShare = can("project:share");
  const shareLink = canShare ? await getShareLink(project.id) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ProjectHeader
        workspaceSlug={slug}
        workspaceId={workspace.id}
        project={{
          id: project.id,
          name: project.name,
          key: project.key,
          description: project.description,
          color: project.color,
          icon: project.icon,
          status: project.status,
          archived: project.archived,
          startDate: project.startDate?.toISOString() ?? null,
          dueDate: project.dueDate?.toISOString() ?? null,
          taskCount: project._count.tasks,
          bannerPreset: project.bannerPreset,
          bannerImageId: project.bannerImageId,
          bannerImageUrl: project.bannerImageUrl,
          bannerPositionY: project.bannerPositionY,
        }}
        members={project.members.map((m) => ({
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
          imageUrl: m.user.imageUrl,
        }))}
        workspaceMembers={workspaceMembers.map((m) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          imageUrl: m.imageUrl,
          role: m.role,
          memberId: m.memberId,
        }))}
        role={role}
        canEditProject={can("project:update")}
        canDeleteProject={can("project:delete")}
        canShare={canShare}
        shareLink={
          shareLink
            ? {
                token: shareLink.token,
                createdAt: shareLink.createdAt.toISOString(),
                expiresAt: shareLink.expiresAt?.toISOString() ?? null,
                lastViewedAt: shareLink.lastViewedAt?.toISOString() ?? null,
                createdByName: shareLink.createdBy.name,
              }
            : null
        }
      />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
