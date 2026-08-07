"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { BoardColumn } from "@/components/board/board-column";
import { ColumnDialog } from "@/components/board/column-dialog";
import { TaskCardContent } from "@/components/board/task-card";
import { TaskDialog } from "@/components/task/task-dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteColumn, reorderColumns } from "@/server/actions/column";
import { moveTask } from "@/server/actions/task";
import type { ColumnDTO, LabelDTO, MemberDTO, TaskCardDTO } from "@/types";

type Grouped = Record<string, TaskCardDTO[]>;

/** Buckets tasks by column, preserving the server's `order` sequence. */
function group(columns: ColumnDTO[], tasks: TaskCardDTO[]): Grouped {
  const result: Grouped = {};
  for (const column of columns) result[column.id] = [];
  for (const task of tasks) {
    const key = task.columnId && result[task.columnId] ? task.columnId : columns[0]?.id;
    if (key) result[key].push(task);
  }
  return result;
}

export function KanbanBoard({
  projectId,
  projectKey,
  initialColumns,
  initialTasks,
  members,
  labels,
  canEdit,
  canManageColumns,
  onOpenTask,
}: {
  projectId: string;
  projectKey: string;
  initialColumns: ColumnDTO[];
  initialTasks: TaskCardDTO[];
  members: MemberDTO[];
  labels: LabelDTO[];
  canEdit: boolean;
  canManageColumns: boolean;
  onOpenTask: (taskId: string) => void;
}) {
  const router = useRouter();
  const [columns, setColumns] = React.useState(initialColumns);
  const [grouped, setGrouped] = React.useState<Grouped>(() => group(initialColumns, initialTasks));

  const [activeTask, setActiveTask] = React.useState<TaskCardDTO | null>(null);
  const [activeColumn, setActiveColumn] = React.useState<ColumnDTO | null>(null);

  const [taskDialog, setTaskDialog] = React.useState<{ open: boolean; columnId?: string }>({
    open: false,
  });
  const [columnDialog, setColumnDialog] = React.useState<{ open: boolean; column?: ColumnDTO | null }>(
    { open: false },
  );
  const [columnToDelete, setColumnToDelete] = React.useState<ColumnDTO | null>(null);

  // Re-sync whenever the server sends fresh data (router.refresh, navigation…).
  React.useEffect(() => {
    setColumns(initialColumns);
    setGrouped(group(initialColumns, initialTasks));
  }, [initialColumns, initialTasks]);

  const sensors = useSensors(
    // A small distance threshold keeps plain clicks (open the card) working.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // dnd-kit re-runs internal effects whenever `modifiers` gets a new array
  // reference, so this must be memoized — an inline array literal here would
  // recreate on every render and, while a column drag is active, spiral into
  // a render loop.
  const modifiers = React.useMemo(
    () => (activeColumn ? [restrictToHorizontalAxis] : undefined),
    [activeColumn],
  );

  function columnIdOfTask(taskId: string): string | undefined {
    return Object.keys(grouped).find((columnId) =>
      grouped[columnId].some((task) => task.id === taskId),
    );
  }

  /** Maps whatever is under the cursor to the column it belongs to. */
  function resolveColumnId(overId: string, overData?: Record<string, unknown>): string | undefined {
    if (overData?.type === "column-drop") return overData.columnId as string;
    if (overData?.type === "column") return overId;
    if (grouped[overId]) return overId;
    return columnIdOfTask(overId);
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.type === "task") setActiveTask(data.task as TaskCardDTO);
    if (data?.type === "column") setActiveColumn(data.column as ColumnDTO);
    document.body.classList.add("dragging");
  }

  /** Live preview: cards hop between columns while the pointer is still down. */
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.data.current?.type !== "task") return;

    const activeId = String(active.id);
    const fromColumn = columnIdOfTask(activeId);
    const toColumn = resolveColumnId(String(over.id), over.data.current ?? undefined);
    if (!fromColumn || !toColumn || fromColumn === toColumn) return;

    setGrouped((prev) => {
      const source = [...prev[fromColumn]];
      const index = source.findIndex((t) => t.id === activeId);
      if (index === -1) return prev;

      const [moved] = source.splice(index, 1);
      const destination = [...(prev[toColumn] ?? [])];

      const overIsTask = over.data.current?.type === "task";
      const overIndex = overIsTask ? destination.findIndex((t) => t.id === String(over.id)) : -1;
      const insertAt = overIndex >= 0 ? overIndex : destination.length;

      destination.splice(insertAt, 0, { ...moved, columnId: toColumn });
      return { ...prev, [fromColumn]: source, [toColumn]: destination };
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    document.body.classList.remove("dragging");
    setActiveTask(null);
    setActiveColumn(null);
    if (!over) return;

    // --- Column reorder -----------------------------------------------------
    if (active.data.current?.type === "column") {
      // The drop point often lands on the column's inner task-list droppable
      // rather than the column itself — resolve it back to the owning column.
      const overColumnId = resolveColumnId(String(over.id), over.data.current ?? undefined);
      const oldIndex = columns.findIndex((c) => c.id === active.id);
      const newIndex = columns.findIndex((c) => c.id === overColumnId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const previous = columns;
      const next = arrayMove(columns, oldIndex, newIndex);
      setColumns(next);

      const result = await reorderColumns({
        projectId,
        orderedIds: next.map((c) => c.id),
      });
      if (!result.success) {
        setColumns(previous);
        toast.error(result.error);
      }
      return;
    }

    // --- Task move ----------------------------------------------------------
    if (active.data.current?.type !== "task") return;

    const activeId = String(active.id);
    const toColumn = resolveColumnId(String(over.id), over.data.current ?? undefined);
    if (!toColumn) return;

    let finalIndex = 0;

    setGrouped((prev) => {
      const list = [...(prev[toColumn] ?? [])];
      const currentIndex = list.findIndex((t) => t.id === activeId);
      if (currentIndex === -1) {
        finalIndex = list.length;
        return prev;
      }

      const overIsTask = over.data.current?.type === "task";
      const overIndex = overIsTask ? list.findIndex((t) => t.id === String(over.id)) : -1;
      const targetIndex = overIndex >= 0 ? overIndex : list.length - 1;

      const reordered = arrayMove(list, currentIndex, targetIndex);
      finalIndex = reordered.findIndex((t) => t.id === activeId);
      return { ...prev, [toColumn]: reordered };
    });

    const column = columns.find((c) => c.id === toColumn);
    const result = await moveTask({ taskId: activeId, toColumnId: toColumn, toIndex: finalIndex });

    if (!result.success) {
      toast.error(result.error);
      setGrouped(group(initialColumns, initialTasks));
      return;
    }

    if (column && column.status === "DONE") toast.success("Đã đánh dấu hoàn thành 🎉");
    router.refresh();
  }

  function handleDragCancel() {
    document.body.classList.remove("dragging");
    setActiveTask(null);
    setActiveColumn(null);
    setGrouped(group(initialColumns, initialTasks));
  }

  async function confirmDeleteColumn() {
    if (!columnToDelete) return;
    const result = await deleteColumn(columnToDelete.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Đã xoá cột. Các thẻ được chuyển sang cột đầu tiên.");
    setColumnToDelete(null);
    router.refresh();
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        modifiers={modifiers}
      >
        <div className="tf-scroll-x flex h-full gap-4 px-4 pb-4 sm:px-6">
          <SortableContext
            items={columns.map((c) => c.id)}
            strategy={horizontalListSortingStrategy}
          >
            {columns.map((column) => (
              <BoardColumn
                key={column.id}
                column={column}
                tasks={grouped[column.id] ?? []}
                projectKey={projectKey}
                canEdit={canEdit}
                onOpenTask={onOpenTask}
                onAddTask={(columnId) => setTaskDialog({ open: true, columnId })}
                onEditColumn={(c) => setColumnDialog({ open: true, column: c })}
                onDeleteColumn={setColumnToDelete}
              />
            ))}
          </SortableContext>

          {canManageColumns ? (
            <div className="w-[19rem] shrink-0">
              <Button
                variant="outline"
                className="h-11 w-full border-dashed"
                onClick={() => setColumnDialog({ open: true, column: null })}
              >
                <Plus className="size-4" /> Thêm cột
              </Button>
            </div>
          ) : null}
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
          {activeTask ? (
            <TaskCardContent task={activeTask} projectKey={projectKey} className="tf-dragging w-[17rem]" />
          ) : null}
          {activeColumn ? (
            <div className="tf-dragging w-[19rem] rounded-xl border bg-muted/80 p-3">
              <p className="text-sm font-semibold">{activeColumn.name}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <TaskDialog
        open={taskDialog.open}
        onOpenChange={(open) => setTaskDialog({ open, columnId: taskDialog.columnId })}
        projectId={projectId}
        columnId={taskDialog.columnId}
        members={members}
        labels={labels}
      />

      <ColumnDialog
        open={columnDialog.open}
        onOpenChange={(open) => setColumnDialog({ open, column: columnDialog.column })}
        projectId={projectId}
        column={columnDialog.column}
      />

      <ConfirmDialog
        open={Boolean(columnToDelete)}
        onOpenChange={(open) => !open && setColumnToDelete(null)}
        title={`Xoá cột "${columnToDelete?.name}"?`}
        description="Các công việc trong cột sẽ được chuyển sang cột đầu tiên của bảng, không bị xoá."
        confirmLabel="Xoá cột"
        destructive
        onConfirm={confirmDeleteColumn}
      />
    </>
  );
}
