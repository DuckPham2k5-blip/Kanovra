"use client";

import type { ProjectStatus, Role } from "@prisma/client";
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  KanbanSquare,
  List,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSelectedLayoutSegment } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { AiProjectSummary } from "@/components/ai/ai-project-summary";
import { ProjectIcon } from "@/components/icon-picker";
import { ProjectDialog } from "@/components/project/project-dialog";
import { ProjectMembersDialog } from "@/components/project/project-members-dialog";
import { ProjectStatusBadge } from "@/components/shared/badges";
import { AvatarStack } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { deleteProject, setProjectArchived } from "@/server/actions/project";
import type { MemberDTO, UserDTO } from "@/types";

type ProjectInfo = {
  id: string;
  name: string;
  key: string;
  description: string | null;
  color: string;
  icon: string;
  status: ProjectStatus;
  archived: boolean;
  startDate: string | null;
  dueDate: string | null;
  taskCount: number;
};

const TABS = [
  { segment: "board", label: "Board", icon: KanbanSquare },
  { segment: "list", label: "List", icon: List },
  { segment: "calendar", label: "Calendar", icon: CalendarDays },
] as const;

export function ProjectHeader({
  workspaceSlug,
  workspaceId,
  project,
  members,
  workspaceMembers,
  role,
  canEditProject,
  canDeleteProject,
}: {
  workspaceSlug: string;
  workspaceId: string;
  project: ProjectInfo;
  members: UserDTO[];
  workspaceMembers: MemberDTO[];
  role: Role;
  canEditProject: boolean;
  canDeleteProject: boolean;
}) {
  const router = useRouter();
  const segment = useSelectedLayoutSegment();
  const [editOpen, setEditOpen] = React.useState(false);
  const [membersOpen, setMembersOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const base = `/w/${workspaceSlug}/projects/${project.id}`;

  async function handleArchive() {
    const result = await setProjectArchived(project.id, !project.archived);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(project.archived ? "Project restored." : "Project archived.");
    router.refresh();
  }

  async function handleDelete() {
    const result = await deleteProject(project.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Project deleted.");
    router.push(`/w/${workspaceSlug}/projects`);
  }

  return (
    <div className="shrink-0 border-b bg-background px-4 pt-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${project.color}1f` }}
          >
            <ProjectIcon name={project.icon} color={project.color} className="size-5" />
          </span>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">
                {project.name}
              </h1>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {project.key}
              </span>
              <ProjectStatusBadge status={project.status} />
              {project.archived ? (
                <span className="text-xs text-muted-foreground">(archived)</span>
              ) : null}
            </div>

            <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
              {project.description || "No description"}
            </p>

            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>{project.taskCount} tasks</span>
              {project.dueDate ? <span>Due: {formatDate(project.dueDate)}</span> : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => canEditProject && setMembersOpen(true)}
            className={cn("rounded-full", canEditProject && "hover:opacity-80")}
            aria-label="Project members"
          >
            <AvatarStack users={members} max={4} showPresence />
          </button>

          {canEditProject ? (
            <Button
              variant="outline"
              size="sm"
              className="tf-bar-control"
              onClick={() => setMembersOpen(true)}
            >
              <UserPlus className="size-4" />
              <span className="hidden sm:inline">Members</span>
            </Button>
          ) : null}

          {canEditProject ? (
            <DropdownMenu>
              {/* Explicit id — see the comment in sidebar.tsx's workspace switcher. */}
              <DropdownMenuTrigger asChild id={`project-options-trigger-${project.id}`}>
                <Button variant="ghost" size="icon" aria-label="Project options">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleArchive()}>
                  {project.archived ? <ArchiveRestore /> : <Archive />}
                  {project.archived ? "Restore" : "Archive"}
                </DropdownMenuItem>
                {canDeleteProject ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                      <Trash2 /> Delete project
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      {/* On-demand AI read of the board. Full width so the generated summary
          has room to breathe once it expands. */}
      <div className="mt-3">
        <AiProjectSummary projectId={project.id} />
      </div>

      {/* View tabs */}
      <nav className="mt-4 flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const active = segment === tab.segment;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.segment}
              href={`${base}/${tab.segment}`}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
                active
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <ProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        project={{
          id: project.id,
          name: project.name,
          description: project.description,
          color: project.color,
          icon: project.icon,
          status: project.status,
          startDate: project.startDate,
          dueDate: project.dueDate,
        }}
      />

      <ProjectMembersDialog
        open={membersOpen}
        onOpenChange={setMembersOpen}
        projectId={project.id}
        projectMemberIds={members.map((m) => m.id)}
        workspaceMembers={workspaceMembers}
        canEdit={canEditProject}
        role={role}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete project "${project.name}"?`}
        description="Every task, comment and activity record in this project is deleted permanently."
        confirmLabel="Delete project"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
