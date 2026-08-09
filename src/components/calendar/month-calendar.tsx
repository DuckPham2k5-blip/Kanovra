"use client";

import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { PriorityBadge } from "@/components/shared/badges";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TASK_STATUS_META } from "@/lib/constants";
import {
  WEEKDAY_LABELS,
  eachDay,
  endOfMonth,
  endOfWeek,
  format,
  isToday,
  startOfMonth,
  startOfWeek,
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
 * Month grid of tasks by due date. Navigation writes `?month=YYYY-MM` so the
 * server can fetch exactly the range being displayed.
 */
export function MonthCalendar({
  tasks,
  month,
  showProject = true,
}: {
  tasks: CalendarTask[];
  month: string;
  showProject?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = React.useState<Date | null>(null);

  const current = React.useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, (m || 1) - 1, 1);
  }, [month]);

  const days = React.useMemo(
    () =>
      eachDay(
        startOfWeek(startOfMonth(current), { weekStartsOn: 1 }),
        endOfWeek(endOfMonth(current), { weekStartsOn: 1 }),
      ),
    [current],
  );

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

  function navigate(offset: number) {
    const next = new Date(current);
    next.setMonth(next.getMonth() + offset);
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", format(next, "yyyy-MM"));
    params.delete("task");
    router.push(`?${params.toString()}`, { scroll: false });
  }

  function goToday() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", format(new Date(), "yyyy-MM"));
    router.push(`?${params.toString()}`, { scroll: false });
  }

  function openTask(taskId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", taskId);
    router.push(`?${params.toString()}`, { scroll: false });
  }

  const selectedTasks = selected
    ? (byDay.get(format(selected, "yyyy-MM-dd")) ?? [])
    : [];

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold capitalize">{format(current, "MMMM yyyy")}</h2>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => navigate(-1)} aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => navigate(1)} aria-label="Next month">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Desktop grid */}
      <div className="hidden overflow-hidden rounded-lg border md:block">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day, index) => {
            const key = format(day, "yyyy-MM-dd");
            const dayTasks = byDay.get(key) ?? [];
            const outside = day.getMonth() !== current.getMonth();

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
                      onClick={() => setSelected(day)}
                      className="text-[10px] text-primary hover:underline"
                    >
                      +{dayTasks.length - 3}
                    </button>
                  ) : null}
                </div>

                <div className="space-y-1">
                  {dayTasks.slice(0, 3).map((task) => (
                    <button
                      key={task.id}
                      onClick={() => openTask(task.id)}
                      className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] leading-tight transition-colors hover:brightness-95"
                      style={{
                        backgroundColor: `${task.project.color}1a`,
                        color: task.project.color,
                      }}
                      title={task.title}
                    >
                      <span
                        className="mr-1 inline-block size-1.5 rounded-full align-middle"
                        style={{
                          backgroundColor:
                            TASK_STATUS_META[task.status as keyof typeof TASK_STATUS_META]?.color,
                        }}
                      />
                      {task.title}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile agenda */}
      <div className="space-y-3 md:hidden">
        {tasks.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Nothing due"
            description="Nothing in this month has a due date set."
          />
        ) : (
          days
            .filter((day) => (byDay.get(format(day, "yyyy-MM-dd")) ?? []).length > 0)
            .map((day) => (
              <div key={format(day, "yyyy-MM-dd")} className="space-y-1.5">
                <p
                  className={cn(
                    "text-xs font-medium capitalize",
                    isToday(day) ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {format(day, "EEEE, dd/MM")}
                </p>
                {(byDay.get(format(day, "yyyy-MM-dd")) ?? []).map((task) => (
                  <button
                    key={task.id}
                    onClick={() => openTask(task.id)}
                    className="flex w-full items-center gap-2 rounded-lg border p-2.5 text-left"
                  >
                    <span
                      className="h-8 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: task.project.color }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{task.title}</span>
                      {showProject ? (
                        <span className="block text-[11px] text-muted-foreground">
                          {task.project.name}
                        </span>
                      ) : null}
                    </span>
                    <PriorityBadge priority={task.priority} iconOnly />
                    <UserAvatar user={task.assignee} className="size-6" />
                  </button>
                ))}
              </div>
            ))
        )}
      </div>

      {/* Day drill-down */}
      {selected && selectedTasks.length > 0 ? (
        <div className="rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium capitalize">
              {format(selected, "EEEE, dd/MM/yyyy")}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              Close
            </Button>
          </div>
          <div className="space-y-1.5">
            {selectedTasks.map((task) => (
              <button
                key={task.id}
                onClick={() => openTask(task.id)}
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
      ) : null}

      {tasks.length === 0 ? (
        <p className="hidden text-center text-sm text-muted-foreground md:block">
          No tasks are due this month.
        </p>
      ) : null}
    </div>
  );
}
