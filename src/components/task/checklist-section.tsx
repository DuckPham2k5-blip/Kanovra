"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn, percent } from "@/lib/utils";
import {
  addChecklistItem,
  deleteChecklistItem,
  toggleChecklistItem,
} from "@/server/actions/checklist";

type Item = { id: string; title: string; done: boolean };

export function ChecklistSection({
  taskId,
  items,
  canEdit,
}: {
  taskId: string;
  items: Item[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [optimistic, setOptimistic] = React.useState(items);
  const [draft, setDraft] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  React.useEffect(() => setOptimistic(items), [items]);

  const doneCount = optimistic.filter((i) => i.done).length;
  const progress = percent(doneCount, optimistic.length);

  async function handleToggle(item: Item, done: boolean) {
    setOptimistic((list) => list.map((i) => (i.id === item.id ? { ...i, done } : i)));
    const result = await toggleChecklistItem({ itemId: item.id, done });
    if (!result.success) {
      setOptimistic(items);
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;

    setAdding(true);
    try {
      const result = await addChecklistItem({ taskId, title });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setDraft("");
      router.refresh();
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(itemId: string) {
    setOptimistic((list) => list.filter((i) => i.id !== itemId));
    const result = await deleteChecklistItem({ itemId });
    if (!result.success) {
      setOptimistic(items);
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Checklist</h3>
        {optimistic.length > 0 ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            {doneCount}/{optimistic.length}
          </span>
        ) : null}
      </div>

      {optimistic.length > 0 ? <Progress value={progress} /> : null}

      <ul className="space-y-1">
        {optimistic.map((item) => (
          <li key={item.id} className="group flex items-center gap-2.5 rounded-md px-1 py-1.5 hover:bg-muted/60">
            <Checkbox
              id={`chk-${item.id}`}
              checked={item.done}
              disabled={!canEdit}
              onCheckedChange={(checked) => void handleToggle(item, checked === true)}
            />
            <label
              htmlFor={`chk-${item.id}`}
              className={cn(
                "flex-1 cursor-pointer text-sm leading-snug",
                item.done && "text-muted-foreground line-through",
              )}
            >
              {item.title}
            </label>
            {canEdit ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className="opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => void handleDelete(item.id)}
                aria-label="Delete item"
              >
                <Trash2 className="size-3.5" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {canEdit ? (
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add an item…"
            className="h-8"
          />
          <Button type="submit" size="icon-sm" loading={adding} disabled={!draft.trim()} aria-label="Add">
            <Plus className="size-4" />
          </Button>
        </form>
      ) : null}

      {optimistic.length === 0 && !canEdit ? (
        <p className="text-sm text-muted-foreground">Nothing here yet.</p>
      ) : null}
    </section>
  );
}
