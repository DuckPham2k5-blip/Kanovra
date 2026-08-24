"use client";

import { Bookmark, Check, Globe, Lock, Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { viewFilterCount, viewQuery } from "@/lib/saved-views";
import { cn } from "@/lib/utils";
import { createSavedView, deleteSavedView } from "@/server/actions/saved-view";

export type SavedViewDTO = {
  id: string;
  name: string;
  query: string;
  shared: boolean;
  createdById: string;
};

/**
 * Named filter sets for one list.
 *
 * Applying a view *replaces* the filters rather than adding to them. A view is a
 * whole answer to "what am I looking at" — merging it into whatever was already
 * set would produce a list matching neither, under the view's name.
 *
 * `?task=` is deliberately dropped when a view is applied, the same way it is
 * dropped when one is saved: the panel belongs to a moment, not to a view.
 */
export function SavedViews({
  workspaceId,
  projectId,
  views,
  currentUserId,
  canManage,
}: {
  workspaceId: string;
  /** Null on "My tasks", which spans the workspace. */
  projectId: string | null;
  views: SavedViewDTO[];
  currentUserId: string;
  /** Whether this person may delete somebody else's shared view. */
  canManage: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [naming, setNaming] = React.useState(false);
  const [name, setName] = React.useState("");
  const [shared, setShared] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const current = viewQuery(searchParams.toString());
  const active = views.find((view) => view.query === current);

  function apply(query: string) {
    router.replace(query ? `?${query}` : window.location.pathname, { scroll: false });
  }

  async function save() {
    setBusy(true);
    const result = await createSavedView({ workspaceId, projectId, name, query: current, shared });
    setBusy(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setNaming(false);
    setName("");
    setShared(false);
    toast.success("View saved.");
    router.refresh();
  }

  async function remove(viewId: string) {
    const result = await deleteSavedView(viewId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("View deleted.");
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className={cn(active && "border-primary/50")}>
            <Bookmark className="size-4" />
            {active ? active.name : "Views"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {views.length ? (
            <>
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Saved views
              </DropdownMenuLabel>
              {views.map((view) => {
                const mine = view.createdById === currentUserId;
                const count = viewFilterCount(view.query);
                return (
                  <DropdownMenuItem
                    key={view.id}
                    onSelect={() => apply(view.query)}
                    className="gap-2"
                  >
                    {view.id === active?.id ? (
                      <Check className="size-3.5 shrink-0" />
                    ) : view.shared ? (
                      <Globe className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <Lock className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{view.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {count === 1 ? "1 filter" : `${count} filters`}
                    </span>
                    {mine || canManage ? (
                      <button
                        type="button"
                        aria-label={`Delete ${view.name}`}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={(event) => {
                          // The row applies the view; the button inside it must
                          // not do both. Radix dispatches `onSelect` from the
                          // item's own click, so this has to stop before then.
                          event.preventDefault();
                          event.stopPropagation();
                          void remove(view.id);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
            </>
          ) : null}

          <DropdownMenuItem
            disabled={!current}
            onSelect={() => {
              setName("");
              setShared(false);
              setNaming(true);
            }}
          >
            <Plus className="size-4" />
            {current ? "Save these filters…" : "Filter something first"}
          </DropdownMenuItem>

          {active ? (
            <DropdownMenuItem onSelect={() => apply("")}>Clear the view</DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={naming} onOpenChange={setNaming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save this view</DialogTitle>
            <DialogDescription>
              {viewFilterCount(current) === 1
                ? "One filter, plus the sort order."
                : `${viewFilterCount(current)} filters, plus the sort order.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="view-name">Name</Label>
              <Input
                id="view-name"
                autoFocus
                value={name}
                maxLength={60}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && name.trim() && !busy) void save();
                }}
                placeholder="Mine, due this week"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="view-shared" className="font-normal">
                Share with the workspace
                <span className="block text-xs text-muted-foreground">
                  Everyone sees the view. It does not give anyone access to more tasks.
                </span>
              </Label>
              <Switch id="view-shared" checked={shared} onCheckedChange={setShared} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setNaming(false)}>
              Cancel
            </Button>
            <Button disabled={!name.trim() || busy} onClick={() => void save()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
