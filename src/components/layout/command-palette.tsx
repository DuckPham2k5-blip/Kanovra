"use client";

import type { Priority, TaskStatus } from "@prisma/client";
import {
  BarChart3,
  Bell,
  CalendarDays,
  FolderKanban,
  Keyboard,
  LayoutDashboard,
  ListChecks,
  Settings,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import type { ShellProject } from "@/components/layout/app-shell";
import { ProjectIcon } from "@/components/icon-picker";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { PRIORITY_META, TASK_STATUS_META } from "@/lib/constants";

type SearchResults = {
  projects: { id: string; name: string; key: string; color: string; icon: string }[];
  tasks: {
    id: string;
    title: string;
    number: number;
    status: TaskStatus;
    priority: Priority;
    project: { id: string; key: string; color: string };
  }[];
};

const EMPTY: SearchResults = { projects: [], tasks: [] };

export function CommandPalette({
  open,
  onOpenChange,
  workspaceSlug,
  projects,
  onShowShortcuts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
  projects: ShellProject[];
  /**
   * Opens the shortcuts sheet.
   *
   * The sheet is bound to `?`, which nobody can press without already knowing
   * it exists — so the one entry point that *is* advertised, the ⌘K chip in the
   * top bar, has to lead there too. Otherwise the whole feature is discoverable
   * only by reading the source.
   */
  onShowShortcuts?: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResults>(EMPTY);
  const base = `/w/${workspaceSlug}`;

  // Debounced server search; short queries fall back to the local project list.
  React.useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults(EMPTY);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?slug=${encodeURIComponent(workspaceSlug)}&q=${encodeURIComponent(q)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (res.ok) setResults((await res.json()) as SearchResults);
      } catch {
        // Aborted or offline — keep whatever is on screen.
      }
    }, 220);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, open, workspaceSlug]);

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  const navItems = [
    { label: "Overview", href: base, icon: LayoutDashboard },
    { label: "My tasks", href: `${base}/my-tasks`, icon: ListChecks },
    { label: "Projects", href: `${base}/projects`, icon: FolderKanban },
    { label: "Calendar", href: `${base}/calendar`, icon: CalendarDays },
    { label: "Analytics", href: `${base}/analytics`, icon: BarChart3 },
    { label: "Notifications", href: `${base}/notifications`, icon: Bell },
    { label: "Members", href: `${base}/members`, icon: Users },
    { label: "Settings", href: `${base}/settings`, icon: Settings },
  ];

  const projectList = results.projects.length > 0 ? results.projects : projects;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Quick search">
      <CommandInput
        placeholder="Search projects, tasks, or jump to a page…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {results.tasks.length > 0 ? (
          <>
            <CommandGroup heading="Tasks">
              {results.tasks.map((task) => (
                <CommandItem
                  key={task.id}
                  value={`task-${task.id}-${task.title}`}
                  onSelect={() =>
                    go(`${base}/projects/${task.project.id}/board?task=${task.id}`)
                  }
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: TASK_STATUS_META[task.status].color }}
                  />
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {task.project.key}-{task.number}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{task.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {PRIORITY_META[task.priority].label}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        ) : null}

        {projectList.length > 0 ? (
          <>
            <CommandGroup heading="Projects">
              {projectList.map((project) => (
                <CommandItem
                  key={project.id}
                  value={`project-${project.id}-${project.name}`}
                  onSelect={() => go(`${base}/projects/${project.id}/board`)}
                >
                  <ProjectIcon name={project.icon} color={project.color} />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {project.key}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        ) : null}

        <CommandGroup heading="Navigation">
          {navItems.map(({ label, href, icon: Icon }) => (
            <CommandItem key={href} value={`nav-${label}`} onSelect={() => go(href)}>
              <Icon />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>

        {onShowShortcuts ? (
          <CommandGroup heading="Help">
            <CommandItem
              value="keyboard shortcuts"
              onSelect={() => {
                onOpenChange(false);
                onShowShortcuts();
              }}
            >
              <Keyboard />
              Keyboard shortcuts
            </CommandItem>
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
