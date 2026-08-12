import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * How stale a heartbeat may be before its owner counts as gone. Comfortably
 * more than the client's interval, so one dropped request — a sleeping laptop,
 * a lost second of wifi — does not make someone flicker offline and back.
 */
const ONLINE_WINDOW_MS = 26_000;

/**
 * Who is in this workspace right now.
 *
 * One call does both halves: it records that the caller is still here and
 * answers with everyone else who is. Splitting them would double the requests
 * for no gain, since a client that wants to know who is around is by
 * definition still around itself.
 *
 * Presence is a decaying timestamp rather than an online flag. A browser that
 * crashes, sleeps or loses its network never sends "I have left", so a flag
 * would stick at online until something else corrected it; a timestamp that
 * stops being refreshed expires on its own.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  let slug: string | undefined;
  let focus: string | null = null;
  try {
    const body = (await request.json()) as { slug?: string; focus?: unknown };
    slug = body.slug;
    /*
     * An opaque scope string, capped and never rendered.
     *
     * It is chosen by the caller's own browser and handed back out to their
     * teammates, so the only safe contract is that nobody displays it: clients
     * compare it for equality to decide whether to draw an avatar. The cap is
     * there because this is a column, and an uncapped client-chosen string in a
     * column is a place to put a megabyte.
     */
    if (typeof body.focus === "string" && body.focus.length <= 200) focus = body.focus;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!slug) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!workspace) return new Response("Not found", { status: 404 });

  // Same answer for "no such workspace" and "not yours", so this never confirms
  // a slug exists to someone who cannot see it.
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspaceId: workspace.id },
    select: { id: true },
  });
  if (!membership) return new Response("Not found", { status: 404 });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastSeenAt: new Date(), focus },
  });

  const since = new Date(Date.now() - ONLINE_WINDOW_MS);
  const online = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: workspace.id,
      user: { lastSeenAt: { gte: since } },
    },
    select: { userId: true, user: { select: { focus: true } } },
  });

  // Only for people who are actually here. A stale `focus` on a lapsed
  // heartbeat is where somebody *was*, and reporting it would leave an avatar
  // sitting on a node nobody has looked at for an hour — the exact failure a
  // decaying timestamp exists to avoid.
  const focused: Record<string, string> = {};
  for (const member of online) {
    if (member.user.focus) focused[member.userId] = member.user.focus;
  }

  return NextResponse.json(
    { you: user.id, online: online.map((m) => m.userId), focus: focused },
    { headers: { "Cache-Control": "no-store" } },
  );
}
