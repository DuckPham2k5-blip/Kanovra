import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getNotifications, getUnreadCount } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Polled by the topbar bell every 30s. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const take = Math.min(Number(new URL(req.url).searchParams.get("take") ?? 8), 30);
  const [unread, items] = await Promise.all([
    getUnreadCount(user.id),
    getNotifications(user.id, take),
  ]);

  return NextResponse.json({
    unread,
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      read: n.read,
      createdAt: n.createdAt,
      actor: n.actor,
      workspaceSlug: n.workspace.slug,
    })),
  });
}
