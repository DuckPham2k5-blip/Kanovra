import { NextResponse } from "next/server";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { Readable } from "node:stream";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isInlineSafe, readAttachment } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Streams a task attachment to a member of the workspace that owns it.
 *
 * This route is the whole reason uploads are kept outside `public/`: an
 * attachment belongs to a private workspace, so every download re-checks
 * membership rather than trusting that the URL is hard to guess.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const attachment = await prisma.attachment.findUnique({
    where: { id },
    select: {
      name: true,
      mimeType: true,
      size: true,
      task: { select: { project: { select: { workspaceId: true } } } },
    },
  });

  // A missing row and a row in someone else's workspace both answer 404, so
  // this never confirms that an id exists to someone who cannot read it.
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspaceId: attachment.task.project.workspaceId },
    select: { id: true },
  });
  if (!membership) return new NextResponse("Not found", { status: 404 });

  const file = await readAttachment(id);
  if (!file) return new NextResponse("Not found", { status: 404 });

  // Only a short allowlist renders in place. Everything else downloads, so an
  // uploaded .html or .svg can never execute script on our own origin.
  const inline = isInlineSafe(attachment.mimeType);
  const filename = encodeURIComponent(attachment.name);

  return new NextResponse(Readable.toWeb(file.stream) as NodeReadableStream as BodyInit, {
    headers: {
      "Content-Type": inline ? attachment.mimeType! : "application/octet-stream",
      "Content-Length": String(file.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
