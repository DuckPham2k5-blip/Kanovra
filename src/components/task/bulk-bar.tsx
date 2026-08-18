"use client";

import { Priority, TaskStatus } from "@prisma/client";
import { Check, Trash2, UserPlus, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PRIORITY_META, TASK_STATUS_META } from "@/lib/constants";
import { bulkDeleteTasks, bulkUpdateTasks } from "@/server/actions/task";
import type { MemberDTO } from "@/types";

/**
 * What you can do to a selection, and the only place that says how many there
 * are.
 *
 * Fixed to the bottom of the viewport rather than placed in the board's own
 * flow: a Kanban column scrolls, and a bar that scrolls with it is a bar you
 * lose while collecting the very cards it acts on.
 *
 * Every action here goes through one server call for the whole selection, not
 * one per task. Server Actions are rate-limited per signed-in user in
 * middleware, so a client loop over twenty cards spends twenty of that
 * allowance and the tail of the selection quietly fails — which reads as "bulk
 * edit works sometimes".
 */
export function BulkBar({
  selected,
  members,
  canEdit,
  onClear,
  onDone,
}: {
  selected: string[];
  members: MemberDTO[];
  canEdit: boolean;
  onClear: () => void;
  /** Called after a successful write, so the page can refresh itself. */
  onDone: () => void;
}) {
  const [busy, setBusy] = React.useState(false);

  if (!selected.length || !canEdit) return null;

  async function run(
    label: string,
    call: () => Promise<{ success: boolean; error?: string; data?: unknown }>,
  ) {
    setBusy(true);
    try {
      const result = await call();
      if (!result.success) {
        toast.error(result.error ?? "That did not work.");
        return;
      }

      /*
       * The count is reported, not assumed. A selection is assembled from a page
       * that may be seconds out of date, and tasks somebody else has already
       * deleted are skipped server-side — saying "9 updated" when six were would
       * leave three cards on screen with no explanation for why they did not
       * change.
       */
      const counts = result.data as { updated?: number; deleted?: number; skipped?: number };
      const done = counts?.updated ?? counts?.deleted ?? selected.length;
      const skipped = counts?.skipped ?? 0;
      toast.success(skipped ? `${label}: ${done} done, ${skipped} skipped` : `${label}: ${done}`);

      onClear();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-full border bg-background/95 px-2 py-1.5 shadow-lg backdrop-blur">
        <span className="px-2 text-sm font-medium tabular-nums">{selected.length} selected</span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" disabled={busy}>
              Status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuLabel>Move to</DropdownMenuLabel>
            {Object.values(TaskStatus).map((status) => (
              <DropdownMenuItem
                key={status}
                onClick={() =>
                  void run(TASK_STATUS_META[status].label, () =>
                    bulkUpdateTasks({ taskIds: selected, status }),
                  )
                }
              >
                {TASK_STATUS_META[status].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" disabled={busy}>
              Priority
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuLabel>Set priority</DropdownMenuLabel>
            {Object.values(Priority).map((priority) => (
              <DropdownMenuItem
                key={priority}
                onClick={() =>
                  void run(PRIORITY_META[priority].label, () =>
                    bulkUpdateTasks({ taskIds: selected, priority }),
                  )
                }
              >
                {PRIORITY_META[priority].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" disabled={busy}>
              <UserPlus className="size-4" /> Assign
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel>Assign to</DropdownMenuLabel>
            {members.map((member) => (
              <DropdownMenuItem
                key={member.id}
                onClick={() =>
                  void run(`Assigned to ${member.name}`, () =>
                    bulkUpdateTasks({ taskIds: selected, assigneeId: member.id }),
                  )
                }
              >
                <UserAvatar user={member} showTooltip={false} className="size-5" />
                {member.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {/* `null` clears it. `undefined` would mean "leave it alone", which
                is the difference between unassigning nine tasks and doing
                nothing at all to them. */}
            <DropdownMenuItem
              onClick={() =>
                void run("Unassigned", () =>
                  bulkUpdateTasks({ taskIds: selected, assigneeId: null }),
                )
              }
            >
              <X className="size-4" /> Nobody
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" disabled={busy} aria-label="Delete selected">
              <Trash2 className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          {/* Confirmation as a menu rather than a dialog: the bar is already a
              transient surface, and a modal over a selection you can no longer
              see is a worse way to ask. */}
          <DropdownMenuContent align="center">
            <DropdownMenuLabel>Delete {selected.length} tasks?</DropdownMenuLabel>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => void run("Deleted", () => bulkDeleteTasks({ taskIds: selected }))}
            >
              <Check className="size-4" /> Yes, delete them
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button size="sm" variant="ghost" onClick={onClear} aria-label="Clear selection">
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
