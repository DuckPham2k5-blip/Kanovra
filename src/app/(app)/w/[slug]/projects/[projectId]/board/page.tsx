import type { Metadata } from "next";

import { BoardView } from "@/components/board/board-view";
import { TaskDetailSheet } from "@/components/task/task-detail-sheet";
import { toTaskCardDTO } from "@/lib/dto";
import { loadProjectView } from "@/lib/project-view";
import { getBoardData } from "@/lib/queries";
import type { ColumnDTO } from "@/types";

export const metadata: Metadata = { title: "Bảng Kanban" };

export default async function BoardPage({
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

  const { columns, tasks } = await getBoardData(project.id);

  const columnDTOs: ColumnDTO[] = columns.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    order: c.order,
    wipLimit: c.wipLimit,
    status: c.status,
  }));

  return (
    <>
      <BoardView
        projectId={project.id}
        projectKey={project.key}
        columns={columnDTOs}
        tasks={tasks.map(toTaskCardDTO)}
        members={members}
        labels={labels}
        canEdit={can("task:update")}
        canManageColumns={can("board:manage_columns")}
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
    </>
  );
}
