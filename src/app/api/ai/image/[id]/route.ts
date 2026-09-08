import { NextResponse, type NextRequest } from "next/server";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readAttachment } from "@/lib/storage";

/**
 * A picture the assistant made, served back.
 *
 * The same shape as `/api/attachments/[id]`: the bytes live outside the web
 * root under a generated id, and the check runs on every download rather than
 * once when the link was made. What is checked is narrower here, though —
 * attachments ask for workspace membership, and this asks whether the
 * conversation is *yours*. A conversation is private even from the people you
 * share a workspace with, so membership would be the wrong question.
 *
 * `id` is the message id, not the file id. That is deliberate: the message is
 * the thing with an owner, so authorising means one query rather than a lookup
 * followed by a join back to find out whose it is.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getCurrentUser();
  // 404 rather than 401, and the same answer for every failure below: a signed
  // out visitor learns nothing about whether the id is real.
  if (!user) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const message = await prisma.aiMessage.findFirst({
    where: { id, conversation: { userId: user.id } },
    select: { imageId: true, imageMime: true },
  });
  if (!message?.imageId) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const file = await readAttachment(message.imageId);
  if (!file) return NextResponse.json({ error: "Not found." }, { status: 404 });

  /*
   * The type is taken from the row and pinned to an image, never echoed from
   * anywhere a caller could influence. `nosniff` means the browser will not
   * guess, so an approximate type renders nothing — and an inaccurate one that
   * *did* render is how a file becomes script on our own origin.
   */
  const mime = message.imageMime === "image/jpeg" ? "image/jpeg" : "image/png";

  // Streamed rather than read into memory, the same way an attachment is: a
  // generated picture is a megabyte or so, and a worker holding several of
  // those at once for no reason is a worker that falls over on a small VPS.
  return new NextResponse(Readable.toWeb(file.stream) as NodeReadableStream as BodyInit, {
    headers: {
      "content-type": mime,
      "content-length": String(file.size),
      "x-content-type-options": "nosniff",
      // Private, because this is one person's conversation and a shared cache
      // in front of the app must never hand it to the next reader.
      "cache-control": "private, max-age=3600",
    },
  });
}
