import { InvitationStatus } from "@prisma/client";
import type { Metadata } from "next";

import { InviteMemberDialog } from "@/components/members/invite-member-dialog";
import { MembersTable } from "@/components/members/members-table";
import { PendingInvitations } from "@/components/members/pending-invitations";
import { PageHeader } from "@/components/shared/page-header";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkspaceMembers } from "@/lib/queries";

export const metadata: Metadata = { title: "Thành viên" };

export default async function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, user, can } = await requireWorkspace(slug);

  const canManage = can("workspace:manage_members");

  const [members, invitations, taskCounts] = await Promise.all([
    getWorkspaceMembers(workspace.id),
    canManage
      ? prisma.invitation.findMany({
          where: { workspaceId: workspace.id, status: InvitationStatus.PENDING },
          orderBy: { createdAt: "desc" },
          include: { invitedBy: { select: { name: true } } },
        })
      : Promise.resolve([]),
    // Open workload per member, so admins can see who is loaded before assigning.
    prisma.task.groupBy({
      by: ["assigneeId"],
      where: {
        project: { workspaceId: workspace.id },
        status: { notIn: ["DONE", "CANCELLED"] },
        assigneeId: { not: null },
      },
      _count: { _all: true },
    }),
  ]);

  const openTasksByUser = new Map(
    taskCounts.map((t) => [t.assigneeId as string, t._count._all]),
  );

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Thành viên"
        description={`${members.length} người trong ${workspace.name}`}
        actions={
          canManage ? (
            <InviteMemberDialog workspaceId={workspace.id} currentUserRole={
              members.find((m) => m.id === user.id)?.role ?? "MEMBER"
            } />
          ) : null
        }
      />

      <div className="space-y-6 px-4 py-6 sm:px-6">
        {canManage && invitations.length > 0 ? (
          <PendingInvitations
            invitations={invitations.map((i) => ({
              id: i.id,
              email: i.email,
              role: i.role,
              token: i.token,
              invitedBy: i.invitedBy.name,
              expiresAt: i.expiresAt.toISOString(),
              createdAt: i.createdAt.toISOString(),
            }))}
          />
        ) : null}

        <MembersTable
          workspaceId={workspace.id}
          ownerId={workspace.ownerId}
          currentUserId={user.id}
          canManage={canManage}
          members={members.map((m) => ({
            id: m.id,
            memberId: m.memberId,
            name: m.name,
            email: m.email,
            imageUrl: m.imageUrl,
            role: m.role,
            joinedAt: m.joinedAt.toISOString(),
            openTasks: openTasksByUser.get(m.id) ?? 0,
          }))}
        />
      </div>
    </div>
  );
}
