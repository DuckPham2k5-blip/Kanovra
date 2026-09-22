"use client";

import { Check, ChevronLeft, ChevronRight, CornerDownRight, Plus, Trash2, X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fillCss } from "@/lib/mind-map-fill";
import {
  type CanvasNode,
  formatTaskCount,
  NODE_TASK_LIMIT,
  type NodeTask,
  openTaskCount,
} from "@/lib/mind-map-canvas";
import { cn } from "@/lib/utils";

/**
 * The node detail panel: what a node is, its description, its checklist, and the
 * nodes hanging off it — with Previous/Next to walk the map without closing.
 *
 * It docks on the right, over the canvas but outside the pan-and-zoom transform,
 * so it stays put and readable while the drawing moves under it (the comment and
 * colour panels do the same), and slides in. Everything here is real data the
 * node already holds: its text, its own `note`, its `tasks`, and its children —
 * a map node is not a board task, so there is deliberately no status, assignee
 * or due date invented for it. Every change is handed back for the canvas to
 * write into the document, and its autosave persists it.
 */
export function MindMapNodeInfo({
  node,
  typeLabel,
  index,
  total,
  related,
  canEdit,
  onChangeTasks,
  onChangeNote,
  onFocus,
  onPrev,
  onNext,
  onClose,
}: {
  node: CanvasNode;
  typeLabel: string;
  /** 1-based position in the map, for the Previous/Next counter. */
  index: number;
  total: number;
  related: { id: string; text: string }[];
  canEdit: boolean;
  onChangeTasks: (tasks: NodeTask[]) => void;
  onChangeNote: (note: string) => void;
  onFocus: (id: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const tasks = node.tasks ?? [];
  const open = openTaskCount(node);
  const done = tasks.length - open;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const [draft, setDraft] = React.useState("");
  const full = tasks.length >= NODE_TASK_LIMIT;

  const chip = node.fill
    ? fillCss(node.fill)
    : "hsl(var(--primary))";

  function addTask() {
    const text = draft.trim();
    if (!text || full) return;
    onChangeTasks([
      ...tasks,
      {
        id: `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        text: text.slice(0, 200),
        done: false,
      },
    ]);
    setDraft("");
  }

  return (
    <aside className="absolute right-0 top-0 z-30 flex h-full w-[min(92vw,400px)] flex-col border-l bg-background/95 shadow-xl backdrop-blur animate-in slide-in-from-right duration-300 ease-out">
      {/* Header: the node's colour and emoji, its title, the map kind, and close. */}
      <header className="flex items-start gap-3 border-b p-4">
        <span
          aria-hidden
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-lg"
          style={{ background: node.emoji ? "transparent" : chip, boxShadow: node.emoji ? undefined : "inset 0 0 0 1px hsl(var(--border))" }}
        >
          {node.emoji || null}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {typeLabel} · Item
          </p>
          <p className="break-words text-sm font-semibold">{node.text || "Untitled"}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {/* Progress + the task count in the shape the owner asked for. */}
        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Subtasks</h3>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                open > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              {formatTaskCount(open)}
            </span>
          </div>

          {tasks.length > 0 ? (
            <div className="mb-2">
              <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  {done}/{tasks.length} done
                </span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : null}

          {tasks.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">
              No subtasks yet.{canEdit ? " Add one below." : ""}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {tasks.map((task) => (
                <li key={task.id} className="group flex items-start gap-2 rounded-md px-1 py-1.5 hover:bg-accent/50">
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() =>
                      onChangeTasks(tasks.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)))
                    }
                    aria-label={task.done ? "Mark not done" : "Mark done"}
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                      task.done
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40 hover:border-primary",
                    )}
                  >
                    {task.done ? <Check className="size-3" /> : null}
                  </button>
                  <span className={cn("min-w-0 flex-1 break-words text-sm", task.done && "text-muted-foreground line-through")}>
                    {task.text}
                  </span>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => onChangeTasks(tasks.filter((t) => t.id !== task.id))}
                      aria-label="Delete subtask"
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canEdit ? (
            <div className="mt-2 flex gap-2">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTask();
                  }
                }}
                placeholder={full ? "Subtask limit reached" : "Add a subtask…"}
                maxLength={200}
                disabled={full}
                aria-label="Add a subtask"
              />
              <Button size="icon" onClick={addTask} disabled={!draft.trim() || full} aria-label="Add subtask">
                <Plus className="size-4" />
              </Button>
            </div>
          ) : null}
        </section>

        {/* Description — the paragraph under the heading. */}
        <section>
          <h3 className="mb-1.5 text-sm font-semibold">Description</h3>
          {canEdit ? (
            <Textarea
              value={node.note ?? ""}
              onChange={(event) => onChangeNote(event.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="Describe this item…"
              aria-label="Description"
            />
          ) : node.note ? (
            <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{node.note}</p>
          ) : (
            <p className="text-xs text-muted-foreground">No description.</p>
          )}
        </section>

        {/* Related — the nodes that hang off this one. Clicking one moves the
            focus to it, so the map can be walked from the panel. */}
        {related.length > 0 ? (
          <section>
            <h3 className="mb-1.5 text-sm font-semibold">Related ({related.length})</h3>
            <ul className="space-y-0.5">
              {related.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onFocus(r.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{r.text || "Untitled"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {/* Previous / Next — walk the map without closing. */}
      <footer className="flex items-center justify-between gap-2 border-t p-3">
        <Button variant="outline" size="sm" onClick={onPrev} disabled={total < 2}>
          <ChevronLeft className="size-4" /> Prev
        </Button>
        <span className="text-xs tabular-nums text-muted-foreground">
          {index} / {total}
        </span>
        <Button variant="outline" size="sm" onClick={onNext} disabled={total < 2}>
          Next <ChevronRight className="size-4" />
        </Button>
      </footer>
    </aside>
  );
}
