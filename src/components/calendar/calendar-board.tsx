"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { PriorityBadge } from "@/components/shared/badges";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  anchorKey,
  periodLabel,
  resolveAnchor,
  resolveView,
  step,
  VIEW_LABELS,
  VIEWS,
  type CalendarView,
} from "@/lib/calendar-view";
import { TASK_STATUS_META } from "@/lib/constants";
import {
  eachDay,
  endOfMonth,
  endOfWeek,
  format,
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
 * Tasks by due date, at one of three resolutions.
 *
 * Day / month / year is a URL choice (`?view=`, `?date=`), so the server has
 * already fetched exactly the range being shown and this component only draws
 * it. Every navigation — a step, a "Today", a view switch, drilling from a year
 * cell into its month — writes those two params and lets the page refetch,
 * which is what keeps the range and the picture in agreement. The arithmetic
 * behind all of it is in `lib/calendar-view.ts`, with its own tests.
 */
export function CalendarBoard({
  tasks,
  view: viewParam,
  anchor: anchorParam,
  showProject = true,
}: {
  tasks: CalendarTask[];
  view: string;
  anchor: string;
  showProject?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = React.useState<Date | null>(null);

  const view = resolveView(viewParam);
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

  /** Writes `view`/`date` and lets the page refetch; drops any open drill-down. */
  const go = React.useCallback(
    (next: { view?: CalendarView; date?: Date; task?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.view) params.set("view", next.view);
      if (next.date) params.set("date", anchorKey(next.date));
      if (next.task) params.set("task", next.task);
      else params.delete("task");
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const openTask = (taskId: string) => go({ task: taskId });

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      {/* Header: period name, view switcher, and prev/today/next */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold capitalize">{periodLabel(view, anchor)}</h2>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border p-0.5" role="tablist" aria-label="Calendar view">
            {VIEWS.map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={v === view}
                onClick={() => go({ view: v })}
                className={cn(
                  "rounded-md px-3 py-1 text-sm transition-colors",
                  v === view
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent/60",
                )}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => go({ date: step(view, anchor, -1) })}
              aria-label={`Previous ${view}`}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => go({ date: new Date() })}>
              Today
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => go({ date: step(view, anchor, 1) })}
              aria-label={`Next ${view}`}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {view === "day" ? (
        <DayView anchor={anchor} tasks={byDay.get(anchorKey(anchor)) ?? []} onOpen={openTask} showProject={showProject} />
      ) : view === "year" ? (
        <YearView anchor={anchor} tasks={tasks} onPickMonth={(date) => go({ view: "month", date })} />
      ) : (
        <MonthGrid
          anchor={anchor}
          byDay={byDay}
          onOpen={openTask}
          onOverflow={setSelected}
          showProject={showProject}
        />
      )}

      {/* Day drill-down (month grid "+N" and the mobile agenda share it) */}
      {selected ? (
        <DayDrillDown
          day={selected}
          tasks={byDay.get(anchorKey(selected)) ?? []}
          onOpen={openTask}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

/** A single status dot in the project's colour, used on every chip. */
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

function MonthGrid({
  anchor,
  byDay,
  onOpen,
  onOverflow,
  showProject,
}: {
  anchor: Date;
  byDay: Map<string, CalendarTask[]>;
  onOpen: (id: string) => void;
  onOverflow: (day: Date) => void;
  showProject: boolean;
}) {
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
    <>
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

            return (
              <div
                key={key}
                className={cn(
                  "min-h-28 border-b border-r p-1.5 last:border-r-0",
                  index % 7 === 6 && "border-r-0",
                  outside && "bg-muted/30",
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
                      onClick={() => onOverflow(day)}
                      className="text-[10px] text-primary hover:underline"
                    >
                      +{dayTasks.length - 3}
                    </button>
                  ) : null}
                </div>

                <div className="space-y-1">
                  {dayTasks.slice(0, 3).map((task) => (
                    <TaskChip key={task.id} task={task} onOpen={onOpen} />
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
                <p className={cn("text-xs font-medium capitalize", isToday(day) ? "text-primary" : "text-muted-foreground")}>
                  {format(day, "EEEE, dd/MM")}
                </p>
                {(byDay.get(anchorKey(day)) ?? []).map((task) => (
                  <AgendaRow key={task.id} task={task} onOpen={onOpen} showProject={showProject} />
                ))}
              </div>
            ))
        )}
      </div>

      {!anyTasks ? (
        <p className="hidden text-center text-sm text-muted-foreground md:block">No tasks are due this month.</p>
      ) : null}
    </>
  );
}

function DayView({
  anchor,
  tasks,
  onOpen,
  showProject,
}: {
  anchor: Date;
  tasks: CalendarTask[];
  onOpen: (id: string) => void;
  showProject: boolean;
}) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title={isToday(anchor) ? "Nothing due today" : "Nothing due"}
        description="No task has a due date on this day."
      />
    );
  }
  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <AgendaRow key={task.id} task={task} onOpen={onOpen} showProject={showProject} />
      ))}
    </div>
  );
}

/**
 * Twelve month cells with a count of what is due in each.
 *
 * A year of individual days is unreadable, so the year view answers a coarser
 * question — which months carry the load — and clicking one drills into it. The
 * count is of tasks whose due date falls in that calendar month, which is why
 * the page fetches the whole year for this view.
 */
function YearView({
  anchor,
  tasks,
  onPickMonth,
}: {
  anchor: Date;
  tasks: CalendarTask[];
  onPickMonth: (date: Date) => void;
}) {
  const year = anchor.getFullYear();
  const counts = React.useMemo(() => {
    const per = new Array(12).fill(0);
    for (const task of tasks) {
      const d = new Date(task.dueDate);
      if (d.getFullYear() === year) per[d.getMonth()] += 1;
    }
    return per;
  }, [tasks, year]);

  const now = new Date();
  const thisMonth = now.getFullYear() === year ? now.getMonth() : -1;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {counts.map((count, month) => {
        const date = new Date(year, month, 1);
        return (
          <button
            key={month}
            onClick={() => onPickMonth(date)}
            className={cn(
              "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors hover:bg-accent/60",
              month === thisMonth && "border-primary",
            )}
          >
            <span className={cn("text-sm font-medium", month === thisMonth && "text-primary")}>
              {format(date, "MMMM")}
            </span>
            <span className="text-xs text-muted-foreground">
              {count === 0 ? "Nothing due" : `${count} task${count === 1 ? "" : "s"} due`}
            </span>
          </button>
        );
      })}
    </div>
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
