"use client";

import { Loader2, Sparkles } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { aiDraftDescription } from "@/server/actions/ai";

/**
 * Drafts a task description from its title. The result is handed back to the
 * parent rather than saved, so the user edits and saves it the same way they
 * would text they typed.
 */
export function AiDraftButton({
  projectId,
  title,
  existing,
  onDrafted,
}: {
  projectId: string;
  title: string;
  existing?: string;
  onDrafted: (text: string) => void;
}) {
  const [loading, setLoading] = React.useState(false);

  async function draft() {
    if (!title.trim()) {
      toast.info("Add a title first — the draft is written from it.");
      return;
    }
    setLoading(true);
    try {
      const result = await aiDraftDescription({
        projectId,
        title,
        existing: existing?.trim() ? existing : undefined,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (!result.data) {
        toast.info("Nothing came back — try rephrasing the title.");
        return;
      }
      onDrafted(result.data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs"
      onClick={() => void draft()}
      disabled={loading}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
      {loading ? "Writing…" : existing?.trim() ? "Improve with AI" : "Draft with AI"}
    </Button>
  );
}
