import { Archive, FolderKanban } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ProjectIcon } from "@/components/icon-picker";
import { NewProjectButton } from "@/components/project/new-project-button";
import { ProjectStatusBadge } from "@/components/shared/badges";
import { PageHeader } from "@/components/shared/page-header";
import { AvatarStack } from "@/components/shared/user-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { requireWorkspace } from "@/lib/auth";
import { formatDate } from "@/lib/date";
import { getProjectSummaries } from "@/lib/queries";

export const metadata: Metadata = { title: "Dự án" };

export default async function ProjectsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, can } = await requireWorkspace(slug);

  const projects = await getProjectSummaries(workspace.id);
  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  return (
    <div>
      <PageHeader
        title="Dự án"
        description={`${active.length} dự án đang hoạt động trong ${workspace.name}`}
        actions={
          can("project:create") ? (
            <NewProjectButton workspaceId={workspace.id} workspaceSlug={slug} />
          ) : null
        }
      />

      <div className="space-y-8 p-4 sm:p-6">
        {active.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="Chưa có dự án nào"
            description="Dự án là nơi chứa bảng Kanban, công việc và tiến độ của nhóm."
            action={
              can("project:create") ? (
                <NewProjectButton
                  workspaceId={workspace.id}
                  workspaceSlug={slug}
                  label="Tạo dự án đầu tiên"
                />
              ) : null
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {active.map((project) => (
              <Link
                key={project.id}
                href={`/w/${slug}/projects/${project.id}/board`}
                className="tf-card tf-card-hover flex flex-col gap-3 p-5"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${project.color}1f` }}
                  >
                    <ProjectIcon name={project.icon} color={project.color} className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{project.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{project.key}</p>
                  </div>
                  <ProjectStatusBadge status={project.status} />
                </div>

                <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
                  {project.description || "Chưa có mô tả."}
                </p>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {project.doneCount}/{project._count.tasks} hoàn thành
                    </span>
                    <span className="font-medium">{project.progress}%</span>
                  </div>
                  <Progress value={project.progress} />
                </div>

                <div className="mt-auto flex items-center justify-between border-t pt-3">
                  <AvatarStack users={project.members.map((m) => m.user)} max={4} size="size-6" />
                  <span className="text-xs text-muted-foreground">
                    {project.overdueCount > 0 ? (
                      <span className="text-destructive">{project.overdueCount} quá hạn</span>
                    ) : project.dueDate ? (
                      `Hạn ${formatDate(project.dueDate, "dd/MM")}`
                    ) : (
                      `${project._count.members} thành viên`
                    )}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {archived.length > 0 ? (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Archive className="size-4" /> Đã lưu trữ ({archived.length})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {archived.map((project) => (
                <Link
                  key={project.id}
                  href={`/w/${slug}/projects/${project.id}/board`}
                  className="flex items-center gap-3 rounded-lg border border-dashed p-3 opacity-70 transition-opacity hover:opacity-100"
                >
                  <ProjectIcon name={project.icon} color={project.color} />
                  <span className="min-w-0 flex-1 truncate text-sm">{project.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {project._count.tasks} việc
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
