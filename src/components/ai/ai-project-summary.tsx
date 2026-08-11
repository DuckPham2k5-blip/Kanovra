"use client";

import { Loader2, Sparkles, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { AiBadge } from "@/components/ai/ai-badge";
import { Button } from "@/components/ui/button";
import { aiSummariseProject } from "@/server/actions/ai";

/**
 * A short status read on a project, generated on demand from the board's own
 * data (column counts, overdue tasks, recent completions).
 */
export function AiProjectSummary({ projectId }: { projectId: string }) {
  const [summary, setSummary] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function generate() {
    setLoading(true);
    try {
      const result = await aiSummariseProject({ projectId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (!result.data) {
        toast.info("Not enough activity to summarise yet.");
        return;
      }
      setSummary(result.data);
    } finally {
      setLoading(false);
    }
  }

  if (!summary) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="tf-bar-control"
        onClick={() => void generate()}
        disabled={loading}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {loading ? "Reading the board…" : "AI summary"}
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <AiBadge label="Summary" />
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          onClick={() => setSummary(null)}
          aria-label="Dismiss summary"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{summary}</p>
    </div>
  );
}
