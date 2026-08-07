"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { SortableTaskCard } from "@/components/board/task-card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ColumnDTO, TaskCardDTO } from "@/types";

export function BoardColumn({
  column,
  tasks,
  projectKey,
  canEdit,
  onOpenTask,
  onAddTask,
  onEditColumn,
  onDeleteColumn,
}: {
  column: ColumnDTO;
  tasks: TaskCardDTO[];
  projectKey: string;
  canEdit: boolean;
  onOpenTask: (taskId: string) => void;
  onAddTask: (columnId: string) => void;
  onEditColumn: (column: ColumnDTO) => void;
  onDeleteColumn: (column: ColumnDTO) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    disabled: !canEdit,
    data: { type: "column", column },
  });

  // Separate droppable on the card list so empty columns still accept drops.
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `column-drop-${column.id}`,
    data: { type: "column-drop", columnId: column.id },
  });

  const overLimit = column.wipLimit > 0 && tasks.length > column.wipLimit;

  return (
    <div
      ref={setSortableRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex w-[19rem] shrink-0 flex-col rounded-xl border bg-muted/40",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        {canEdit ? (
          <button
            className="cursor-grab text-muted-foreground/50 transition-colors hover:text-muted-foreground active:cursor-grabbing"
            aria-label={`Kéo cột ${column.name}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        ) : null}

        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: column.color }} />
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{column.name}</h3>

        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
            overLimit ? "bg-destructive/15 text-destructive" : "bg-background text-muted-foreground",
          )}
          title={column.wipLimit > 0 ? `Giới hạn WIP: ${column.wipLimit}` : undefined}
        >
          {tasks.length}
          {column.wipLimit > 0 ? `/${column.wipLimit}` : ""}
        </span>

        {canEdit ? (
          <DropdownMenu>
            {/* Explicit id — see the comment in sidebar.tsx's workspace switcher.
                This one matters most: with one trigger per column, an id drift
                here cascades into a mismatch for every column after it. */}
            <DropdownMenuTrigger asChild id={`column-options-trigger-${column.id}`}>
              <Button variant="ghost" size="icon-sm" aria-label="Tuỳ chọn cột">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onAddTask(column.id)}>
                <Plus /> Thêm công việc
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEditColumn(column)}>
                <Pencil /> Sửa cột
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => onDeleteColumn(column)}>
                <Trash2 /> Xoá cột
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {overLimit ? (
        <p className="mx-3 mb-2 rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
          Vượt giới hạn WIP ({column.wipLimit}). Hãy hoàn thành bớt việc đang làm.
        </p>
      ) : null}

      <div
        ref={setDroppableRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3 transition-colors",
          isOver && "bg-primary/5",
        )}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              projectKey={projectKey}
              onOpen={onOpenTask}
              disabled={!canEdit}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
            Kéo thẻ vào đây
          </p>
        ) : null}

        {canEdit ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full justify-start text-muted-foreground"
            onClick={() => onAddTask(column.id)}
          >
            <Plus className="size-4" /> Thêm công việc
          </Button>
        ) : null}
      </div>
    </div>
  );
}
