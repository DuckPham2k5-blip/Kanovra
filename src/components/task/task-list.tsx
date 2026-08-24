"use client";

import { TaskStatus } from "@prisma/client";
import {
  ArrowUpDown,
  ChevronRight,
  CornerDownRight,
  Filter,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { DueBadge, LabelChip, PriorityBadge, StatusBadge } from "@/components/shared/badges";
import { UserAvatar } from "@/components/shared/user-avatar";
import { BulkBar } from "@/components/task/bulk-bar";
import { SavedViews, type SavedViewDTO } from "@/components/task/saved-views";
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
import { deleteTask, restoreDeletedTasks, toggleTaskDone } from "@/server/actions/task";
import type { LabelDTO, MemberDTO, TaskCardDTO } from "@/types";

const ALL = "__all__";

/**
 * A search param clamped to the values that mean something here.
 *
 * Anything else — a stale link, a typo, a label since deleted — comes back as
 * "all". The alternative is passing the value through to a `Select`, which then
 * renders empty: a filter that is doing something the person cannot see, on a
 * screen whose whole job is to say what is being shown.
 */
function oneOf(value: string | null, allowed: readonly string[]): string {
  return value && allowed.includes(value) ? value : ALL;
}

const SORT_KEYS = ["manual", "due", "priority", "title", "status"] as const;
type SortKey = (typeof SORT_KEYS)[number];

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
  workspaceId,
  savedViews,
  currentUserId,
  canManageViews,
}: {
  tasks: ListTask[];
  members: MemberDTO[];
  labels: LabelDTO[];
  projectId?: string;
  projectKey?: string;
  canEdit: boolean;
  showProject?: boolean;
  emptyHint?: string;
  /** Saved views need a workspace to belong to; absent, the control is hidden. */
  workspaceId?: string;
  savedViews?: SavedViewDTO[];
  currentUserId?: string;
  /** Whether this person may delete a view somebody else shared. */
  canManageViews?: boolean;
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

  /*
   * The filters live in the URL, not in component state.
   *
   * Held in state they were private and temporary: a narrowed list could not be
   * sent to anybody, a reload lost it, and the detail panel — which already puts
   * `?task=` in the URL — was the only part of this screen anyone could link to.
   * The panel's own close handler has said "keeping any filters the user had
   * applied" since long before there were any to keep.
   *
   * `replace`, not `push`. Every keystroke and every dropdown would otherwise be
   * a history entry, and Back would walk out of a search one letter at a time
   * instead of leaving the page.
   *
   * A value the URL cannot account for falls back to "all" rather than being
   * passed through: a link with `?status=nonsense` should cost that one filter,
   * not leave a select rendering blank with no way to tell what it is doing.
   */
  const setFilters = React.useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    },
    [router, searchParams],
  );

  const status = oneOf(searchParams.get("status"), TASK_STATUS_ORDER);
  const priority = oneOf(searchParams.get("priority"), PRIORITY_ORDER);
  const assignee = oneOf(searchParams.get("assignee"), [
    "unassigned",
    ...members.map((member) => member.id),
  ]);
  const labelId = oneOf(searchParams.get("label"), labels.map((label) => label.id));
  const sort = (oneOf(searchParams.get("sort"), SORT_KEYS) === ALL
    ? "manual"
    : searchParams.get("sort")) as SortKey;

  /*
   * The one that is not read straight off the URL.
   *
   * A search box has to answer the keystroke, and writing to the URL on each one
   * would re-render the route thirty times a sentence. So the box keeps its own
   * value and the URL catches up once the typing stops — and the effect below
   * puts the box back in step when the URL moves on its own, which is what a
   * pasted link and the Back button both do.
   */
  const urlQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = React.useState(urlQuery);
  React.useEffect(() => setQuery(urlQuery), [urlQuery]);

  React.useEffect(() => {
    if (query === urlQuery) return;
    const timer = setTimeout(() => setFilters({ q: query.trim() ? query : null }), 300);
    return () => clearTimeout(timer);
  }, [query, urlQuery, setFilters]);

  /*
   * Open already when the link arrived carrying filters.
   *
   * Somebody following a shared link would otherwise meet a short list with the
   * reason folded away behind a button — the list is narrowed, and nothing they
   * did narrowed it. The count on the button says how many, but not which.
   */
  const [showFilters, setShowFilters] = React.useState(
    () => status !== ALL || priority !== ALL || assignee !== ALL || labelId !== ALL,
  );
  const [createOpen, setCreateOpen] = React.useState(false);

  /** Whether anything is narrowing the list right now. */
  const filtering =
    query.trim() !== "" ||
    status !== ALL ||
    priority !== ALL ||
    assignee !== ALL ||
    labelId !== ALL;

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
      /*
       * Folds spring open while a filter is running.
       *
       * A subtask here is a subtask that *matched*, and leaving it folded means
       * searching for one and being shown only its parent — reported exactly
       * that way. It is not a corner case in this data either: a subtask is
       * named after its parent ("… — bước 2"), so any search that finds one
       * finds the other, and the child was the one being hidden.
       */
      if (open.has(task.id) || filtering) {
        for (const kid of kids) out.push({ task: kid, child: true, kids: [] });
      }
    }
    return out;
  }, [filtered, open, filtering]);

  rowsRef.current = rows;

  /**
   * The ids a bulk action actually receives: everything picked, plus the
   * subtasks of anything picked.
   *
   * Choosing a parent chooses what it contains — a delete would take them anyway
   * through the cascade, and a status change that left half a task behind is the
   * odd answer. The *count* stays the number picked, because a subtask is part of
   * its parent rather than another thing beside it, and the number on screen has
   * to mean what the rows mean.
   */
  const actingOn = React.useMemo(() => {
    const out = new Set(selected);
    for (const task of tasks) {
      if (task.parentId && selected.has(task.parentId)) out.add(task.id);
    }
    return [...out];
  }, [selected, tasks]);

  /**
   * How many tasks this list is *about*, before any filter.
   *
   * A subtask counts as part of its parent, so it counts here only when its
   * parent is absent — on "My tasks" that is the common case, and a step
   * assigned to you with its parent elsewhere really is one of your tasks.
   */
  const topLevelTotal = React.useMemo(() => {
    const all = new Set(tasks.map((task) => task.id));
    return tasks.filter((task) => !task.parentId || !all.has(task.parentId)).length;
  }, [tasks]);

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
    // The box is cleared here as well as in the URL: it holds its own value
    // while typing, so dropping the param alone would leave the old text on
    // screen filtering nothing.
    setQuery("");
    setFilters({ status: null, priority: null, assignee: null, label: null, q: null });
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
    // A repeating task has just made its successor, and the row for it appears
    // on the next refresh with no other sign that anything happened.
    if (result.data.repeated) toast.success("Next one created.");

    // Said, not refused. Finishing something that was still waiting is allowed —
    // see `toggleTaskDone` — and this is the only place the person finds out.
    if (result.data.stillWaiting > 0) {
      toast.warning(
        `Marked done, but it was still waiting on ${result.data.stillWaiting} unfinished ${
          result.data.stillWaiting === 1 ? "task" : "tasks"
        }.`,
      );
    }
    router.refresh();
  }

  /**
   * Removes one task from its row, and offers it straight back.
   *
   * The same shape as the bulk delete: no confirmation, because the toast holds
   * Undo for twelve seconds and a dialog in front of a reversible action only
   * costs a click. The handle is an id — the snapshot stays on the server, so
   * nothing here could restore a task into somewhere it did not come from.
   */
  async function handleDelete(task: ListTask) {
    const result = await deleteTask({ taskId: task.id });
    if (!result.success) {
      toast.error(result.error);
      return;
    }

    const undoId = result.data?.undoId;
    const label = `${task.project?.key ?? projectKey}-${task.number} deleted`;

    if (undoId) {
      toast.success(label, {
        duration: 12_000,
        action: {
          label: "Undo",
          onClick: () => {
            void restoreDeletedTasks(undoId).then((back) => {
              if (!back.success) {
                toast.error(back.error ?? "That could not be undone.");
                return;
              }
              toast.success("Task restored.");
              router.refresh();
            });
          },
        },
      });
    } else {
      toast.success(label);
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

        {workspaceId && currentUserId ? (
          <SavedViews
            workspaceId={workspaceId}
            projectId={projectId ?? null}
            views={savedViews ?? []}
            currentUserId={currentUserId}
            canManage={!!canManageViews}
          />
        ) : null}

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

        <Select value={sort} onValueChange={(v) => setFilters({ sort: v === "manual" ? null : v })}>
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

        {/* Top-level rows, both sides.
            
            This counted every task in the array, and the project list started
            loading subtasks so the parents would have something to fold — which
            made a project of thirty read as forty-five overnight. The number is
            read as "how much is in this project", and a subtask is part of its
            parent rather than another item beside it, so it counts as neither
            half of the fraction. */}
        <span className="ml-auto text-sm text-muted-foreground">
          {rows.filter((row) => !row.child).length}/{topLevelTotal}
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
          <Select value={status} onValueChange={(v) => setFilters({ status: v === ALL ? null : v })}>
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

          <Select value={priority} onValueChange={(v) => setFilters({ priority: v === ALL ? null : v })}>
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

          <Select value={assignee} onValueChange={(v) => setFilters({ assignee: v === ALL ? null : v })}>
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
            <Select value={labelId} onValueChange={(v) => setFilters({ label: v === ALL ? null : v })}>
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
                  ? `${selected.size} selected · click a row to add or remove, Shift-click for a range, Esc to clear`
                  : "Select all · Ctrl-click a row to start"}
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
                  "group/row flex items-center gap-3 py-2.5 pr-3 transition-colors hover:bg-muted/50",
                  // Indented, and on a tinted ground, so a subtask reads as part
                  // of the row above rather than as the next task down.
                  child ? "bg-muted/25 pl-10" : "pl-3",
                  index > 0 && "border-t",
                  picked && "bg-primary/10 hover:bg-primary/15",
                )}
                onClick={(event) => {
                  /*
                   * Ctrl or ⌘ picks one, Shift takes a range — what anybody who
                   * has used a file list tries first.
                   *
                   * And once *anything* is picked, a plain click picks and
                   * unpicks too. Select-all followed by "now drop these three"
                   * otherwise needed a modifier nobody had been told about. The
                   * bulk bar is on screen throughout saying how many are held,
                   * and Escape or its ✕ leaves, so the mode cannot be entered by
                   * accident or left stuck.
                   */
                  if (!canEdit) return;
                  if (event.shiftKey) {
                    event.preventDefault();
                    selectRange(index);
                  } else if (event.ctrlKey || event.metaKey || selected.size > 0) {
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
                  onClick={(event) => {
                    // The row is handling the press while a selection is being
                    // assembled; opening the task on top of that would take the
                    // page away mid-gesture.
                    if (canEdit && selected.size > 0) return;
                    event.stopPropagation();
                    openTask(task);
                  }}
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
                    {/* What this is a step of, on its own line.
                        
                        It shared the title's line first and was squeezed to
                        nothing between the task key and a long title — invisible,
                        and reported as missing. Down here nothing competes with
                        it for width. Only when the parent is not already the row
                        directly above: on "My tasks" a subtask arrives alone,
                        because assignment does not follow the tree. */}
                    {task.parent && !child ? (
                      <span className="inline-flex max-w-full items-center gap-1 text-[11px] text-muted-foreground">
                        <CornerDownRight className="size-3 shrink-0" />
                        <span className="truncate">{task.parent.title}</span>
                      </span>
                    ) : null}
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

                {/* Delete, on the row, on hover.
                    
                    It was reachable only through the `…` inside the detail panel,
                    which is two steps away and was reported as "there is no
                    delete button". Kept out of the way until the pointer is on
                    the row, and revealed to the keyboard by focus as well —
                    `opacity-0` alone would leave it tabbable but invisible.
                    
                    No confirmation dialog. The toast carries Undo for twelve
                    seconds, which is the same promise the bulk delete makes, and
                    a dialog in front of an action that is already reversible buys
                    nothing but a second click. */}
                {canEdit ? (
                  <button
                    type="button"
                    aria-label={`Delete ${task.title}`}
                    title="Delete"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDelete(task);
                    }}
                    className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover/row:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <BulkBar
        selected={actingOn}
        count={selected.size}
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
