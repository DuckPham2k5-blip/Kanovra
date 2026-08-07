import type { Metadata } from "next";

import { CalendarFilters } from "@/components/calendar/calendar-filters";
import { MonthCalendar } from "@/components/calendar/month-calendar";
import { PageHeader } from "@/components/shared/page-header";
import { TaskDetailSheet } from "@/components/task/task-detail-sheet";
import { requireWorkspace } from "@/lib/auth";
import { monthRangeFromKey, resolveMonth } from "@/lib/date";
import { toTaskDetailDTO } from "@/lib/dto";
import { prisma } from "@/lib/prisma";
import { getTaskDetail, getTasksInRange, getWorkspaceMembers } from "@/lib/queries";
import type { LabelDTO, MemberDTO } from "@/types";

export const metadata: Metadata = { title: "Lịch" };

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ month?: string; project?: string; assignee?: string; task?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const { user, workspace, can } = await requireWorkspace(slug);

  const month = resolveMonth(query.month);
  const { from, to } = monthRangeFromKey(month);

  const [tasks, projects, rawMembers, rawLabels] = await Promise.all([
    getTasksInRange(workspace.id, from, to, {
      projectId: query.project,
      assigneeId: query.assignee,
    }),
    prisma.project.findMany({
      where: { workspaceId: workspace.id, archived: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
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

  const detail = query.task ? await getTaskDetail(query.task) : null;
  const openTask =
    detail && detail.project.workspaceId === workspace.id ? toTaskDetailDTO(detail) : null;

  return (
    <div>
      <PageHeader
        title="Lịch"
        description="Toàn bộ công việc có hạn hoàn thành trong tháng."
        actions={
          <CalendarFilters
            projects={projects}
            members={members}
            projectId={query.project}
            assigneeId={query.assignee}
          />
        }
      />

      <MonthCalendar
        month={month}
        tasks={tasks.map((task) => ({
          id: task.id,
          number: task.number,
          title: task.title,
          status: task.status,
          priority: task.priority,
          dueDate: task.dueDate!.toISOString(),
          assignee: task.assignee
            ? { id: task.assignee.id, name: task.assignee.name, imageUrl: task.assignee.imageUrl }
            : null,
          project: task.project,
        }))}
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
