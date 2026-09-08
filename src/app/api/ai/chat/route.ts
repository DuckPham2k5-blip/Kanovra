import { AiRole } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  AiModelUnknownError,
  AiProviderNotConfiguredError,
  buildSystemPrompt,
  generateImage,
  streamChat,
  type ChatTurn,
} from "@/lib/ai-chat";
import { titleFromMessage } from "@/lib/ai-conversation";
import { findModel } from "@/lib/ai-providers";
import { getCurrentUser } from "@/lib/auth";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { AI_LIMIT, consumeToken } from "@/lib/rate-limit";
import { saveAttachment } from "@/lib/storage";

/**
 * One message to the assistant, and its answer.
 *
 * A route handler rather than a Server Action, for one reason: an answer
 * arrives a token at a time and a Server Action can only return once. Streaming
 * is the difference between a page that is thinking and a page that is broken —
 * the first token lands in under a second, the last can be twenty seconds
 * later, and nobody waits twenty seconds at a blank screen.
 *
 * Everything the middleware does for the rest of the application has to be done
 * here by hand, because `/api/` is not a Server Action and this route is not
 * public: the session, the membership, and a limit of its own.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How much of a conversation is sent back with each new message. */
const HISTORY_TURNS = 20;

const bodySchema = z.object({
  workspaceSlug: z.string().min(1),
  /** Absent on the first message of a new conversation. */
  conversationId: z.string().min(1).nullish(),
  message: z.string().trim().min(1).max(8000),
  modelId: z.string().min(1),
  thinking: z.boolean().optional(),
  /** Where the person is, so "this page" means something. Validated by the guide. */
  path: z.string().max(400).nullish(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  /*
   * Per person, and before anything is spent. This is the first endpoint in the
   * application where a request costs money rather than database time, so the
   * limit is tighter than the write limit and is checked before the model is
   * ever reached.
   */
  const verdict = consumeToken(`ai:${user.id}`, AI_LIMIT);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "That is a lot of questions at once. Give it a minute." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "That message could not be read." }, { status: 400 });
  }

  // Membership, the same question every other read in the app asks. A
  // workspace the caller is not in answers exactly as one that does not exist.
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspace: { slug: body.workspaceSlug } },
    select: { workspace: { select: { id: true, name: true } } },
  });
  if (!membership) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const workspace = membership.workspace;

  const found = findModel(body.modelId);
  if (!found) return NextResponse.json({ error: "No such assistant." }, { status: 400 });

  /*
   * An existing conversation is fetched scoped by owner. Somebody else's id
   * answers as "not found", so the field cannot be used to discover that a
   * conversation exists — and a conversation is private in a way a task is not.
   */
  let conversation = body.conversationId
    ? await prisma.aiConversation.findFirst({
        where: { id: body.conversationId, userId: user.id, workspaceId: workspace.id },
        select: { id: true },
      })
    : null;

  if (body.conversationId && !conversation) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (!conversation) {
    conversation = await prisma.aiConversation.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        title: titleFromMessage(body.message),
      },
      select: { id: true },
    });
  }

  const conversationId = conversation.id;

  await prisma.aiMessage.create({
    data: { conversationId, role: AiRole.USER, content: body.message },
  });

  // A picture is not a stream. It arrives whole or not at all, so that path
  // answers with JSON and the browser branches on the content type.
  if (found.model.capabilities.includes("images")) {
    return respondWithImage({ conversationId, prompt: body.message, modelId: body.modelId });
  }

  const previous = await prisma.aiMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_TURNS,
    select: { role: true, content: true },
  });

  /*
   * Oldest first for the model, newest first from the database — the `take`
   * has to bite at the *recent* end, or a long conversation would send its
   * opening and forget everything since.
   */
  const turns: ChatTurn[] = previous
    .reverse()
    .map((m) => ({ role: m.role === AiRole.USER ? "user" : "assistant", content: m.content }));

  const system = buildSystemPrompt({ workspaceName: workspace.name, currentPath: body.path });

  const encoder = new TextEncoder();
  let answer = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const piece of streamChat({
          modelId: body.modelId,
          system,
          turns,
          thinking: body.thinking,
          signal: request.signal,
        })) {
          answer += piece;
          controller.enqueue(encoder.encode(piece));
        }
      } catch (error) {
        /*
         * The reader has already seen part of an answer, so there is no status
         * code left to send — the only honest thing is to say so in the text
         * they are reading. A stream that simply stops looks like the model
         * having nothing more to say.
         */
        const note =
          error instanceof AiProviderNotConfiguredError || error instanceof AiModelUnknownError
            ? `\n\n[${error.message}]`
            : `\n\n[The answer stopped early: ${errorNote(error)}]`;
        if (!(error instanceof Error && error.name === "AbortError")) {
          answer += note;
          controller.enqueue(encoder.encode(note));
          logError("ai.stream", error, { model: body.modelId });
        }
      } finally {
        controller.close();
        /*
         * Saved after the stream ends, not per token: a row rewritten on every
         * token is one database write per word of every answer. A person who
         * closes the tab mid-answer keeps what had arrived, which is the
         * behaviour they would expect from having read it.
         */
        if (answer.trim()) {
          await prisma.aiMessage
            .create({
              data: {
                conversationId,
                role: AiRole.ASSISTANT,
                content: answer,
                model: body.modelId,
              },
            })
            .catch((e: unknown) => logError("ai.persist", e, { conversationId }));
          await prisma.aiConversation
            .update({ where: { id: conversationId }, data: { updatedAt: new Date() } })
            .catch(() => {});
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // How the browser learns the id of a conversation it has just started.
      "x-conversation-id": conversationId,
      "cache-control": "no-store",
      // Nginx buffers proxied responses by default, which would hold the whole
      // answer back and deliver it in one lump — the exact thing streaming is
      // for. Same header the SSE route relies on.
      "x-accel-buffering": "no",
    },
  });
}

async function respondWithImage(input: {
  conversationId: string;
  prompt: string;
  modelId: string;
}) {
  try {
    const { bytes, mime } = await generateImage({ modelId: input.modelId, prompt: input.prompt });

    // Stored the way attachments are: a generated id outside the web root,
    // never a name derived from the prompt, served through a route that
    // re-checks who is asking.
    const imageId = randomUUID();
    await saveAttachment(imageId, bytes);

    const message = await prisma.aiMessage.create({
      data: {
        conversationId: input.conversationId,
        role: AiRole.ASSISTANT,
        content: input.prompt,
        model: input.modelId,
        imageId,
        imageMime: mime,
      },
      select: { id: true },
    });

    await prisma.aiConversation
      .update({ where: { id: input.conversationId }, data: { updatedAt: new Date() } })
      .catch(() => {});

    return NextResponse.json(
      { kind: "image", messageId: message.id, imageId, conversationId: input.conversationId },
      { headers: { "x-conversation-id": input.conversationId } },
    );
  } catch (error) {
    logError("ai.image", error, { model: input.modelId });
    return NextResponse.json(
      { error: `The picture could not be made. ${errorNote(error)}` },
      { status: 502, headers: { "x-conversation-id": input.conversationId } },
    );
  }
}

/**
 * The provider's own words, trimmed.
 *
 * "Something went wrong" when the provider said "you are out of credit" costs
 * somebody an afternoon. Truncated because an error body can be a whole HTML
 * page, and it goes to a person who is signed in and a member of the workspace.
 */
function errorNote(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 300);
}
