"use client";

import { MessageSquare, Send, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { UserAvatar, type AvatarUser } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { fromNow } from "@/lib/date";
import { cn } from "@/lib/utils";
import {
  createMindMapComment,
  deleteMindMapComment,
} from "@/server/actions/mind-map-comment";

export type NodeComment = {
  id: string;
  nodeId: string;
  body: string;
  createdAt: Date;
  author: AvatarUser;
  /** Whether the signed-in reader wrote it — decided on the server. */
  mine: boolean;
};

/**
 * The comments on one node, in a panel of their own.
 *
 * One panel for the whole canvas rather than a popover per node. Every Radix
 * popover on a page draws an id from the same `useId` counter, and a canvas is
 * an arbitrary number of nodes — which is the hydration trap this project has
 * already paid for twice. A single panel has one id and cannot drift.
 *
 * It also suits the content: a thread is a column of text, and a column of text
 * hanging off a box on a zoomable plane is either unreadable at 40% or larger
 * than the node it belongs to at 200%. The panel sits outside the transform, so
 * comments are always the size of comments.
 */
export function MindMapNodeComments({
  mapId,
  nodeId,
  nodeLabel,
  comments,
  canComment,
  onClose,
}: {
  mapId: string;
  nodeId: string;
  nodeLabel: string;
  comments: NodeComment[];
  canComment: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const mine = comments.filter((comment) => comment.nodeId === nodeId);

  async function post() {
    const text = body.trim();
    if (!text) return;

    setBusy(true);
    try {
      const result = await createMindMapComment({ mapId, nodeId, body: text });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setBody("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const result = await deleteMindMapComment(id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <aside className="absolute bottom-4 right-4 top-4 z-20 flex w-80 flex-col rounded-xl border bg-background/95 shadow-lg backdrop-blur">
      <header className="flex shrink-0 items-start gap-2 border-b px-3 py-2.5">
        <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Comments</p>
          <p className="truncate text-xs text-muted-foreground">
            {nodeLabel || "Untitled node"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close comments"
          className="rounded p-1 text-muted-foreground hover:bg-accent"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {mine.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing here yet. A comment is about the node, not part of it — it
            posts on its own and survives whatever happens to the drawing.
          </p>
        ) : (
          mine.map((comment) => (
            <div key={comment.id} className="group flex gap-2">
              <UserAvatar user={comment.author} className="mt-0.5 size-6 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-1.5 text-xs">
                  <span className="font-medium">{comment.author.name}</span>
                  <span className="text-muted-foreground">{fromNow(comment.createdAt)}</span>
                </p>
                {/* Plain text, deliberately. A comment is somebody else's string
                    and rendering it as markup is how a note becomes script. */}
                <p className="whitespace-pre-wrap break-words text-sm">{comment.body}</p>
              </div>
              {comment.mine ? (
                <button
                  type="button"
                  onClick={() => void remove(comment.id)}
                  aria-label="Delete this comment"
                  className="h-fit rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      {canComment ? (
        <div className="shrink-0 border-t p-2">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Add a comment…"
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter breaks the line. A thread is mostly one
              // sentence, and reaching for a button after every one of them is
              // the slowest part of a conversation.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void post();
              }
            }}
            className={cn(
              "w-full resize-none rounded-md border bg-background px-2 py-1.5 text-sm outline-none",
              "placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
            )}
          />
          <div className="mt-1.5 flex justify-end">
            <Button size="sm" disabled={busy || !body.trim()} onClick={() => void post()}>
              <Send className="size-3.5" /> Comment
            </Button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
