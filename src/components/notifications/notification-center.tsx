"use client";

import type { NotificationType } from "@prisma/client";
import { Bell, BellOff, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NOTIFICATION_META } from "@/lib/constants";
import { fromNow } from "@/lib/date";
import { resolveNamedIcon } from "@/lib/icon-registry";
import { cn } from "@/lib/utils";
import { clearReadNotifications, deleteNotification } from "@/server/actions/notification";

type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
  actor: { id: string; name: string; imageUrl: string | null } | null;
  workspaceName: string;
};

type Filter = "all" | "unread";

/** Resolves the lucide icon named in NOTIFICATION_META, with a safe fallback. */
function iconFor(type: NotificationType) {
  return resolveNamedIcon(NOTIFICATION_META[type]?.icon, Bell);
}

export function NotificationCenter({
  notifications,
}: {
  notifications: NotificationRow[];
}) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [items, setItems] = React.useState(notifications);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => setItems(notifications), [notifications]);

  const visible = filter === "unread" ? items.filter((n) => !n.read) : items;
  const unreadCount = items.filter((n) => !n.read).length;
  const readCount = items.length - unreadCount;

  function handleDelete(id: string) {
    // Optimistic removal — the row is gone either way, and a failed delete just
    // reappears on the next navigation.
    setItems((list) => list.filter((n) => n.id !== id));
    startTransition(async () => {
      const result = await deleteNotification(id);
      if (!result.success) {
        toast.error(result.error);
        router.refresh();
      }
    });
  }

  function handleClearRead() {
    startTransition(async () => {
      const result = await clearReadNotifications();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Read notifications cleared.");
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={BellOff}
        title="No notifications"
        description="When you are assigned work, mentioned, or someone comments, it shows up here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">All ({items.length})</TabsTrigger>
            <TabsTrigger value="unread">Unread ({unreadCount})</TabsTrigger>
          </TabsList>
        </Tabs>

        {readCount > 0 ? (
          <Button variant="outline" size="sm" onClick={handleClearRead} loading={pending}>
            {pending ? null : <Trash2 />}
            Clear read
          </Button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No unread notifications"
          description="You've seen everything."
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border">
          {visible.map((item) => {
            const Icon = iconFor(item.type);
            const body = (
              <>
                {item.actor ? (
                  <UserAvatar user={item.actor} className="mt-0.5 size-9" />
                ) : (
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug">{item.title}</p>
                  {item.body ? (
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                      {item.body}
                    </p>
                  ) : null}
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{NOTIFICATION_META[item.type]?.label ?? "Notifications"}</span>
                    <span aria-hidden>·</span>
                    <time dateTime={item.createdAt}>{fromNow(item.createdAt)}</time>
                  </p>
                </div>

                {!item.read ? (
                  <span
                    className="mt-2 size-2 shrink-0 rounded-full bg-primary"
                    aria-label="Unread"
                  />
                ) : null}
              </>
            );

            return (
              <li
                key={item.id}
                className={cn(
                  "group relative flex items-start gap-3 transition-colors hover:bg-muted/40",
                  !item.read && "bg-primary/5",
                )}
              >
                {item.link ? (
                  <Link href={item.link} className="flex flex-1 items-start gap-3 p-4">
                    {body}
                  </Link>
                ) : (
                  <div className="flex flex-1 items-start gap-3 p-4">{body}</div>
                )}

                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete notification"
                  className="absolute right-2 top-2 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={() => handleDelete(item.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
