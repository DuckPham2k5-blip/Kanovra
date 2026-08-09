"use client";

import type { NotificationType } from "@prisma/client";
import * as Icons from "lucide-react";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { NOTIFICATION_META } from "@/lib/constants";
import { fromNow } from "@/lib/date";
import { cn, initials } from "@/lib/utils";
import { markAllNotificationsRead, markNotificationRead } from "@/server/actions/notification";

type Item = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
  actor: { id: string; name: string; imageUrl: string | null } | null;
};

const POLL_MS = 30_000;

export function NotificationBell({
  initialCount,
  workspaceSlug,
}: {
  initialCount: number;
  workspaceSlug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [unread, setUnread] = React.useState(initialCount);
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?take=8", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { unread: number; items: Item[] };
      setUnread(data.unread);
      setItems(data.items);
    } catch {
      // Offline or a transient failure — the next tick will retry.
    }
  }, []);

  // Poll while the tab is visible; pause when it is hidden to save requests.
  React.useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    function start() {
      // Idempotent on purpose. `visibilitychange` can fire "visible" more than
      // once without an intervening "hidden" (alt-tab, restore from minimise),
      // and starting a second interval would orphan the first — `timer` would
      // only track the newest one, so `stop()` could never clear the rest.
      // Each leak adds another poller hitting the API forever.
      if (timer) return;
      void load();
      timer = setInterval(() => void load(), POLL_MS);
    }
    function stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    }
    function onVisibility() {
      if (document.visibilityState === "visible") start();
      else stop();
    }

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function handleOpenItem(item: Item) {
    setOpen(false);
    if (!item.read) {
      setUnread((n) => Math.max(0, n - 1));
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, read: true } : i)));
      await markNotificationRead(item.id);
    }
    if (item.link) router.push(item.link);
  }

  async function handleMarkAll() {
    setLoading(true);
    try {
      setUnread(0);
      setItems((list) => list.map((i) => ({ ...i, read: true })));
      await markAllNotificationsRead();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-4" />
          {unread > 0 ? (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold leading-4 text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleMarkAll}
            disabled={unread === 0 || loading}
          >
            <CheckCheck className="size-3.5" /> Mark all read
          </Button>
        </div>

        <div className="max-h-[22rem] overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              No notifications yet.
            </p>
          ) : (
            items.map((item) => {
              const meta = NOTIFICATION_META[item.type];
              const Icon =
                (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
                  meta?.icon ?? "Bell"
                ] ?? Bell;

              return (
                <button
                  key={item.id}
                  onClick={() => void handleOpenItem(item)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-accent",
                    !item.read && "bg-primary/5",
                  )}
                >
                  {item.actor ? (
                    <Avatar className="mt-0.5 size-7">
                      {item.actor.imageUrl ? <AvatarImage src={item.actor.imageUrl} alt="" /> : null}
                      <AvatarFallback>{initials(item.actor.name)}</AvatarFallback>
                    </Avatar>
                  ) : (
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Icon className="size-3.5" />
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug">{item.title}</span>
                    {item.body ? (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {item.body}
                      </span>
                    ) : null}
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {fromNow(item.createdAt)}
                    </span>
                  </span>

                  {!item.read ? (
                    <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        <div className="border-t p-2">
          <Button variant="ghost" size="sm" className="w-full" asChild onClick={() => setOpen(false)}>
            <Link href={`/w/${workspaceSlug}/notifications`}>View all</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
