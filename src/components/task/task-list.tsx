"use client";

import { TaskStatus } from "@prisma/client";
import {
  ArrowUpDown,
  ChevronRight,
  CornerDownRight,
  Filter,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { DueBadge, LabelChip, PriorityBadge, StatusBadge } from "@/components/shared/badges";
import { UserAvatar } from "@/components/shared/user-avatar";
import { BulkBar } from "@/components/task/bulk-bar";
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
  /**
   * The task this one belongs to, when it is worth naming.
   *
   * Only "My tasks" sends it, and only because assignment does not follow the
   * tree: you are given a step rather than the thing containing it, so a subtask
   * arrives there with no parent on screen and a title like "— bước 2" says
   * nothing about what it is part of.
   */
  parent?: { id: string; title: string } | null;
};

/**
 * Filterable, sortable task table. Shared by the project list view and the
 * "My tasks" page; `showProject` switches the project column on.
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

  /**
   * The rows picked out for a bulk edit, and where the last pick was.
   *
   * The anchor is an index into the *filtered* list, not an id, because that is
   * what a Shift range means to somebody looking at the screen: everything
   * between the two rows they can see. Holding an id would make the range depend
   * on the underlying order, which the filters have already changed.
   */
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(() => new Set());
  const anchor = React.useRef<number | null>(null);

  /** Which parents have been opened to show their subtasks. Closed to start. */
  const [open, setOpen] = React.useState<ReadonlySet<string>>(() => new Set());
  const toggleOpen = React.useCallback((taskId: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(taskId)) next.add(taskId);
      return next;
    });
  }, []);

  const clearSelection = React.useCallback(() => {
    setSelected(new Set());
    anchor.current = null;
  }, []);

  /**
   * Everything on screen — the rows as drawn, not the tasks behind them.
   *
   * A subtask folded under its parent is not on screen, so it is not selected.
   * Selecting something nobody can see is the same hazard as leaving a filtered
   * row in the selection: the count says one thing and the screen says another,
   * and the bulk action follows the count.
   */
  const selectAll = React.useCallback(() => {
    setSelected(new Set(rowsRef.current.map((row) => row.task.id)));
  }, []);

  // Read at call time rather than closed over, so `selectAll` stays stable while
  // the filters change underneath it.
  const rowsRef = React.useRef<{ task: ListTask; child: boolean; kids: ListTask[] }[]>([]);
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

  /**
   * The rows as they are drawn: every top-level task, each optionally followed by
   * its own subtasks once it has been opened.
   *
   * "My tasks" collects whatever is assigned to you, and that mixes the two
   * levels — a subtask sat in the list as though it were a task standing beside
   * its parent, which is what made deleting four things report five. A subtask
   * belongs *to* its parent, so it is folded under it and counted on it.
   *
   * A subtask whose parent is not in the list stays a row of its own. That is not
   * an edge case: the parent may be assigned to somebody else, or filtered out by
   * the search, and hiding the child because of it would lose work off the screen
   * with nothing to say where it went.
   */
  const rows = React.useMemo(() => {
    const shown = new Set(filtered.map((task) => task.id));
    const children = new Map<string, ListTask[]>();

    for (const task of filtered) {
      if (!task.parentId || !shown.has(task.parentId)) continue;
      const list = children.get(task.parentId);
      if (list) list.push(task);
      else children.set(task.parentId, [task]);
    }

    const out: { task: ListTask; child: boolean; kids: ListTask[] }[] = [];
    for (const task of filtered) {
      if (task.parentId && shown.has(task.parentId)) continue;
      const kids = children.get(task.id) ?? [];
      out.push({ task, child: false, kids });
      if (open.has(task.id)) {
        for (const kid of kids) out.push({ task: kid, child: true, kids: [] });
      }
    }
    return out;
  }, [filtered, open]);

  rowsRef.current = rows;

  /** True only when every row on screen is picked, which is what the header shows. */
  const allPicked = rows.length > 0 && rows.every((row) => selected.has(row.task.id));

  const toggleSelect = React.useCallback((taskId: string, index: number) => {
    anchor.current = index;
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(taskId)) next.add(taskId);
      return next;
    });
  }, []);

  /** Everything between the last row picked and this one, added to what is there. */
  const selectRange = React.useCallback(
    (index: number) => {
      const from = anchor.current;
      if (from === null) {
        toggleSelect(rowsRef.current[index].task.id, index);
        return;
      }
      const [lo, hi] = from <= index ? [from, index] : [index, from];
      setSelected((prev) => {
        const next = new Set(prev);
        // Indexed against the rows as drawn, including any open subtasks — a
        // range means what somebody dragged their eye across.
        for (let i = lo; i <= hi; i += 1) next.add(rowsRef.current[i].task.id);
        return next;
      });
    },
    [toggleSelect],
  );

  // Escape lets go, and a changed filter drops anything no longer on screen —
  // acting on a row you can no longer see is the whole hazard of a selection
  // that outlives its view.
  React.useEffect(() => {
    if (!selected.size) return;
    // Folding a parent takes its subtasks off screen as surely as a filter does,
    // so they leave the selection the same way.
    const visible = new Set(rows.map((row) => row.task.id));
    const kept = [...selected].filter((id) => visible.has(id));
    if (kept.length !== selected.size) setSelected(new Set(kept));
  }, [rows, selected]);

  React.useEffect(() => {
    if (!selected.size) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") clearSelection();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected.size, clearSelection]);

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
            placeholder="Search tasks…"
            className="pl-8"
          />
        </div>

        <Button
          variant={showFilters || activeFilters > 0 ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowFilters((v) => !v)}
        >
          <Filter className="size-4" />
          Filters
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
            <SelectItem value="manual">Board order</SelectItem>
            <SelectItem value="due">Due soonest</SelectItem>
            <SelectItem value="priority">Highest priority</SelectItem>
            <SelectItem value="status">Status</SelectItem>
            <SelectItem value="title">Name A→Z</SelectItem>
          </SelectContent>
        </Select>

        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length}/{tasks.length}
        </span>

        {canEdit && projectId ? (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">New task</span>
          </Button>
        ) : null}
      </div>

      {showFilters ? (
        <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any status</SelectItem>
              {TASK_STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {TASK_STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger>
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any priority</SelectItem>
              {PRIORITY_ORDER.map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORITY_META[p].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger>
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Everyone</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
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
                <SelectValue placeholder="Labels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any label</SelectItem>
                {labels.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeFilters > 0 ? (
              <Button variant="ghost" size="icon" onClick={resetFilters} aria-label="Clear filters">
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
          title="No tasks"
          description={
            tasks.length > 0
              ? "Try loosening the filters or the search term."
              : (emptyHint ?? "Create your first task to get started.")
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          {/*
           * One checkbox for selection, and it lives here rather than on every
           * row.
           *
           * A row already has a checkbox, and it means "done". A second one
           * beside it meant that on any task that was not finished the two were
           * identical empty squares with nothing to tell them apart — reported
           * as "why are there two tick columns". In the header there is no
           * "done" to confuse it with, so this one can only mean what it says.
           *
           * Individual rows are picked with Ctrl-click and ranges with
           * Shift-click, and a picked row is tinted. The bulk bar appears the
           * moment anything is selected and says how many.
           */}
          {canEdit ? (
            <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2">
              <Checkbox
                checked={allPicked ? true : selected.size > 0 ? "indeterminate" : false}
                onCheckedChange={() => (allPicked ? clearSelection() : selectAll())}
                aria-label={allPicked ? "Clear selection" : "Select all shown"}
              />
              <span className="text-xs text-muted-foreground">
                {selected.size
                  ? `${selected.size} selected · Ctrl-click a row to add, Shift-click for a range`
                  : "Select all"}
              </span>
            </div>
          ) : null}

          {rows.map(({ task, child, kids }, index) => {
            const done = task.status === TaskStatus.DONE;
            const picked = selected.has(task.id);
            const opened = open.has(task.id);
            return (
              <div
                key={task.id}
                className={cn(
                  "flex items-center gap-3 py-2.5 pr-3 transition-colors hover:bg-muted/50",
                  // Indented, and on a tinted ground, so a subtask reads as part
                  // of the row above rather than as the next task down.
                  child ? "bg-muted/25 pl-10" : "pl-3",
                  index > 0 && "border-t",
                  picked && "bg-primary/10 hover:bg-primary/15",
                )}
                onClick={(event) => {
                  // Ctrl or ⌘ picks one; Shift takes everything between this row
                  // and the last one picked, which is what anybody who has used
                  // a file list will try first.
                  if (!canEdit) return;
                  if (event.shiftKey) {
                    event.preventDefault();
                    selectRange(index);
                  } else if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    toggleSelect(task.id, index);
                  }
                }}
              >
                {/* The fold. Only a parent with subtasks on screen gets one;
                    everything else keeps the same indent from an empty space of
                    the same width, or the titles would not line up. */}
                {kids.length ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleOpen(task.id);
                    }}
                    aria-expanded={opened}
                    aria-label={`${opened ? "Hide" : "Show"} ${kids.length} subtasks`}
                    className="flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                  >
                    <ChevronRight
                      className={cn("size-3.5 transition-transform", opened && "rotate-90")}
                    />
                    {kids.length}
                  </button>
                ) : child ? null : (
                  <span className="w-[26px] shrink-0" aria-hidden="true" />
                )}

                <Checkbox
                  checked={done}
                  disabled={!canEdit}
                  onCheckedChange={() => void handleToggleDone(task.id)}
                  aria-label={`Completed ${task.title}`}
                />

                <button
                  onClick={() => openTask(task)}
                  className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
                >
                  <span className="flex w-full min-w-0 items-center gap-2">
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {task.project?.key ?? projectKey}-{task.number}
                    </span>
                    {/* Only when the parent is not already the row above. On this
                        page a subtask usually arrives alone — the parent belongs
                        to somebody else — and "… — bước 2" on its own says
                        nothing about what it is a step of. */}
                    {task.parent && !child ? (
                      <span className="flex min-w-0 shrink items-center gap-1 text-[11px] text-muted-foreground">
                        <CornerDownRight className="size-3 shrink-0" />
                        <span className="truncate">{task.parent.title}</span>
                      </span>
                    ) : null}
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

      <BulkBar
        selected={[...selected]}
        members={members}
        canEdit={canEdit}
        onClear={clearSelection}
        onDone={() => router.refresh()}
      />

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
