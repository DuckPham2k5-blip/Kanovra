"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import * as React from "react";

import { UserAvatar, type AvatarUser } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { fromNow } from "@/lib/date";

const PAGE = 5;

export type ActivityItem = {
  id: string;
  message: string;
  createdAt: string | Date;
  actor: AvatarUser | null;
  project: { name: string } | null;
};

/**
 * The workspace's activity, five at a time.
 *
 * A dozen entries pushed everything below the fold on the overview page, and
 * an activity feed is glanceable by nature — you read the top of it and move
 * on. Anything older is one click away rather than in the way.
 *
 * Revealing in place rather than linking to a separate page: the question
 * behind "show more" is almost always "and what happened just before that?",
 * which is answered by the next few lines, not by a change of context.
 */
export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const [shown, setShown] = React.useState(PAGE);
  const visible = items.slice(0, shown);
  const remaining = items.length - visible.length;

  if (items.length === 0) {
    return (
      <div className="tf-card">
        <p className="p-6 text-center text-sm text-muted-foreground">No activity yet.</p>
      </div>
    );
  }

  return (
    <div className="tf-card divide-y">
      {visible.map((item) => (
        <div key={item.id} className="flex gap-3 p-3">
          <UserAvatar user={item.actor} className="mt-0.5 size-7" />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug">{item.message}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {fromNow(item.createdAt)}
              {item.project ? ` · ${item.project.name}` : ""}
            </p>
          </div>
        </div>
      ))}

      {/* Both directions, side by side once there is something to collapse.
          A list that only ever grows leaves you scrolling back past everything
          you opened to reach the rest of the page. */}
      {remaining > 0 || shown > PAGE ? (
        <div className="flex gap-1 p-2">
          {remaining > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 text-xs text-muted-foreground"
              onClick={() => setShown((n) => n + PAGE)}
            >
              <ChevronDown className="size-3.5" /> Show {Math.min(PAGE, remaining)} more
            </Button>
          ) : null}

          {shown > PAGE ? (
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 text-xs text-muted-foreground"
              onClick={() => setShown(PAGE)}
            >
              <ChevronUp className="size-3.5" /> Collapse
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
