"use client";

import { Loader2, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { AiBadge } from "@/components/ai/ai-badge";
import { Button } from "@/components/ui/button";
import type { SubtaskSuggestion } from "@/lib/ai";
import { aiSuggestSubtasks } from "@/server/actions/ai";
import { createTask } from "@/server/actions/task";

/**
 * Proposes a breakdown of a task into subtasks. Nothing is written until the
 * user adds a specific suggestion, so a poor suggestion costs one click to
 * dismiss and never leaves a trace on the board.
 */
export function AiSubtaskSuggestions({
  taskId,
  projectId,
}: {
  taskId: string;
  projectId: string;
}) {
  const router = useRouter();
  const [suggestions, setSuggestions] = React.useState<SubtaskSuggestion[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [adding, setAdding] = React.useState<string | null>(null);

  async function generate() {
    setLoading(true);
    try {
      const result = await aiSuggestSubtasks({ taskId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.data.length === 0) {
        toast.info("No suggestions this time — try adding a description first.");
        return;
      }
      setSuggestions(result.data);
    } finally {
      setLoading(false);
    }
  }

  async function add(suggestion: SubtaskSuggestion) {
    setAdding(suggestion.title);
    try {
      const result = await createTask({
        projectId,
        parentId: taskId,
        title: suggestion.title,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSuggestions((current) => current?.filter((s) => s.title !== suggestion.title) ?? null);
      router.refresh();
    } finally {
      setAdding(null);
    }
  }

  if (!suggestions) {
    return (
      <Button variant="outline" size="sm" onClick={() => void generate()} disabled={loading}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {loading ? "Thinking…" : "Suggest subtasks"}
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/[0.03] p-3">
      <div className="flex items-center gap-2">
        <AiBadge label="Suggested" />
        <span className="text-xs text-muted-foreground">Review before adding</span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void generate()}
            disabled={loading}
            aria-label="Regenerate suggestions"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSuggestions(null)}
            aria-label="Dismiss suggestions"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      <ul className="space-y-1.5">
        {suggestions.map((suggestion) => (
          <li
            key={suggestion.title}
            className="flex items-start gap-2 rounded-md bg-background px-3 py-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{suggestion.title}</span>
              <span className="block text-xs text-muted-foreground">{suggestion.reason}</span>
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void add(suggestion)}
              disabled={adding !== null}
              aria-label={`Add subtask ${suggestion.title}`}
            >
              {adding === suggestion.title ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
