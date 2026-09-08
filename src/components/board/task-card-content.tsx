"use client";

import {
  CheckSquare,
  CircleSlash,
  GitBranch,
  MessageSquare,
  Paperclip,
  Repeat,
} from "lucide-react";

import { DueBadge, LabelChip, PriorityBadge } from "@/components/shared/badges";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Progress } from "@/components/ui/progress";
import { describeRecurrence, parseRecurrence } from "@/lib/recurrence";
import { blockerResolved } from "@/lib/task-dependencies";
import { cn, percent } from "@/lib/utils";
import type { TaskCardDTO } from "@/types";

/**
 * The card, drawn.
 *
 * Its own file, apart from `SortableTaskCard`, because two callers need it
 * without the drag machinery: the drag overlay it was first factored out for,
 * and the public read-only board, which is a separate bundle entry and would
 * otherwise pay for `@dnd-kit` to render cards nobody can pick up.
 */


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
  // Only on the occurrence that carries the rule, which is the open one: the
  // rule moves on completion, so a finished card is a finished piece of work and
  // says nothing about repeating.
  const repeat = parseRecurrence(task.recurrence);
  const checklistProgress = percent(task.checklistDone, task.checklistTotal);
  const hasMeta =
    task.subtaskCount > 0 ||
    task.commentCount > 0 ||
    task.attachmentCount > 0 ||
    !!task.dueDate ||
    !!task.recurrence;

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

      {/* Above the meta row, not in it.
          "This cannot start yet" outranks three comments and a paperclip, and a
          card is read top to bottom — putting it with the small counts is where
          somebody picking up work would not see it.

          Not on a card that is finished or cancelled. It was shown there at
          first, on the reasoning that completing something still blocked is an
          anomaly worth surfacing — but "Blocked by 1" beside a task that is done
          is a false sentence, and a card is a summary that has to read true at a
          glance. The anomaly is still visible where it belongs: the warning at
          the moment of completing, and the panel, which lists every link whatever
          state the task is in.

          The same predicate as a blocker's, because it is the same question —
          has this task reached a state where what it waits on stops mattering.
          Written out again here as `status === "DONE"` it would miss CANCELLED,
          and then drift. */}
      {task.openBlockers > 0 && !blockerResolved(task.status) ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
          <CircleSlash className="size-3" />
          Blocked by {task.openBlockers}
        </span>
      ) : null}

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
          {repeat ? (
            <span className="inline-flex items-center gap-1" title={describeRecurrence(repeat)}>
              <Repeat className="size-3" />
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
