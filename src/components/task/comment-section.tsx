"use client";

import { AtSign, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { fromNow } from "@/lib/date";
import { createComment, deleteComment } from "@/server/actions/comment";
import type { MemberDTO, UserDTO } from "@/types";

type Comment = {
  id: string;
  content: string;
  createdAt: string;
  author: UserDTO;
};

/** Renders `@handle` mentions as highlighted spans. */
function renderContent(content: string) {
  return content.split(/(@[a-zA-Z0-9._-]{2,64})/g).map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="rounded bg-primary/10 px-1 font-medium text-primary">
        {part}
      </span>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

export function CommentSection({
  taskId,
  comments,
  members,
  currentUserId,
  canComment,
  canDeleteAny,
}: {
  taskId: string;
  comments: Comment[];
  members: MemberDTO[];
  currentUserId: string;
  canComment: boolean;
  canDeleteAny: boolean;
}) {
  const router = useRouter();
  const [content, setContent] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  async function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    const value = content.trim();
    if (!value) return;

    setPending(true);
    try {
      const result = await createComment({ taskId, content: value });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setContent("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(commentId: string) {
    const result = await deleteComment({ commentId });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  function insertMention(handle: string) {
    setContent((c) => `${c}${c && !c.endsWith(" ") ? " " : ""}@${handle} `);
    textareaRef.current?.focus();
  }

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold">Bình luận ({comments.length})</h3>

      <ul className="space-y-4">
        {comments.map((comment) => (
          <li key={comment.id} className="group flex gap-3">
            <UserAvatar user={comment.author} className="mt-0.5 size-7" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{comment.author.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {fromNow(comment.createdAt)}
                </span>
                {comment.author.id === currentUserId || canDeleteAny ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => void handleDelete(comment.id)}
                    aria-label="Xoá bình luận"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed">
                {renderContent(comment.content)}
              </p>
            </div>
          </li>
        ))}

        {comments.length === 0 ? (
          <li className="text-sm text-muted-foreground">Chưa có bình luận nào.</li>
        ) : null}
      </ul>

      {canComment ? (
        <form onSubmit={handleSubmit} className="space-y-2">
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              // Ctrl/⌘ + Enter submits, matching the rest of the app.
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void handleSubmit();
            }}
            rows={3}
            placeholder="Viết bình luận… dùng @ để nhắc đến ai đó"
          />
          <div className="flex items-center gap-2">
            <DropdownMenu>
              {/* Explicit id — see the comment in sidebar.tsx's workspace switcher. */}
              <DropdownMenuTrigger asChild id="comment-mention-trigger">
                <Button type="button" variant="outline" size="sm">
                  <AtSign className="size-4" /> Nhắc đến
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                <DropdownMenuLabel>Thành viên</DropdownMenuLabel>
                {members.map((member) => (
                  <DropdownMenuItem
                    key={member.id}
                    onClick={() => insertMention((member.email ?? "").split("@")[0])}
                  >
                    <UserAvatar user={member} className="size-5" showTooltip={false} />
                    <span className="truncate">{member.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              type="submit"
              size="sm"
              className="ml-auto"
              loading={pending}
              disabled={!content.trim()}
            >
              <Send className="size-4" /> Gửi
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
