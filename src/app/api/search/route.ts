import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchWorkspace } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Backs the ⌘K palette. Scoped to one workspace the caller belongs to. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const slug = params.get("slug");
  const q = params.get("q") ?? "";
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspace: { slug } },
    select: { workspaceId: true },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const results = await searchWorkspace(membership.workspaceId, q);
  return NextResponse.json(results);
}
