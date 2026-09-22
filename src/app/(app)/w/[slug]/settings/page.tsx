import { format } from "date-fns";
import type { Metadata } from "next";
import { Building2 } from "lucide-react";

import { SettingsView, type SettingsOverview } from "@/components/settings/settings-view";
import { PageHeader } from "@/components/shared/page-header";
import { LabelManager } from "@/components/workspace/label-manager";
import { WorkspaceDangerZone } from "@/components/workspace/workspace-danger-zone";
import { WorkspaceSettingsForm } from "@/components/workspace/workspace-settings-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/auth";
import { providerStatus } from "@/lib/ai-providers";
import { prisma } from "@/lib/prisma";
import { ROLE_LABEL } from "@/lib/permissions";
import { getNotificationPreferences } from "@/server/actions/notification-prefs";

export const metadata: Metadata = { title: "Settings" };

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { workspace, role, user, can } = await requireWorkspace(slug);

  // Every workspace this person belongs to — the footprint the personal
  // overview counts across, not just the current one.
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id },
    select: { workspaceId: true },
  });
  const workspaceIds = memberships.map((m) => m.workspaceId);

  const [
    labels,
    memberCount,
    workspaceProjectCount,
    owner,
    totalProjects,
    totalTasks,
    notificationPrefs,
  ] = await Promise.all([
      prisma.label.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { name: "asc" },
        include: { _count: { select: { tasks: true } } },
      }),
      prisma.workspaceMember.count({ where: { workspaceId: workspace.id } }),
      prisma.project.count({ where: { workspaceId: workspace.id } }),
      prisma.user.findUnique({
        where: { id: workspace.ownerId },
        select: { name: true, email: true },
      }),
      prisma.project.count({ where: { workspaceId: { in: workspaceIds } } }),
      prisma.task.count({ where: { project: { workspaceId: { in: workspaceIds } } } }),
      getNotificationPreferences(user.id),
    ]);

  const overview: SettingsOverview = {
    plan: "Free",
    memberSince: format(user.createdAt, "MMM d, yyyy"),
    workspaces: workspaceIds.length,
    projects: totalProjects,
    tasks: totalTasks,
  };

  // The chat-capable models the person can actually pick, from whatever
  // providers are configured. The free built-in is always among them.
  const aiModels = providerStatus(process.env)
    .filter((p) => p.configured)
    .flatMap((p) =>
      p.models
        .filter((m) => m.capabilities.includes("text"))
        .map((m) => ({ id: m.id, label: `${m.label} · ${p.label}` })),
    );

  const workspaceSlot = (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>
            The name, description and accent colour shown across the app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkspaceSettingsForm
            workspace={{
              id: workspace.id,
              name: workspace.name,
              slug: workspace.slug,
              description: workspace.description,
              color: workspace.color,
            }}
            canEdit={can("workspace:update")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Labels</CardTitle>
          <CardDescription>
            Labels are shared across every project in this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LabelManager
            workspaceId={workspace.id}
            labels={labels.map((l) => ({
              id: l.id,
              name: l.name,
              color: l.color,
              taskCount: l._count.tasks,
            }))}
            canManage={can("workspace:manage_labels")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Identifier (slug)</dt>
              <dd className="mt-0.5 font-mono text-sm">{workspace.slug}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Owner</dt>
              <dd className="mt-0.5 truncate text-sm">
                {owner?.name ?? "—"}
                {owner?.email ? (
                  <span className="text-muted-foreground"> · {owner.email}</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Members</dt>
              <dd className="mt-0.5 text-sm">{memberCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Projects</dt>
              <dd className="mt-0.5 text-sm">{workspaceProjectCount}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <WorkspaceDangerZone
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        isOwner={workspace.ownerId === user.id}
        canDelete={can("workspace:delete")}
      />
    </div>
  );

  const organizationSlot = (
    <div className="mx-auto w-full max-w-3xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="size-[18px]" />
            </div>
            <div>
              <CardTitle>Organization</CardTitle>
              <CardDescription>Settings that span every workspace you belong to.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Workspaces</dt>
              <dd className="mt-0.5 text-2xl font-semibold">{overview.workspaces}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Projects</dt>
              <dd className="mt-0.5 text-2xl font-semibold">{overview.projects}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Tasks</dt>
              <dd className="mt-0.5 text-2xl font-semibold">{overview.tasks}</dd>
            </div>
          </dl>
          <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
            Organization-level controls — SSO, verified domains and org-wide roles — are planned.
            Today each workspace is managed on its own tab.
          </p>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="flex flex-col">
      <PageHeader title="Settings" description={`Your role here: ${ROLE_LABEL[role]}.`} />
      <SettingsView
        overview={overview}
        aiModels={aiModels}
        notificationPrefs={notificationPrefs}
        workspaceSlot={workspaceSlot}
        organizationSlot={organizationSlot}
      />
    </div>
  );
}
