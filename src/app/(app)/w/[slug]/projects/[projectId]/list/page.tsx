import type { Metadata } from "next";

import { TaskDetailSheet } from "@/components/task/task-detail-sheet";
import { TaskList } from "@/components/task/task-list";
import { toTaskCardDTO } from "@/lib/dto";
import { loadProjectView } from "@/lib/project-view";
import { getBoardData, getProjectSubtasks } from "@/lib/queries";

export const metadata: Metadata = { title: "Task list" };

export default async function ProjectListPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; projectId: string }>;
  searchParams: Promise<{ task?: string }>;
}) {
  const { slug, projectId } = await params;
  const { task: openTaskId } = await searchParams;

  const { project, members, labels, openTask, user, can } = await loadProjectView(
    slug,
    projectId,
    openTaskId,
  );

  // Parents from the board query, their children alongside: the list folds them
  // together, and a Kanban column never shows a subtask so the board query does
  // not carry them.
  const [{ tasks }, subtasks] = await Promise.all([
    getBoardData(project.id),
    getProjectSubtasks(project.id),
  ]);

  return (
    <div className="h-full overflow-y-auto">
      <TaskList
        tasks={[...tasks, ...subtasks].map(toTaskCardDTO)}
        members={members}
        labels={labels}
        projectId={project.id}
        projectKey={project.key}
        canEdit={can("task:update")}
        emptyHint="No tasks in this project yet."
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
