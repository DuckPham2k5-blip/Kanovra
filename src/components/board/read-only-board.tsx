// Straight from the module that holds the card, never through `task-card`,
// which re-exports it beside `SortableTaskCard`. That re-export is a
// convenience for existing callers and a 50 kB trap for this one: importing
// the name through it pulls the whole of `@dnd-kit` into a page where nothing
// can be dragged. Measured out of `.next`, not reasoned about — the barrel
// looks free from the import line.
import { TaskCardContent } from "@/components/board/task-card-content";
import type { ColumnDTO, TaskCardDTO } from "@/types";

/**
 * The board as a stranger sees it.
 *
 * A separate component from `KanbanBoard`, and the reason is not styling — it
 * is that this one imports no server action, no drag context and no dialog. A
 * public page rendered by passing `canEdit={false}` into the real board would
 * still ship every action reference in that tree to somebody with no session,
 * on a route where middleware deliberately does not call `auth.protect()`. The
 * writes would each be refused by `requireUser()`, so it would not be a hole —
 * but "safe because twenty-six checks all hold" is a worse property than "there
 * is no write path in the bundle", and only one of the two can be verified by
 * reading a single file.
 *
 * What it does *not* duplicate is the card. `TaskCardContent` is the same
 * component members see — it was already factored out for the drag overlay —
 * so a card cannot come to look like a different product here.
 *
 * No `"use client"`: this renders on the server and ships nothing but HTML.
 * `TaskCardContent` is a client component and stays one, which is what carries
 * the badges and the tooltip.
 */
export function ReadOnlyBoard({
  columns,
  tasks,
  projectKey,
}: {
  columns: ColumnDTO[];
  tasks: TaskCardDTO[];
  projectKey: string;
}) {
  const grouped = new Map<string, TaskCardDTO[]>();
  for (const column of columns) grouped.set(column.id, []);

  /*
   * A task whose column has gone — or which never had one — is dropped rather
   * than piled into the first column. On the members' board that case is
   * reachable and recoverable; here nobody can move it back, so a card in a
   * column it does not belong to would be a permanent lie about where the work
   * is. The count in the header is drawn from the same grouping, so the numbers
   * cannot disagree with the cards under them.
   */
  for (const task of tasks) {
    if (!task.columnId) continue;
    grouped.get(task.columnId)?.push(task);
  }

  return (
    <div className="tf-scroll-x flex h-full gap-4 px-4 pb-4 sm:px-6">
      {columns.map((column) => {
        const columnTasks = grouped.get(column.id) ?? [];
        return (
          <div
            key={column.id}
            className="flex w-[19rem] shrink-0 flex-col rounded-xl border bg-muted/40"
          >
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: column.color }}
              />
              <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{column.name}</h3>
              <span className="shrink-0 rounded-full bg-background px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                {columnTasks.length}
              </span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {columnTasks.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">Nothing here</p>
              ) : (
                columnTasks.map((task) => (
                  <TaskCardContent key={task.id} task={task} projectKey={projectKey} />
                ))
              )}
            </div>
          </div>
        );
      })}

      {columns.length === 0 ? (
        <p className="py-10 text-sm text-muted-foreground">This board has no columns yet.</p>
      ) : null}
    </div>
  );
}
