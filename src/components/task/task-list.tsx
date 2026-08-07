"use client";

import { TaskStatus } from "@prisma/client";
import { ArrowUpDown, Filter, Plus, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { DueBadge, LabelChip, PriorityBadge, StatusBadge } from "@/components/shared/badges";
import { UserAvatar } from "@/components/shared/user-avatar";
import { TaskDialog } from "@/components/task/task-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRIORITY_META, PRIORITY_ORDER, TASK_STATUS_META, TASK_STATUS_ORDER } from "@/lib/constants";
import { deaccent, cn } from "@/lib/utils";
import { toggleTaskDone } from "@/server/actions/task";
import type { LabelDTO, MemberDTO, TaskCardDTO } from "@/types";

const ALL = "__all__";

type SortKey = "manual" | "due" | "priority" | "title" | "status";

export type ListTask = TaskCardDTO & {
  project?: { id: string; name: string; key: string; color: string; icon: string } | null;
};

/**
 * Filterable, sortable task table. Shared by the project list view and the
 * "Việc của tôi" page; `showProject` switches the project column on.
 */
export function TaskList({
  tasks,
  members,
  labels,
  projectId,
  projectKey,
  canEdit,
  showProject,
  emptyHint,
}: {
  tasks: ListTask[];
  members: MemberDTO[];
  labels: LabelDTO[];
  projectId?: string;
  projectKey?: string;
  canEdit: boolean;
  showProject?: boolean;
  emptyHint?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<string>(ALL);
  const [priority, setPriority] = React.useState<string>(ALL);
  const [assignee, setAssignee] = React.useState<string>(ALL);
  const [labelId, setLabelId] = React.useState<string>(ALL);
  const [sort, setSort] = React.useState<SortKey>("manual");
  const [showFilters, setShowFilters] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);

  const filtered = React.useMemo(() => {
    const needle = deaccent(query.trim().toLowerCase());

    const result = tasks.filter((task) => {
      if (status !== ALL && task.status !== status) return false;
      if (priority !== ALL && task.priority !== priority) return false;
      if (assignee !== ALL) {
        if (assignee === "unassigned" ? task.assignee : task.assignee?.id !== assignee) return false;
      }
      if (labelId !== ALL && !task.labels.some((l) => l.id === labelId)) return false;
      if (needle) {
        const haystack = deaccent(`${task.title} ${task.description ?? ""}`.toLowerCase());
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });

    const sorted = [...result];
    if (sort === "due") {
      sorted.sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    } else if (sort === "priority") {
      sorted.sort((a, b) => PRIORITY_META[b.priority].rank - PRIORITY_META[a.priority].rank);
    } else if (sort === "title") {
      sorted.sort((a, b) => a.title.localeCompare(b.title, "vi"));
    } else if (sort === "status") {
      sorted.sort(
        (a, b) => TASK_STATUS_ORDER.indexOf(a.status) - TASK_STATUS_ORDER.indexOf(b.status),
      );
    }
    return sorted;
  }, [tasks, query, status, priority, assignee, labelId, sort]);

  const activeFilters =
    (status !== ALL ? 1 : 0) +
    (priority !== ALL ? 1 : 0) +
    (assignee !== ALL ? 1 : 0) +
    (labelId !== ALL ? 1 : 0);

  function resetFilters() {
    setStatus(ALL);
    setPriority(ALL);
    setAssignee(ALL);
    setLabelId(ALL);
    setQuery("");
  }

  /** The detail panel is rendered by the page that owns this list. */
  function openTask(task: ListTask) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", task.id);
    router.push(`?${params.toString()}`, { scroll: false });
  }

  async function handleToggleDone(taskId: string) {
    const result = await toggleTaskDone(taskId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm công việc…"
            className="pl-8"
          />
        </div>

        <Button
          variant={showFilters || activeFilters > 0 ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowFilters((v) => !v)}
        >
          <Filter className="size-4" />
          Bộ lọc
          {activeFilters > 0 ? (
            <Badge className="ml-1 size-5 justify-center p-0 text-[10px]">{activeFilters}</Badge>
          ) : null}
        </Button>

        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="h-9 w-auto gap-2">
            <ArrowUpDown className="size-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Thứ tự bảng</SelectItem>
            <SelectItem value="due">Hạn gần nhất</SelectItem>
            <SelectItem value="priority">Ưu tiên cao nhất</SelectItem>
            <SelectItem value="status">Trạng thái</SelectItem>
            <SelectItem value="title">Tên A→Z</SelectItem>
          </SelectContent>
        </Select>

        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length}/{tasks.length}
        </span>

        {canEdit && projectId ? (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Công việc mới</span>
          </Button>
        ) : null}
      </div>

      {showFilters ? (
        <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Mọi trạng thái</SelectItem>
              {TASK_STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {TASK_STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger>
              <SelectValue placeholder="Ưu tiên" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Mọi mức ưu tiên</SelectItem>
              {PRIORITY_ORDER.map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORITY_META[p].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger>
              <SelectValue placeholder="Người phụ trách" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Mọi người</SelectItem>
              <SelectItem value="unassigned">Chưa giao</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-2">
            <Select value={labelId} onValueChange={setLabelId}>
              <SelectTrigger>
                <SelectValue placeholder="Nhãn" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Mọi nhãn</SelectItem>
                {labels.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeFilters > 0 ? (
              <Button variant="ghost" size="icon" onClick={resetFilters} aria-label="Xoá bộ lọc">
                <X className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Rows */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Không có công việc nào"
          description={
            tasks.length > 0
              ? "Thử nới lỏng bộ lọc hoặc từ khoá tìm kiếm."
              : (emptyHint ?? "Tạo công việc đầu tiên để bắt đầu.")
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          {filtered.map((task, index) => {
            const done = task.status === TaskStatus.DONE;
            return (
              <div
                key={task.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50",
                  index > 0 && "border-t",
                )}
              >
                <Checkbox
                  checked={done}
                  disabled={!canEdit}
                  onCheckedChange={() => void handleToggleDone(task.id)}
                  aria-label={`Hoàn thành ${task.title}`}
                />

                <button
                  onClick={() => openTask(task)}
                  className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
                >
                  <span className="flex w-full min-w-0 items-center gap-2">
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {task.project?.key ?? projectKey}-{task.number}
                    </span>
                    <span className={cn("truncate text-sm", done && "text-muted-foreground line-through")}>
                      {task.title}
                    </span>
                  </span>

                  <span className="flex flex-wrap items-center gap-2">
                    {showProject && task.project ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px]"
                        style={{
                          backgroundColor: `${task.project.color}1f`,
                          color: task.project.color,
                        }}
                      >
                        {task.project.name}
                      </span>
                    ) : null}
                    {task.labels.slice(0, 2).map((label) => (
                      <LabelChip key={label.id} label={label} />
                    ))}
                    <DueBadge date={task.dueDate} done={done} />
                    {task.checklistTotal > 0 ? (
                      <span className="text-[11px] text-muted-foreground">
                        ☑ {task.checklistDone}/{task.checklistTotal}
                      </span>
                    ) : null}
                  </span>
                </button>

                <div className="hidden shrink-0 items-center gap-2 sm:flex">
                  <PriorityBadge priority={task.priority} iconOnly />
                  <StatusBadge status={task.status} />
                </div>
                <UserAvatar user={task.assignee} className="size-7 shrink-0" />
              </div>
            );
          })}
        </div>
      )}

      {projectId ? (
        <TaskDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          projectId={projectId}
          members={members}
          labels={labels}
        />
      ) : null}
    </div>
  );
}
