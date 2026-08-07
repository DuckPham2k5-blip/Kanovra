"use client";

import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { KanbanBoard } from "@/components/board/kanban-board";
import type { ColumnDTO, LabelDTO, MemberDTO, TaskCardDTO } from "@/types";

/**
 * Thin client wrapper: turns "open a card" into a `?task=<id>` navigation so the
 * detail panel is rendered from fresh server data and the URL stays shareable.
 */
export function BoardView({
  projectId,
  projectKey,
  columns,
  tasks,
  members,
  labels,
  canEdit,
  canManageColumns,
}: {
  projectId: string;
  projectKey: string;
  columns: ColumnDTO[];
  tasks: TaskCardDTO[];
  members: MemberDTO[];
  labels: LabelDTO[];
  canEdit: boolean;
  canManageColumns: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const openTask = React.useCallback(
    (taskId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("task", taskId);
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <div className="h-full min-h-0 pt-4">
      <KanbanBoard
        projectId={projectId}
        projectKey={projectKey}
        initialColumns={columns}
        initialTasks={tasks}
        members={members}
        labels={labels}
        canEdit={canEdit}
        canManageColumns={canManageColumns}
        onOpenTask={openTask}
      />
    </div>
  );
}
