import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { LabelManager } from "@/components/workspace/label-manager";
import { WorkspaceDangerZone } from "@/components/workspace/workspace-danger-zone";
import { WorkspaceSettingsForm } from "@/components/workspace/workspace-settings-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROLE_LABEL } from "@/lib/permissions";

export const metadata: Metadata = { title: "Cài đặt" };

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { workspace, role, user, can } = await requireWorkspace(slug);

  // Viewers have nothing to configure here; send them somewhere useful.
  if (!can("workspace:view")) redirect(`/w/${slug}`);

  const [labels, memberCount, projectCount, owner] = await Promise.all([
    prisma.label.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { name: "asc" },
      include: { _count: { select: { tasks: true } } },
    }),
    prisma.workspaceMember.count({ where: { workspaceId: workspace.id } }),
    prisma.project.count({ where: { workspaceId: workspace.id } }),
    prisma.user.findUnique({
      where: { id: workspace.ownerId },
      select: { name: true, email: true },
    }),
  ]);

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Cài đặt không gian làm việc"
        description={`Bạn đang ở vai trò ${ROLE_LABEL[role]}.`}
      />

      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Thông tin chung</CardTitle>
            <CardDescription>
              Tên, mô tả và màu nhận diện hiển thị khắp ứng dụng.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WorkspaceSettingsForm
              workspace={{
                id: workspace.id,
                name: workspace.name,
                slug: workspace.slug,
                description: workspace.description,
                color: workspace.color,
              }}
              canEdit={can("workspace:update")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nhãn</CardTitle>
            <CardDescription>
              Nhãn dùng chung cho mọi dự án trong không gian làm việc này.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LabelManager
              workspaceId={workspace.id}
              labels={labels.map((l) => ({
                id: l.id,
                name: l.name,
                color: l.color,
                taskCount: l._count.tasks,
              }))}
              canManage={can("workspace:manage_labels")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tổng quan</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Định danh (slug)</dt>
                <dd className="mt-0.5 font-mono text-sm">{workspace.slug}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Chủ sở hữu</dt>
                <dd className="mt-0.5 truncate text-sm">
                  {owner?.name ?? "—"}
                  {owner?.email ? (
                    <span className="text-muted-foreground"> · {owner.email}</span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Thành viên</dt>
                <dd className="mt-0.5 text-sm">{memberCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Dự án</dt>
                <dd className="mt-0.5 text-sm">{projectCount}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <WorkspaceDangerZone
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          isOwner={workspace.ownerId === user.id}
          canDelete={can("workspace:delete")}
        />
      </div>
    </div>
  );
}
