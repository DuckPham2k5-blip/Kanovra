import type { Metadata } from "next";

import { NotificationCenter } from "@/components/notifications/notification-center";
import { PageHeader } from "@/components/shared/page-header";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNotifications } from "@/lib/queries";

export const metadata: Metadata = { title: "Thông báo" };

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user } = await requireWorkspace(slug);

  const notifications = await getNotifications(user.id, 100);

  // Opening the page is an explicit "I've seen these", so clear the badge.
  // Individual rows keep their unread highlight for this render.
  const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
  if (unreadIds.length > 0) {
    await prisma.notification.updateMany({
      where: { id: { in: unreadIds } },
      data: { read: true },
    });
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Thông báo"
        description={
          notifications.length === 0
            ? "Bạn chưa có thông báo nào."
            : `${notifications.length} thông báo gần đây${
                unreadIds.length ? ` · ${unreadIds.length} mới` : ""
              }`
        }
      />

      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <NotificationCenter
          notifications={notifications.map((n) => ({
            id: n.id,
            type: n.type,
            title: n.title,
            body: n.body,
            link: n.link,
            // Rows rendered as unread are the ones we just marked read above.
            read: !unreadIds.includes(n.id),
            createdAt: n.createdAt.toISOString(),
            actor: n.actor
              ? { id: n.actor.id, name: n.actor.name, imageUrl: n.actor.imageUrl }
              : null,
            workspaceName: n.workspace.name,
          }))}
        />
      </div>
    </div>
  );
}
