"use client";

import { CircleSlash, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { blockerResolved } from "@/lib/task-dependencies";
import { cn } from "@/lib/utils";
import {
  addTaskDependency,
  findDependencyCandidates,
  removeTaskDependency,
} from "@/server/actions/task-dependency";
import type { DependencyLinkDTO } from "@/types";

/**
 * What a task is waiting on, and what is waiting on it.
 *
 * Two lists rather than one, and never merged: they are opposite facts and a
 * single list of "related tasks" would leave people working out the direction
 * from the wording every time they read it.
 *
 * Only the *waiting on* side can be edited here. The other side is a view of
 * somebody else's card — the row that says "B is waiting on this" belongs to B,
 * and B's own panel is where it is added and removed. Offering both here would
 * put the same fact in two places with two ways to change it, and the second
 * would eventually disagree with the first.
 */
export function DependencySection({
  taskId,
  projectKey,
  blockedBy,
  blocks,
  canEdit,
  onOpenTask,
}: {
  taskId: string;
  projectKey: string;
  blockedBy: DependencyLinkDTO[];
  blocks: DependencyLinkDTO[];
  canEdit: boolean;
  /** Opens another task in the same sheet, so a chain can be walked. */
  onOpenTask?: (id: string) => void;
}) {
  const router = useRouter();
  const [picking, setPicking] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [candidates, setCandidates] = React.useState<DependencyLinkDTO[]>([]);
  const [busy, setBusy] = React.useState(false);

  /*
   * Candidates are fetched, not filtered in the browser.
   *
   * The list has to exclude whatever would make a loop, and that is a walk over
   * the project's whole dependency graph — which this component does not have
   * and should not be sent on the chance somebody opens a picker.
   */
  React.useEffect(() => {
    if (!picking) return;
    let cancelled = false;

    const timer = setTimeout(async () => {
      const result = await findDependencyCandidates({ taskId, query });
      if (cancelled) return;
      if (result.success) setCandidates(result.data);
      else toast.error(result.error);
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [picking, query, taskId]);

  async function add(blockingTaskId: string) {
    setBusy(true);
    const result = await addTaskDependency({ blockedTaskId: taskId, blockingTaskId });
    setBusy(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setPicking(false);
    setQuery("");
    router.refresh();
  }

  async function remove(blockingTaskId: string) {
    setBusy(true);
    const result = await removeTaskDependency({ blockedTaskId: taskId, blockingTaskId });
    setBusy(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  const open = blockedBy.filter((link) => !blockerResolved(link.status)).length;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Waiting on ({blockedBy.length})
          {open > 0 ? (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
              <CircleSlash className="size-3" />
              {open} still open
            </span>
          ) : null}
        </h3>

        {canEdit ? (
          <Popover open={picking} onOpenChange={setPicking}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm">
                <Plus className="size-4" /> Add
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              {/* `shouldFilter={false}`: the server has already filtered, and it
                  filtered on things this list cannot see — what would make a
                  loop, and what is linked already. Letting Command filter again
                  on the label would hide rows the server deliberately kept. */}
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Search this project…"
                  value={query}
                  onValueChange={setQuery}
                />
                <CommandList>
                  <CommandEmpty>
                    Nothing to add. Tasks already linked, and anything that would make a
                    loop, are left out.
                  </CommandEmpty>
                  <CommandGroup>
                    {candidates.map((candidate) => (
                      <CommandItem
                        key={candidate.id}
                        value={candidate.id}
                        disabled={busy}
                        onSelect={() => void add(candidate.id)}
                      >
                        <span className="mr-2 shrink-0 font-mono text-[10px] text-muted-foreground">
                          {projectKey}-{candidate.number}
                        </span>
                        <span className="truncate">{candidate.title}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>

      <ul className="space-y-1">
        {blockedBy.map((link) => (
          <DependencyRow
            key={link.id}
            link={link}
            projectKey={projectKey}
            onOpen={onOpenTask}
            onRemove={canEdit ? () => void remove(link.id) : undefined}
            busy={busy}
          />
        ))}
        {blockedBy.length === 0 ? (
          <li className="text-sm text-muted-foreground">Not waiting on anything.</li>
        ) : null}
      </ul>

      {blocks.length > 0 ? (
        <div className="space-y-1 pt-1">
          <h4 className="text-xs font-medium text-muted-foreground">
            Waiting on this ({blocks.length})
          </h4>
          <ul className="space-y-1">
            {blocks.map((link) => (
              <DependencyRow
                key={link.id}
                link={link}
                projectKey={projectKey}
                onOpen={onOpenTask}
                busy={busy}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/**
 * One end of a link.
 *
 * A resolved blocker is struck through rather than removed from the list: it is
 * still a true statement about how the work was sequenced, and dropping it would
 * make the list shrink as things finish, which reads as somebody having deleted
 * them.
 */
function DependencyRow({
  link,
  projectKey,
  onOpen,
  onRemove,
  busy,
}: {
  link: DependencyLinkDTO;
  projectKey: string;
  onOpen?: (id: string) => void;
  onRemove?: () => void;
  busy: boolean;
}) {
  const resolved = blockerResolved(link.status);

  return (
    <li className="flex items-center gap-2.5 rounded-md border px-3 py-2">
      <CircleSlash
        className={cn("size-3.5 shrink-0", resolved ? "text-muted-foreground" : "text-amber-500")}
      />
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
        {projectKey}-{link.number}
      </span>
      <button
        type="button"
        disabled={!onOpen}
        onClick={() => onOpen?.(link.id)}
        className={cn(
          "min-w-0 flex-1 truncate text-left text-sm",
          resolved && "text-muted-foreground line-through",
          onOpen && "hover:underline",
        )}
      >
        {link.title}
      </button>
      {onRemove ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          disabled={busy}
          onClick={onRemove}
          aria-label={`Stop waiting on ${link.title}`}
        >
          <X className="size-3.5" />
        </Button>
      ) : null}
    </li>
  );
}
