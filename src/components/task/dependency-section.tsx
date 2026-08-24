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
import { blockerResolved } from "@/lib/task-dependencies";
import { cn } from "@/lib/utils";
import {
  addTaskDependency,
  findDependencyCandidates,
  removeTaskDependency,
} from "@/server/actions/task-dependency";
import type { DependencyLinkDTO } from "@/types";

/**
 * What blocks this task, and what it blocks.
 *
 * Two lists rather than one, and never merged: they are opposite facts and a
 * single list of "related tasks" would leave people working out the direction
 * from the wording every time they read it.
 *
 * Only the *blocked by* side can be edited here. The other side is a view of
 * somebody else's card — the row saying "B is waiting for this" belongs to B,
 * and B's own panel is where it is added and removed. Offering both here would
 * put one fact in two places with two ways to change it, and the second would
 * eventually disagree with the first.
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

  /*
   * Finished links are not drawn at all.
   *
   * They were, struck through, on the reasoning that a link is still a true
   * statement about how the work was sequenced and a list that shrinks as things
   * finish reads as somebody having deleted them. The owner asked for them gone,
   * and using it settles the argument: what the panel is *for* is knowing what
   * stands in the way now, and a done row answers a question nobody is asking
   * while taking the same space as one that matters.
   *
   * The rows are hidden, not the links — nothing is deleted. Reopen a blocker and
   * it is back in the list, which is the behaviour the alternative could not
   * offer at all.
   *
   * Both directions, not only the one that was asked about. Two lists side by
   * side, one filtered and one not, is the same trap the labels just fell into.
   */
  const openBlockedBy = blockedBy.filter((link) => !blockerResolved(link.status));
  const openBlocks = blocks.filter((link) => !blockerResolved(link.status));
  const doneBlockedBy = blockedBy.filter((link) => blockerResolved(link.status));
  const [showDone, setShowDone] = React.useState(false);

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between">
        {/* "Blocked by" and "Blocking", not "Waiting on" and "Waiting on this".
            The first pair was two headings differing by one trailing word while
            meaning opposite things, and the first person to read it looked at a
            task's empty "Waiting on" and asked why the link they had just made
            was not there — twice. A label that has to be explained is a label
            that is wrong, and the sub-line under each is there so it never has
            to be explained again. */}
        <div>
          {/* The count is of what is drawn. A heading saying 2 above one row is
              the kind of small disagreement that makes people distrust the
              whole panel, and the separate "still open" chip existed only
              because the two numbers used to differ. */}
          <h3 className="text-sm font-semibold">
            Blocked by ({openBlockedBy.length})
          </h3>
          <p className="text-xs text-muted-foreground">These have to finish first.</p>
        </div>

        {canEdit ? (
          <Button variant="ghost" size="sm" onClick={() => setPicking((was) => !was)}>
            <Plus className="size-4" /> {picking ? "Cancel" : "Add"}
          </Button>
        ) : null}
      </div>

      {/*
       * In the flow of the sheet, not in a popover.
       *
       * It was a popover, and the wheel did nothing inside it. A Radix dialog —
       * which this sheet is — locks scrolling everywhere outside its own content,
       * and a popover is portalled to `document.body`, so the list counted as
       * outside and its wheel events were swallowed. Turning the portal off fixes
       * the wheel and breaks the position instead: the sheet is a scrolling
       * column, and an absolutely-positioned layer inside one gets clipped by it.
       *
       * A block in normal flow has neither problem, scrolls with the panel it
       * lives in, and drops the nested-layer question altogether.
       */}
      {picking ? (
        <div className="rounded-md border">
          {/* `shouldFilter={false}`: the server has already filtered, and on
              things this list cannot see — what would close a loop, and what is
              linked already. Letting Command filter again on the label would
              hide rows the server deliberately kept. */}
          <Command shouldFilter={false}>
            <CommandInput
              autoFocus
              placeholder="Search this project…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-56">
              <CommandEmpty>
                Nothing to add. Tasks already linked, and anything that would make a loop,
                are left out.
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
        </div>
      ) : null}

      <ul className="space-y-1">
        {openBlockedBy.map((link) => (
          <DependencyRow
            key={link.id}
            link={link}
            projectKey={projectKey}
            onOpen={onOpenTask}
            onRemove={canEdit ? () => void remove(link.id) : undefined}
            busy={busy}
          />
        ))}
        {openBlockedBy.length === 0 ? (
          <li className="text-sm text-muted-foreground">Nothing is blocking this.</li>
        ) : null}

        {/* Hidden, but not unreachable.
            A link nobody can see is a link nobody can delete, and it comes back
            on its own the day somebody reopens the task at the other end. One
            muted line is enough to say the links exist and to get at them. */}
        {showDone
          ? doneBlockedBy.map((link) => (
              <DependencyRow
                key={link.id}
                link={link}
                projectKey={projectKey}
                onOpen={onOpenTask}
                onRemove={canEdit ? () => void remove(link.id) : undefined}
                busy={busy}
                finished
              />
            ))
          : null}
      </ul>

      {doneBlockedBy.length > 0 ? (
        <button
          type="button"
          onClick={() => setShowDone((was) => !was)}
          className="text-xs text-muted-foreground hover:underline"
        >
          {showDone
            ? "Hide finished"
            : `${doneBlockedBy.length} finished ${
                doneBlockedBy.length === 1 ? "link" : "links"
              } hidden`}
        </button>
      ) : null}

      {openBlocks.length > 0 ? (
        <div className="space-y-1 pt-1">
          <h4 className="text-xs font-medium">
            Blocking ({openBlocks.length})
            <span className="ml-2 font-normal text-muted-foreground">
              These are waiting for this one. Edit them on their own card.
            </span>
          </h4>
          <ul className="space-y-1">
            {openBlocks.map((link) => (
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
 * `finished` is passed rather than worked out from the status, because the two
 * lists have already decided which of them a row belongs to and a row that
 * recomputed it could disagree with the heading it sits under.
 */
function DependencyRow({
  link,
  projectKey,
  onOpen,
  onRemove,
  busy,
  finished,
}: {
  link: DependencyLinkDTO;
  projectKey: string;
  onOpen?: (id: string) => void;
  onRemove?: () => void;
  busy: boolean;
  finished?: boolean;
}) {
  return (
    <li className="flex items-center gap-2.5 rounded-md border px-3 py-2">
      <CircleSlash
        className={cn("size-3.5 shrink-0", finished ? "text-muted-foreground" : "text-amber-500")}
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
          finished && "text-muted-foreground line-through",
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
          aria-label={`No longer blocked by ${link.title}`}
        >
          <X className="size-3.5" />
        </Button>
      ) : null}
    </li>
  );
}
