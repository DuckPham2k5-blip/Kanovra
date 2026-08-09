import type { Metadata } from "next";

import { MonthCalendar } from "@/components/calendar/month-calendar";
import { TaskDetailSheet } from "@/components/task/task-detail-sheet";
import { monthRangeFromKey, resolveMonth } from "@/lib/date";
import { loadProjectView } from "@/lib/project-view";
import { getTasksInRange } from "@/lib/queries";

export const metadata: Metadata = { title: "Project calendar" };

export default async function ProjectCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; projectId: string }>;
  searchParams: Promise<{ task?: string; month?: string }>;
}) {
  const { slug, projectId } = await params;
  const { task: openTaskId, month: monthParam } = await searchParams;

  const { project, members, labels, openTask, user, can, workspace } = await loadProjectView(
    slug,
    projectId,
    openTaskId,
  );

  const month = resolveMonth(monthParam);
  const { from, to } = monthRangeFromKey(month);
  const tasks = await getTasksInRange(workspace.id, from, to, { projectId: project.id });

  return (
    <div className="h-full overflow-y-auto">
      <MonthCalendar
        month={month}
        showProject={false}
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
