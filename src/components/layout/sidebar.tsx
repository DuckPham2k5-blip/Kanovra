"use client";

import type { Role } from "@prisma/client";
import {
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronsUpDown,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { Logo, Wordmark } from "@/components/brand";
import { ProjectDialog } from "@/components/project/project-dialog";
import type { ShellProject, ShellWorkspace } from "@/components/layout/app-shell";
import { ProjectIcon } from "@/components/icon-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  exact?: boolean;
};

export function Sidebar({
  workspace,
  workspaces,
  projects,
  role,
  unreadCount,
  onNavigate,
}: {
  workspace: ShellWorkspace;
  workspaces: (ShellWorkspace & { role: Role })[];
  projects: ShellProject[];
  role: Role;
  unreadCount: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const base = `/w/${workspace.slug}`;
  const [projectDialogOpen, setProjectDialogOpen] = React.useState(false);

  const nav: NavItem[] = [
    { href: base, label: "Tổng quan", icon: LayoutDashboard, exact: true },
    { href: `${base}/my-tasks`, label: "Việc của tôi", icon: ListChecks },
    { href: `${base}/projects`, label: "Dự án", icon: FolderKanban },
    { href: `${base}/calendar`, label: "Lịch", icon: CalendarDays },
    { href: `${base}/analytics`, label: "Phân tích", icon: BarChart3 },
    { href: `${base}/notifications`, label: "Thông báo", icon: Bell, badge: unreadCount },
  ];

  const footerNav: NavItem[] = [
    { href: `${base}/members`, label: "Thành viên", icon: Users },
    { href: `${base}/settings`, label: "Cài đặt", icon: Settings },
  ];

  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Workspace switcher */}
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-3">
        <DropdownMenu>
          {/* Explicit id: Radix's auto-generated one can drift between the
              server render and the client's first hydration pass on pages
              with many dropdown triggers, which then cascades into a
              hydration-mismatch warning for every trigger after it. */}
          <DropdownMenuTrigger asChild id={`workspace-switcher-trigger-${workspace.id}`}>
            <button className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: workspace.color }}
              >
                {workspace.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{workspace.name}</span>
                <span className="block text-[11px] text-muted-foreground">Không gian làm việc</span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>Chuyển không gian</DropdownMenuLabel>
            {workspaces.map((ws) => (
              <DropdownMenuItem key={ws.id} asChild>
                <Link href={`/w/${ws.slug}`} onClick={onNavigate}>
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold text-white"
                    style={{ backgroundColor: ws.color }}
                  >
                    {ws.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate">{ws.name}</span>
                  {ws.slug === workspace.slug ? <Check className="ml-auto size-4" /> : null}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/onboarding?new=1" onClick={onNavigate}>
                <Plus /> Tạo không gian mới
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="flex-1">
        <nav className="space-y-1 p-3">
          {nav.map((item) => (
            <SidebarLink key={item.href} item={item} active={isActive(item)} onClick={onNavigate} />
          ))}
        </nav>

        <div className="px-3 pb-3">
          <div className="mb-1 flex items-center justify-between px-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Dự án
            </span>
            {can(role, "project:create") ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setProjectDialogOpen(true)}
                aria-label="Tạo dự án"
              >
                <Plus className="size-3.5" />
              </Button>
            ) : null}
          </div>

          <div className="space-y-0.5">
            {projects.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                Chưa có dự án nào.
              </p>
            ) : (
              projects.map((project) => {
                const href = `${base}/projects/${project.id}/board`;
                const active = pathname.startsWith(`${base}/projects/${project.id}`);
                return (
                  <Link
                    key={project.id}
                    href={href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-sidebar-accent font-medium text-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                    )}
                  >
                    <ProjectIcon name={project.icon} color={project.color} />
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {project.key}
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </ScrollArea>

      <div className="space-y-1 border-t border-sidebar-border p-3">
        {footerNav.map((item) => (
          <SidebarLink key={item.href} item={item} active={isActive(item)} onClick={onNavigate} />
        ))}
        <Link
          href="/"
          className="mt-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Logo className="size-5 rounded" />
          <Wordmark className="text-xs" />
        </Link>
      </div>

      <ProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        workspaceId={workspace.id}
        workspaceSlug={workspace.slug}
      />
    </div>
  );
}

function SidebarLink({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick?: () => void;
}) {
  const { icon: Icon } = item;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-accent font-medium text-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent/60",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge ? (
        <Badge variant="default" className="h-5 min-w-5 justify-center px-1.5 text-[10px]">
          {item.badge > 99 ? "99+" : item.badge}
        </Badge>
      ) : null}
    </Link>
  );
}
