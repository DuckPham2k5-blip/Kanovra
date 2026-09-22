"use client";

import { Pause, Play, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRegion } from "@/components/settings/region-provider";
import {
  entrySeconds,
  estimateProgress,
  formatDuration,
  isRunning,
  runningEntry,
  totalSeconds,
} from "@/lib/time-tracking";
import { cn } from "@/lib/utils";
import { deleteTimeEntry, logTime, startTimer, stopTimer } from "@/server/actions/time";
import type { TimeEntryDTO } from "@/types";

/**
 * Time actually spent, beside the estimate that was guessed.
 *
 * ## The running entry ticks in the browser
 *
 * A running entry has no end, so its length is the distance to *now*. That is
 * recomputed on a one-second interval here rather than fetched, because the
 * server has nothing new to say — it already handed over `startedAt`, and asking
 * it again every second would be a request per second per open panel to be told
 * a number the browser can work out. The same `entrySeconds` runs on both sides,
 * so the figure cannot drift between them.
 *
 * ## Only your own rows have controls
 *
 * Everyone sees everyone's time — that is the point of a shared total — but the
 * stop and remove buttons appear only on your own entries, matching the server,
 * which refuses the rest. Drawing a button that the action will decline teaches
 * people the interface lies.
 */
export function TimeSection({
  taskId,
  entries,
  estimate,
  currentUserId,
  canEdit,
}: {
  taskId: string;
  entries: TimeEntryDTO[];
  /** Hours, from the task. Null when nobody guessed. */
  estimate: number | null;
  currentUserId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { formatDate } = useRegion();
  const [pending, setPending] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [minutes, setMinutes] = React.useState("");
  const [note, setNote] = React.useState("");

  const mine = runningEntry(
    entries.map((e) => ({ ...e, userId: e.user.id })),
    currentUserId,
  );

  /*
   * One clock for the whole section, ticking only while something is running.
   *
   * A timer per row would be one interval per entry; a timer that never stops
   * would keep a tab busy for a panel showing nothing but finished work.
   */
  const [now, setNow] = React.useState(() => Date.now());
  const anyRunning = entries.some(isRunning);
  React.useEffect(() => {
    if (!anyRunning) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyRunning]);

  const total = totalSeconds(entries, now);
  const progress = estimateProgress(total, estimate);

  async function run(fn: () => Promise<{ success: boolean; error?: string }>, done?: () => void) {
    setPending(true);
    const result = await fn();
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Something went wrong.");
      return;
    }
    done?.();
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Time</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm tabular-nums text-muted-foreground">
            {total === 0 ? "None logged" : formatDuration(total)}
            {estimate ? ` of ${formatDuration(estimate * 3600)}` : null}
          </span>
        </div>
      </div>

      {progress ? (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", progress.over ? "bg-destructive" : "bg-primary")}
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          {/* The bar is capped at its own width; the sentence is not, or a task
              at triple its estimate would report as merely full. */}
          {progress.over ? (
            <p className="text-xs text-destructive">
              {formatDuration(progress.overBy * 3600)} over the estimate
            </p>
          ) : null}
        </div>
      ) : null}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          {mine ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => void run(() => stopTimer({ entryId: mine.id }))}
            >
              <Pause className="size-4" />
              Stop · {formatDuration(entrySeconds(mine, now))}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => void run(() => startTimer({ taskId }))}
            >
              <Play className="size-4" />
              Start timer
            </Button>
          )}

          <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)}>
            <Plus className="size-4" />
            Log time
          </Button>
        </div>
      ) : null}

      {adding && canEdit ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
          <div className="space-y-1">
            <label htmlFor="t-min" className="text-xs text-muted-foreground">
              Minutes
            </label>
            <Input
              id="t-min"
              type="number"
              min={1}
              max={1440}
              className="h-8 w-28"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="90"
            />
          </div>
          <div className="min-w-40 flex-1 space-y-1">
            <label htmlFor="t-note" className="text-xs text-muted-foreground">
              Note (optional)
            </label>
            <Input
              id="t-note"
              className="h-8"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What you worked on"
            />
          </div>
          <Button
            size="sm"
            disabled={pending || !minutes}
            onClick={() =>
              void run(
                () => logTime({ taskId, minutes: Number(minutes), note }),
                () => {
                  setMinutes("");
                  setNote("");
                  setAdding(false);
                },
              )
            }
          >
            Add
          </Button>
        </div>
      ) : null}

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No time logged yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {entries.map((entry) => {
            const running = isRunning(entry);
            const own = entry.user.id === currentUserId;
            return (
              <li key={entry.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <UserAvatar user={entry.user} className="size-6 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    {entry.note || <span className="text-muted-foreground">No note</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.user.name} · {formatDate(entry.startedAt)}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 tabular-nums",
                    running ? "font-medium text-primary" : "text-muted-foreground",
                  )}
                >
                  {formatDuration(entrySeconds(entry, now))}
                  {running ? " …" : null}
                </span>
                {own && canEdit ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0"
                    disabled={pending}
                    aria-label={running ? "Stop this timer" : "Remove this entry"}
                    onClick={() =>
                      void run(() =>
                        running ? stopTimer({ entryId: entry.id }) : deleteTimeEntry({ entryId: entry.id }),
                      )
                    }
                  >
                    {running ? <Pause className="size-3.5" /> : <X className="size-3.5" />}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
