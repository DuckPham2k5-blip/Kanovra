"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as React from "react";

import { TaskCardContent } from "@/components/board/task-card-content";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { TaskCardDTO } from "@/types";

// Re-exported so the many places that already import the card's presentation
// from here keep working. It lives in its own module now — see the note there.
export { TaskCardContent };

export function SortableTaskCard({
  task,
  projectKey,
  onOpen,
  disabled,
  selected,
  selecting,
  onToggleSelect,
}: {
  task: TaskCardDTO;
  projectKey: string;
  onOpen: (taskId: string) => void;
  disabled?: boolean;
  selected?: boolean;
  /** True once anything is selected, which is when the boxes stay visible. */
  selecting?: boolean;
  onToggleSelect?: (taskId: string) => void;
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
      onClick={(event) => {
        // Ctrl or ⌘ picks the card instead of opening it — the shortcut every
        // file manager and mail client already taught people. The checkbox is
        // the discoverable half of the same thing.
        if (onToggleSelect && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          onToggleSelect(task.id);
          return;
        }
        onOpen(task.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.currentTarget.dataset.dragging) onOpen(task.id);
      }}
    >
      <div className="group/card relative">
        {onToggleSelect ? (
          /*
           * The press is swallowed before dnd-kit sees it. The card's own
           * listeners are on the wrapper, so a press that bubbles starts a drag
           * and the checkbox never gets its click — the same fault that made
           * four buttons on the map canvas look dead.
           */
          <span
            className={cn(
              "absolute left-1.5 top-1.5 z-10 transition-opacity",
              selected || selecting ? "opacity-100" : "opacity-0 group-hover/card:opacity-100",
            )}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              onToggleSelect(task.id);
            }}
          >
            <Checkbox checked={!!selected} aria-label={`Select ${task.title}`} />
          </span>
        ) : null}

        <TaskCardContent
          task={task}
          projectKey={projectKey}
          className={cn(
            "cursor-pointer",
            selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
          )}
        />
      </div>
    </div>
  );
}
