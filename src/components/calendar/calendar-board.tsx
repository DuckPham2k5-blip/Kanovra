"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { CalendarDatePicker } from "@/components/calendar/calendar-date-picker";
import { PriorityBadge } from "@/components/shared/badges";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { anchorKey, resolveAnchor, stepMonth } from "@/lib/calendar-view";
import { TASK_STATUS_META } from "@/lib/constants";
import {
  eachDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  startOfMonth,
  startOfWeek,
  WEEKDAY_LABELS,
} from "@/lib/date";
import { cn } from "@/lib/utils";
import type { UserDTO } from "@/types";

export type CalendarTask = {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueDate: string;
  assignee: UserDTO | null;
  project: { id: string; name: string; key: string; color: string };
};

/**
 * A month of tasks by due date, with one date selected on the grid.
 *
 * The grid is the only view. Where you are is a URL choice (`?date=`), so the
 * server has already fetched the whole month grid for it and this component
 * draws it. The date picker and the prev/next stepper both move that anchor and
 * let the page refetch, which keeps the range and the picture in agreement, and
 * the anchor's cell glows so it is obvious which day you jumped to.
 */
export function CalendarBoard({
  tasks,
  anchor: anchorParam,
  showProject = true,
}: {
  tasks: CalendarTask[];
  anchor: string;
  showProject?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [drill, setDrill] = React.useState<Date | null>(null);

  const anchor = React.useMemo(() => resolveAnchor(anchorParam), [anchorParam]);

  const byDay = React.useMemo(() => {
    const map = new Map<string, CalendarTask[]>();
    for (const task of tasks) {
      const key = format(new Date(task.dueDate), "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push(task);
      map.set(key, list);
    }
    return map;
  }, [tasks]);

  /** Writes `date` (or opens a task) and lets the page refetch. */
  const go = React.useCallback(
    (next: { date?: Date; task?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.date) params.set("date", anchorKey(next.date));
      if (next.task) params.set("task", next.task);
      else params.delete("task");
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const openTask = (taskId: string) => go({ task: taskId });

  const days = React.useMemo(
    () =>
      eachDay(
        startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }),
        endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 }),
      ),
    [anchor],
  );
  const anyTasks = byDay.size > 0;

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      {/* Header: the date picker, and the month stepper. */}
      <div className="flex flex-wrap items-center gap-2">
        <CalendarDatePicker anchor={anchor} onPick={(date) => go({ date })} />

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => go({ date: stepMonth(anchor, -1) })}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => go({ date: new Date() })}>
            Today
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => go({ date: stepMonth(anchor, 1) })}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Desktop grid — translucent surface, opaque chips; see `.tf-calendar-surface`. */}
      <div className="tf-calendar-surface hidden overflow-hidden rounded-lg border shadow-sm md:block">
        <div className="grid grid-cols-7 border-b bg-muted">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day, index) => {
            const key = anchorKey(day);
            const dayTasks = byDay.get(key) ?? [];
            const outside = day.getMonth() !== anchor.getMonth();
            // The glow: the cell the picker/stepper landed on, so you can see
            // where you are. Distinct from today's filled day-number.
            const selected = isSameDay(day, anchor);

            return (
              <div
                key={key}
                className={cn(
                  "relative min-h-28 border-b border-r p-1.5 last:border-r-0",
                  index % 7 === 6 && "border-r-0",
                  outside && "bg-muted/30",
                  selected && "z-10 bg-primary/10 ring-2 ring-inset ring-primary",
                )}
              >
                <div className="mb-1 flex items-center justify-between px-1">
                  <span
                    className={cn(
                      "text-xs",
                      outside ? "text-muted-foreground/60" : "text-muted-foreground",
                      isToday(day) &&
                        "flex size-5 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground",
                    )}
                  >
                    {day.getDate()}
                  </span>
                  {dayTasks.length > 3 ? (
                    <button
                      onClick={() => setDrill(day)}
                      className="text-[10px] text-primary hover:underline"
                    >
                      +{dayTasks.length - 3}
                    </button>
                  ) : null}
                </div>

                <div className="space-y-1">
                  {dayTasks.slice(0, 3).map((task) => (
                    <TaskChip key={task.id} task={task} onOpen={openTask} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile agenda */}
      <div className="space-y-3 md:hidden">
        {!anyTasks ? (
          <EmptyState icon={CalendarDays} title="Nothing due" description="Nothing this month has a due date set." />
        ) : (
          days
            .filter((day) => (byDay.get(anchorKey(day)) ?? []).length > 0)
            .map((day) => (
              <div key={anchorKey(day)} className="space-y-1.5">
                <p
                  className={cn(
                    "text-xs font-medium capitalize",
                    isSameDay(day, anchor)
                      ? "text-primary"
                      : isToday(day)
                        ? "text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {format(day, "EEEE, dd/MM")}
                  {isSameDay(day, anchor) ? " ·" : null}
                </p>
                {(byDay.get(anchorKey(day)) ?? []).map((task) => (
                  <AgendaRow key={task.id} task={task} onOpen={openTask} showProject={showProject} />
                ))}
              </div>
            ))
        )}
      </div>

      {!anyTasks ? (
        <p className="hidden text-center text-sm text-muted-foreground md:block">
          No tasks are due this month.
        </p>
      ) : null}

      {/* Day drill-down for the "+N" overflow */}
      {drill ? (
        <DayDrillDown
          day={drill}
          tasks={byDay.get(anchorKey(drill)) ?? []}
          onOpen={openTask}
          onClose={() => setDrill(null)}
        />
      ) : null}
    </div>
  );
}

function statusDot(status: string) {
  return TASK_STATUS_META[status as keyof typeof TASK_STATUS_META]?.color;
}

function TaskChip({ task, onOpen }: { task: CalendarTask; onOpen: (id: string) => void }) {
  return (
    <button
      onClick={() => onOpen(task.id)}
      className="tf-calendar-chip block w-full truncate rounded px-1.5 py-1 text-left text-[11px] leading-tight transition-colors hover:brightness-95"
      style={{ "--tf-chip-color": task.project.color, color: task.project.color } as React.CSSProperties}
      title={task.title}
    >
      <span
        className="mr-1 inline-block size-1.5 rounded-full align-middle"
        style={{ backgroundColor: statusDot(task.status) }}
      />
      {task.title}
    </button>
  );
}

function AgendaRow({
  task,
  onOpen,
  showProject,
}: {
  task: CalendarTask;
  onOpen: (id: string) => void;
  showProject: boolean;
}) {
  return (
    <button
      onClick={() => onOpen(task.id)}
      className="flex w-full items-center gap-2 rounded-lg border p-2.5 text-left hover:bg-muted/50"
    >
      <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: task.project.color }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{task.title}</span>
        {showProject ? (
          <span className="block text-[11px] text-muted-foreground">
            {task.project.key}-{task.number} · {task.project.name}
          </span>
        ) : (
          <span className="block font-mono text-[11px] text-muted-foreground">
            {task.project.key}-{task.number}
          </span>
        )}
      </span>
      <PriorityBadge priority={task.priority} iconOnly />
      <UserAvatar user={task.assignee} className="size-6" />
    </button>
  );
}

function DayDrillDown({
  day,
  tasks,
  onOpen,
  onClose,
}: {
  day: Date;
  tasks: CalendarTask[];
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium capitalize">{format(day, "EEEE, dd/MM/yyyy")}</p>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="space-y-1.5">
        {tasks.map((task) => (
          <button
            key={task.id}
            onClick={() => onOpen(task.id)}
            className="flex w-full items-center gap-2 rounded-lg border p-2.5 text-left hover:bg-muted/50"
          >
            <span className="font-mono text-[11px] text-muted-foreground">
              {task.project.key}-{task.number}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
            <UserAvatar user={task.assignee} className="size-6" />
          </button>
        ))}
      </div>
    </div>
  );
}
