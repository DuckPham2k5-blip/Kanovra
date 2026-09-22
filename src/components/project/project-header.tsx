"use client";

import type { ProjectStatus, Role } from "@prisma/client";
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  KanbanSquare,
  List,
  Globe,
  MoreHorizontal,
  ImagePlus,
  Pencil,
  Trash2,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSelectedLayoutSegment } from "next/navigation";
import { useTheme } from "next-themes";
import * as React from "react";
import { toast } from "sonner";

import { AiProjectSummary } from "@/components/ai/ai-project-summary";
import { ProjectIcon } from "@/components/icon-picker";
import { ProjectBannerDialog } from "@/components/project/project-banner-dialog";
import { ProjectDialog } from "@/components/project/project-dialog";
import { ProjectMembersDialog } from "@/components/project/project-members-dialog";
import { ShareDialog, type ShareLinkState } from "@/components/project/share-dialog";
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
import { SimpleTooltip } from "@/components/ui/tooltip";
import { useRegion } from "@/components/settings/region-provider";
import { bannerPresetCss, isLightBanner } from "@/lib/project-banners";
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
  bannerPreset: string | null;
  bannerImageId: string | null;
  bannerImageUrl: string | null;
  bannerPositionY: number;
  bannerPresetDark: string | null;
  bannerImageIdDark: string | null;
  bannerImageUrlDark: string | null;
  bannerPositionYDark: number;
};

const TABS = [
  { segment: "board", label: "Board", icon: KanbanSquare },
  { segment: "list", label: "List", icon: List },
  { segment: "calendar", label: "Calendar", icon: CalendarDays },
] as const;

/**
 * The hue of a `#rrggbb` colour, 0–359, or null when it has none to give.
 *
 * This is what lets the header wear its own project's tone: the light `ph-*`
 * tokens are all built on one `--ph-hue`, and the header sets that from the
 * project's colour — a pink project gets a pink header, a blue one blue. A grey
 * (no chroma) returns null so the header keeps the default violet rather than
 * snapping to an arbitrary hue that a rounding error picked.
 */
function hueOf(color: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 0.01) return null;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = Math.round(h * 60);
  return h < 0 ? h + 360 : h;
}

