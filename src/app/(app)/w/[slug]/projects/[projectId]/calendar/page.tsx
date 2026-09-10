import type { Metadata } from "next";

import { CalendarBoard } from "@/components/calendar/calendar-board";
import { TaskDetailSheet } from "@/components/task/task-detail-sheet";
import { rangeFor, resolveAnchor, resolveView } from "@/lib/calendar-view";
import { loadProjectView } from "@/lib/project-view";
import { getTasksInRange } from "@/lib/queries";

export const metadata: Metadata = { title: "Project calendar" };

export default async function ProjectCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; projectId: string }>;
  searchParams: Promise<{ task?: string; view?: string; date?: string }>;
}) {
  const { slug, projectId } = await params;
  const { task: openTaskId, view: viewParam, date: dateParam } = await searchParams;

  const { project, members, labels, openTask, user, can, workspace } = await loadProjectView(
    slug,
    projectId,
    openTaskId,
  );

  const view = resolveView(viewParam);
  const anchor = resolveAnchor(dateParam);
  const { from, to } = rangeFor(view, anchor);
  const tasks = await getTasksInRange(workspace.id, from, to, { projectId: project.id });

  return (
    <div className="h-full overflow-y-auto">
      <CalendarBoard
        view={view}
        anchor={dateParam ?? ""}
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
