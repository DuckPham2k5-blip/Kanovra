import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FolderKanban,
  ListChecks,
  Plus,
  Timer,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ProjectIcon } from "@/components/icon-picker";
import { DueBadge, PriorityBadge, ProjectStatusBadge } from "@/components/shared/badges";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { AvatarStack, UserAvatar } from "@/components/shared/user-avatar";
import { NewProjectButton } from "@/components/project/new-project-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { requireWorkspace } from "@/lib/auth";
import { fromNow } from "@/lib/date";
import {
  getMyTasks,
  getProjectSummaries,
  getRecentActivity,
  getWorkspaceStats,
} from "@/lib/queries";

export const metadata: Metadata = { title: "Tổng quan" };

export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace, can } = await requireWorkspace(slug);

  const [stats, projects, myTasks, activity] = await Promise.all([
    getWorkspaceStats(workspace.id, user.id),
    getProjectSummaries(workspace.id),
    getMyTasks(workspace.id, user.id),
    getRecentActivity(workspace.id, 12),
  ]);

  const activeProjects = projects.filter((p) => !p.archived).slice(0, 6);
  const upcoming = myTasks.filter((t) => t.status !== "DONE").slice(0, 6);
  const firstName = user.name.split(" ").slice(-1)[0];

  return (
    <div>
      <PageHeader
        title={`Chào ${firstName} 👋`}
        description={`Đây là toàn cảnh của ${workspace.name} hôm nay.`}
        actions={
          can("project:create") ? (
            <NewProjectButton workspaceId={workspace.id} workspaceSlug={slug} />
          ) : null
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Tổng công việc"
            value={stats.total}
            icon={ListChecks}
            hint={`${stats.projects} dự án · ${stats.members} thành viên`}
          />
          <StatCard
            label="Đã hoàn thành"
            value={`${stats.completionRate}%`}
            icon={CheckCircle2}
            tone="success"
            progress={stats.completionRate}
            hint={`${stats.done}/${stats.total} công việc · +${stats.completedThisWeek} tuần này`}
          />
          <StatCard
            label="Đang thực hiện"
            value={stats.inProgress}
            icon={Timer}
            hint={`${stats.mine} việc đang giao cho bạn`}
          />
          <StatCard
            label="Quá hạn"
            value={stats.overdue}
            icon={AlertTriangle}
            tone={stats.overdue > 0 ? "danger" : "success"}
            hint={`${stats.dueSoon} việc đến hạn trong 48 giờ`}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          {/* Projects */}
          <section className="space-y-3 xl:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Dự án</h2>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/w/${slug}/projects`}>
                  Tất cả <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>

            {activeProjects.length === 0 ? (
              <EmptyState
                icon={FolderKanban}
                title="Chưa có dự án nào"
                description="Tạo dự án đầu tiên để bắt đầu quản lý công việc của nhóm."
                action={
                  can("project:create") ? (
                    <NewProjectButton workspaceId={workspace.id} workspaceSlug={slug} />
                  ) : null
                }
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {activeProjects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/w/${slug}/projects/${project.id}/board`}
                    className="tf-card tf-card-hover space-y-3 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${project.color}1f` }}
                      >
                        <ProjectIcon name={project.icon} color={project.color} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{project.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {project._count.tasks} công việc · {project.doneCount} xong
                        </p>
                      </div>
                      <ProjectStatusBadge status={project.status} />
                    </div>

                    <Progress value={project.progress} />

                    <div className="flex items-center justify-between">
                      <AvatarStack
                        users={project.members.map((m) => m.user)}
                        max={3}
                        size="size-6"
                      />
                      <span className="text-xs text-muted-foreground">
                        {project.overdueCount > 0 ? (
                          <span className="text-destructive">
                            {project.overdueCount} quá hạn
                          </span>
                        ) : (
                          `${project.progress}%`
                        )}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Activity */}
          <section className="space-y-3">
            <h2 className="font-semibold">Hoạt động gần đây</h2>
            <div className="tf-card divide-y">
              {activity.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Chưa có hoạt động nào.
                </p>
              ) : (
                activity.map((item) => (
                  <div key={item.id} className="flex gap-3 p-3">
                    <UserAvatar user={item.actor} className="mt-0.5 size-7" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug">{item.message}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {fromNow(item.createdAt)}
                        {item.project ? ` · ${item.project.name}` : ""}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* My tasks */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Việc của tôi</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/w/${slug}/my-tasks`}>
                Xem tất cả <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>

          {upcoming.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Bạn đã xong hết việc 🎉"
              description="Không còn công việc nào đang chờ bạn xử lý."
            />
          ) : (
            <div className="overflow-hidden rounded-lg border">
              {upcoming.map((task, index) => (
                <Link
                  key={task.id}
                  href={`/w/${slug}/projects/${task.project.id}/board?task=${task.id}`}
                  className={`flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50 ${
                    index > 0 ? "border-t" : ""
                  }`}
                >
                  <ProjectIcon name={task.project.icon} color={task.project.color} />
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {task.project.key}-{task.number}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                  <DueBadge date={task.dueDate} />
                  <PriorityBadge priority={task.priority} iconOnly />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Team shortcut */}
        <section className="tf-card flex flex-wrap items-center gap-4 p-4">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{stats.members} thành viên trong nhóm</p>
            <p className="text-sm text-muted-foreground">
              Quản lý vai trò, mời thêm người và theo dõi khối lượng công việc.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/w/${slug}/analytics`}>
                <Clock className="size-4" /> Phân tích
              </Link>
            </Button>
            {can("workspace:manage_members") ? (
              <Button size="sm" asChild>
                <Link href={`/w/${slug}/members`}>
                  <Plus className="size-4" /> Mời thành viên
                </Link>
              </Button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