export function ProjectHeader({
  workspaceSlug,
  workspaceId,
  project,
  members,
  workspaceMembers,
  role,
  canEditProject,
  canDeleteProject,
  canShare,
  shareLink,
}: {
  workspaceSlug: string;
  workspaceId: string;
  project: ProjectInfo;
  members: UserDTO[];
  workspaceMembers: MemberDTO[];
  role: Role;
  canEditProject: boolean;
  canDeleteProject: boolean;
  /** `project:share` — ADMIN. Publishing a board is not a member-level act. */
  canShare: boolean;
  /** The live link, or null. Loaded only for people who may manage it. */
  shareLink: ShareLinkState;
}) {
  const router = useRouter();
  const segment = useSelectedLayoutSegment();
  const { formatDate } = useRegion();
  const [editOpen, setEditOpen] = React.useState(false);
  const [membersOpen, setMembersOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [bannerOpen, setBannerOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);

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

  /*
   * The banner is stored per theme, so the header shows the set that matches
   * the viewer's current one. `resolvedTheme` is only known after mount, so the
   * server and the first client render both use the light set (no hydration
   * mismatch) and it switches to the dark set a frame later if the viewer is in
   * dark mode.
   */
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  const activeBanner = isDark
    ? {
        preset: project.bannerPresetDark,
        imageId: project.bannerImageIdDark,
        imageUrl: project.bannerImageUrlDark,
        positionY: project.bannerPositionYDark,
      }
    : {
        preset: project.bannerPreset,
        imageId: project.bannerImageId,
        imageUrl: project.bannerImageUrl,
        positionY: project.bannerPositionY,
      };

  // Only one source is ever set per theme — each mode clears the others — so
  // this is a preference order for reading, not a contest.
  const bannerImage = activeBanner.imageId
    ? `/api/project-banner/${project.id}${isDark ? "?theme=dark" : ""}`
    : activeBanner.imageUrl;
  const bannerCss = bannerPresetCss(activeBanner.preset);
  const hasBanner = Boolean(bannerImage || bannerCss);

  // The header's light palette follows the project's own hue; `--ph-hue` drives
  // every `ph-*` token. Merged with whatever banner variables are set, so the
  // tone applies whether or not the header carries a backdrop.
  const headerHue = hueOf(project.color);
  const headerStyle: React.CSSProperties = {
    ...(headerHue !== null ? ({ "--ph-hue": String(headerHue) } as React.CSSProperties) : {}),
    ...(bannerImage
      ? ({
          "--tf-banner": `url("${bannerImage}")`,
          // Only meaningful for a picture: a gradient has no band to choose.
          "--tf-banner-position": `center ${activeBanner.positionY}%`,
        } as React.CSSProperties)
      : bannerCss
        ? ({ "--tf-banner": bannerCss } as React.CSSProperties)
        : {}),
  };

  return (
    <div
      className={cn(
        // Colours come from the `ph-*` header palette (globals.css / tailwind
        // config), never named here — light gets a calm lavender scheme, dark is
        // mapped back to the app tokens and unchanged.
        "relative shrink-0 overflow-hidden border-b border-ph-border px-4 pt-4 sm:px-6",
        hasBanner ? "tf-project-banner" : "tf-project-header",
      )}
      style={headerStyle}
    >
      {/* A scrim, not a fade. An uploaded photograph can be any brightness, and
          white text over an unknown picture is a coin toss; this puts a known
          floor under it. Gradients are dark by construction and get the same
          treatment for consistency rather than need. */}
      {hasBanner ? (
        <div
          className={cn(
            "tf-project-banner-scrim",
            // A pale preset is veiled the other way round — see the CSS. Only a
            // known light *preset*; an uploaded picture keeps the default veil,
            // since its brightness is unknown.
            isLightBanner(activeBanner.preset) && "tf-banner-light",
          )}
          aria-hidden="true"
        />
      ) : null}

      <div className="relative z-10 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${project.color}1f` }}
          >
            <ProjectIcon name={project.icon} color={project.color} className="size-5" />
          </span>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold tracking-tight text-ph-primary sm:text-xl">
                {project.name}
              </h1>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-ph-muted">
                {project.key}
              </span>
              {/* The Active pill takes the header's refined green in light; the
                  merge drops the badge's default emerald and the dark variant is
                  left in place, so dark stays as it was. Other statuses keep
                  their own colour. */}
              <ProjectStatusBadge
                status={project.status}
                className={project.status === "ACTIVE" ? "bg-ph-status-surface text-ph-status" : undefined}
              />
              {project.archived ? (
                <span className="text-xs text-ph-muted">(archived)</span>
              ) : null}
              {/* A board that is public should look public, on the page itself
                  rather than only inside the dialog that published it. Whoever
                  is working on this board is the person most likely to notice a
                  link that should have been turned off weeks ago — and they
                  cannot notice it from a menu they have no reason to open.
                  Drawn only for people who could act on it, since a badge that
                  a member can see and do nothing about is an alarm with no
                  switch. */}
              {canShare && shareLink ? (
                <SimpleTooltip label="This board has a public link. Anyone holding it can see the board.">
                  <button
                    type="button"
                    onClick={() => setShareOpen(true)}
                    className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
                  >
                    <Globe className="size-3" />
                    Public
                  </button>
                </SimpleTooltip>
              ) : null}
            </div>

            <p className="mt-0.5 line-clamp-1 text-sm text-ph-secondary">
              {project.description || "No description"}
            </p>

            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ph-muted">
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
                <DropdownMenuItem onClick={() => setBannerOpen(true)}>
                  <ImagePlus /> Backdrop
                </DropdownMenuItem>
                {canShare ? (
                  <DropdownMenuItem onClick={() => setShareOpen(true)}>
                    <Globe /> {shareLink ? "Manage public link" : "Share board"}
                  </DropdownMenuItem>
                ) : null}
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
      <div className="relative z-10 mt-3">
        <AiProjectSummary projectId={project.id} />
      </div>

      {/* View tabs */}
      <nav className="relative z-10 mt-4 flex gap-1 overflow-x-auto">
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
                  ? "border-ph-accent font-medium text-ph-primary"
                  : "border-transparent text-ph-muted hover:text-ph-primary",
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

      <ProjectBannerDialog
        open={bannerOpen}
        onOpenChange={setBannerOpen}
        projectId={project.id}
        theme={isDark ? "dark" : "light"}
        currentPreset={activeBanner.preset}
        hasImage={Boolean(bannerImage)}
        imageUrl={bannerImage}
        positionY={activeBanner.positionY}
      />

      {canShare ? (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          projectId={project.id}
          projectName={project.name}
          link={shareLink}
        />
      ) : null}

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
