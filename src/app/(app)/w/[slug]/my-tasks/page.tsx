import { AlertTriangle, CheckCircle2, ListChecks, Timer } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { TaskDetailSheet } from "@/components/task/task-detail-sheet";
import { TaskList, type ListTask } from "@/components/task/task-list";
import { requireWorkspace } from "@/lib/auth";
import { toTaskDetailDTO } from "@/lib/dto";
import { prisma } from "@/lib/prisma";
import { getMyTasks, getTaskDetail, getWorkspaceMembers } from "@/lib/queries";
import type { LabelDTO, MemberDTO } from "@/types";

export const metadata: Metadata = { title: "Việc của tôi" };

export default async function MyTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ task?: string }>;
}) {
  const { slug } = await params;
  const { task: openTaskId } = await searchParams;
  const { user, workspace, can } = await requireWorkspace(slug);

  const [tasks, rawMembers, rawLabels] = await Promise.all([
    getMyTasks(workspace.id, user.id),
    getWorkspaceMembers(workspace.id),
    prisma.label.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" } }),
  ]);

  const members: MemberDTO[] = rawMembers.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    imageUrl: m.imageUrl,
    role: m.role,
    memberId: m.memberId,
  }));
  const labels: LabelDTO[] = rawLabels.map((l) => ({ id: l.id, name: l.name, color: l.color }));

  const listTasks: ListTask[] = tasks.map((task) => ({
    id: task.id,
    number: task.number,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    order: task.order,
    columnId: task.columnId,
    dueDate: task.dueDate?.toISOString() ?? null,
    startDate: task.startDate?.toISOString() ?? null,
    estimate: task.estimate,
    completedAt: task.completedAt?.toISOString() ?? null,
    assignee: { id: user.id, name: user.name, email: user.email, imageUrl: user.imageUrl },
    labels: task.labels.map((l) => ({
      id: l.label.id,
      name: l.label.name,
      color: l.label.color,
    })),
    checklistTotal: task.checklistItems.length,
    checklistDone: task.checklistItems.filter((c) => c.done).length,
    subtaskCount: task._count.subtasks,
    commentCount: task._count.comments,
    attachmentCount: 0,
    project: task.project,
  }));

  const now = new Date();
  const done = listTasks.filter((t) => t.status === "DONE").length;
  const inProgress = listTasks.filter((t) => t.status === "IN_PROGRESS").length;
  const overdue = listTasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < now && t.status !== "DONE",
  ).length;

  // The open task can live in any project of this workspace.
  const detail = openTaskId ? await getTaskDetail(openTaskId) : null;
  const openTask =
    detail && detail.project.workspaceId === workspace.id ? toTaskDetailDTO(detail) : null;

  return (
    <div>
      <PageHeader
        title="Việc của tôi"
        description="Mọi công việc đang được giao cho bạn trong không gian làm việc này."
      />

      <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 sm:pb-0 xl:grid-cols-4">
        <StatCard label="Tổng cộng" value={listTasks.length} icon={ListChecks} />
        <StatCard label="Đang làm" value={inProgress} icon={Timer} />
        <StatCard label="Hoàn thành" value={done} icon={CheckCircle2} tone="success" />
        <StatCard
          label="Quá hạn"
          value={overdue}
          icon={AlertTriangle}
          tone={overdue > 0 ? "danger" : "success"}
        />
      </div>

      <TaskList
        tasks={listTasks}
        members={members}
        labels={labels}
        canEdit={can("task:update")}
        showProject
        emptyHint="Chưa có công việc nào được giao cho bạn."
      />

      {openTask ? (
        <TaskDetailSheet
          task={openTask}
          members={members}
          labels={labels}
          currentUserId={user.id}
          canEdit={can("task:update")}
          canDeleteAny={can("comment:delete_any")}
          workspaceSlug={slug}
        />
      ) : null}
    </div>
  );
}
