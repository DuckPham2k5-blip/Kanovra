"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckSquare, GitBranch, MessageSquare, Paperclip } from "lucide-react";
import * as React from "react";

import { DueBadge, LabelChip, PriorityBadge } from "@/components/shared/badges";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Progress } from "@/components/ui/progress";
import { cn, percent } from "@/lib/utils";
import type { TaskCardDTO } from "@/types";

/** Static presentation of a card — also used inside the drag overlay. */
export function TaskCardContent({
  task,
  projectKey,
  className,
}: {
  task: TaskCardDTO;
  projectKey: string;
  className?: string;
}) {
  const done = task.status === "DONE";
  const checklistProgress = percent(task.checklistDone, task.checklistTotal);
  const hasMeta =
    task.subtaskCount > 0 || task.commentCount > 0 || task.attachmentCount > 0 || task.dueDate;

  return (
    <div className={cn("tf-card tf-card-hover space-y-2.5 p-3", done && "opacity-75", className)}>
      {task.labels.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
          {task.labels.length > 3 ? (
            <span className="text-[11px] text-muted-foreground">+{task.labels.length - 3}</span>
          ) : null}
        </div>
      ) : null}

      <p className={cn("text-sm font-medium leading-snug", done && "line-through")}>{task.title}</p>

      {task.checklistTotal > 0 ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CheckSquare className="size-3" />
              {task.checklistDone}/{task.checklistTotal}
            </span>
            <span>{checklistProgress}%</span>
          </div>
          <Progress value={checklistProgress} className="h-1" />
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {projectKey}-{task.number}
          </span>
          {task.priority !== "NONE" ? <PriorityBadge priority={task.priority} iconOnly /> : null}
        </div>
        <UserAvatar user={task.assignee} className="size-6" />
      </div>

      {hasMeta ? (
        <div className="flex flex-wrap items-center gap-3 border-t pt-2 text-[11px] text-muted-foreground">
          <DueBadge date={task.dueDate} done={done} />
          {task.subtaskCount > 0 ? (
            <span className="inline-flex items-center gap-1">
              <GitBranch className="size-3" />
              {task.subtaskCount}
            </span>
          ) : null}
          {task.commentCount > 0 ? (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="size-3" />
              {task.commentCount}
            </span>
          ) : null}
          {task.attachmentCount > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="size-3" />
              {task.attachmentCount}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Draggable wrapper. `disabled` renders a plain, non-draggable card. */
export function SortableTaskCard({
  task,
  projectKey,
  onOpen,
  disabled,
}: {
  task: TaskCardDTO;
  projectKey: string;
  onOpen: (taskId: string) => void;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled,
    data: { type: "task", task },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("touch-manipulation", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.currentTarget.dataset.dragging) onOpen(task.id);
      }}
    >
      <TaskCardContent task={task} projectKey={projectKey} className="cursor-pointer" />
    </div>
  );
}
