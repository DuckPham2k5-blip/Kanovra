"use client";

import { UserButton } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { Search } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";

import type { ShellUser, ShellWorkspace } from "@/components/layout/app-shell";
import { NotificationBell } from "@/components/layout/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";

export function Topbar({
  user,
  workspace,
  unreadCount,
  onOpenPalette,
  menuButton,
}: {
  user: ShellUser;
  workspace: ShellWorkspace;
  unreadCount: number;
  onOpenPalette: () => void;
  menuButton?: React.ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur sm:px-4">
      {menuButton}

      <button
        onClick={onOpenPalette}
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted sm:max-w-md"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">Tìm dự án, công việc…</span>
        <kbd className="ml-auto hidden shrink-0 rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] sm:inline-block">
          Ctrl K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <NotificationBell initialCount={unreadCount} workspaceSlug={workspace.slug} />
        <ThemeToggle />
        <div className="ml-1 flex items-center">
          {mounted ? (
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                baseTheme: resolvedTheme === "dark" ? dark : undefined,
                elements: { avatarBox: "size-8" },
              }}
            />
          ) : (
            <span className="size-8 rounded-full bg-muted" aria-hidden="true" />
          )}
        </div>
      </div>

      <span className="sr-only">
        Đăng nhập với tên {user.name} trong {workspace.name}
      </span>
    </header>
  );
}
