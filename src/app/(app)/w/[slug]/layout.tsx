import { AppShell } from "@/components/layout/app-shell";
import { getUserWorkspaces, requireWorkspace } from "@/lib/auth";
import { getUnreadCount } from "@/lib/queries";
import { prisma } from "@/lib/prisma";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user, workspace, role } = await requireWorkspace(slug);

  const [workspaces, projects, unreadCount] = await Promise.all([
    getUserWorkspaces(user.id),
    prisma.project.findMany({
      where: { workspaceId: workspace.id, archived: false },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, key: true, color: true, icon: true },
    }),
    getUnreadCount(user.id),
  ]);

  return (
    <AppShell
      user={{ id: user.id, name: user.name, email: user.email, imageUrl: user.imageUrl }}
      workspace={{
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        color: workspace.color,
      }}
      workspaces={workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        slug: w.slug,
        color: w.color,
        role: w.role,
      }))}
      projects={projects}
      role={role}
      unreadCount={unreadCount}
    >
      {children}
    </AppShell>
  );
}
