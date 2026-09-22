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
import { detectLang, type Lang } from "@/lib/ai-builtin";
import {
  type AiCommand,
  cleanImagePrompt,
  looksLikeImageRequest,
  looksLikeQuestion,
  MAP_TYPE_LABEL,
  parseAiCommand,
} from "@/lib/ai-commands";
import { conversationWindow, titleFromMessage } from "@/lib/ai-conversation";
import { findOwnConversation, recentTurns } from "@/lib/ai-conversations";
import { findModel } from "@/lib/ai-providers";
import { getCurrentUser } from "@/lib/auth";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { AI_LIMIT, consumeToken } from "@/lib/rate-limit";
import { createMindMap } from "@/server/actions/mind-map";
import { createProject } from "@/server/actions/project";
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
  /** The person's "About you" note, kept in their browser and sent each turn. */
  profile: z.string().max(1000).nullish(),
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
    select: { workspace: { select: { id: true, name: true, slug: true } } },
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
    ? await findOwnConversation({
        conversationId: body.conversationId,
        userId: user.id,
        workspaceId: workspace.id,
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

  const isImageModel = found.model.capabilities.includes("images");
  const question = looksLikeQuestion(body.message);

  /*
   * Drawing comes first, and is decided by the *message*, not only the model.
   * "tạo cho tôi một ảnh về một mind map" wants a picture — the word "ảnh" is
   * the intent — and must not be grabbed by the create-map parser and turned
   * into "we don't have that map". So an explicit image request, or anything
   * (bar a question) while an image model is selected, is drawn. A picture is
   * not a stream: it answers with JSON and the browser branches on that.
   */
  if (!question && (looksLikeImageRequest(body.message) || isImageModel)) {
    const imageModelId = isImageModel ? body.modelId : "kanovra-image";
    return respondWithImage({ conversationId, prompt: body.message, modelId: imageModelId });
  }

  /*
   * A create command — "tạo project tên Duc" — is performed here rather than
   * answered. The command is the signed-in person's own typed instruction, and
   * each create still runs the ordinary server-side permission check inside its
   * action, so this is a second door to the same guarded write, not a way past
   * it. A question ("how do I create a project") parses to null and falls
   * through to the normal answer below. It is deterministic and free — it needs
   * no model at all.
   */
  const command = parseAiCommand(body.message);
  if (command) {
    return respondWithCommand({
      command,
      conversationId,
      workspace,
      lang: detectLang(body.message),
    });
  }

  // A question in image mode is answered as text, by the built-in guide — the
  // image model cannot hold a conversation.
  const answerModelId = isImageModel ? "kanovra-guide" : body.modelId;

  // Oldest first, trimmed at the recent end, then shaped into something a
  // provider will accept — see `conversationWindow`, which exists because a
  // plain trim opens on an assistant turn and Anthropic refuses that.
  const previous = await recentTurns(conversationId, HISTORY_TURNS);
  const turns: ChatTurn[] = conversationWindow(
    previous.map((m) => ({
      role: m.role === AiRole.USER ? "user" : "assistant",
      content: m.content,
    })),
    HISTORY_TURNS,
  );

  const system = buildSystemPrompt({
    workspaceName: workspace.name,
    currentPath: body.path,
    userProfile: body.profile,
  });

  const encoder = new TextEncoder();
  let answer = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const piece of streamChat({
          modelId: answerModelId,
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
                model: answerModelId,
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

/** A pleasant default colour for a project made from chat (the create schema
 *  requires one; the picker's palette is where these come from). */
const PROJECT_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

/**
 * Performs a create command and answers with JSON the browser acts on.
 *
 * A successful create returns a `link`; the browser opens it, which is the "it
 * did the thing" the person asked for. A refusal or a request for a name has no
 * link and simply appears as the assistant's reply in the thread. Either way the
 * reply is saved as an assistant message, so the conversation reads back
 * sensibly and a reload shows it.
 */
async function respondWithCommand(input: {
  command: AiCommand;
  conversationId: string;
  workspace: { id: string; slug: string; name: string };
  lang: Lang;
}) {
  const { command, conversationId, workspace, lang } = input;
  const vi = lang === "vi";

  let reply: string;
  let link: string | null = null;

  if (command.kind === "need-name") {
    reply = vi
      ? "Bạn muốn đặt tên là gì? Ví dụ: “tạo project tên Marketing”."
      : "What should it be called? For example: “create a project named Marketing”.";
  } else if (command.kind === "unsupported-map") {
    reply = vi
      ? "Xin lỗi, Kanovra chỉ có 5 loại map: **Circle, Bubble, Tree, Brace, Multi-flow**. Bạn muốn loại nào?"
      : "Sorry — Kanovra only has five map kinds: **Circle, Bubble, Tree, Brace, Multi-flow**. Which would you like?";
  } else if (command.kind === "create-project") {
    const color = PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
    const result = await createProject({ workspaceId: workspace.id, name: command.name, color });
    if (result.success) {
      link = `/w/${workspace.slug}/projects/${result.data.id}/board`;
      reply = vi
        ? `Đã tạo project **${command.name}** cho bạn. Mình mở nó ra ngay.`
        : `Created the project **${command.name}**. Opening it now.`;
    } else {
      reply = apologyFor(result.error, "project", lang);
    }
  } else {
    const title = command.title || (vi ? "Map mới" : "New map");
    const result = await createMindMap({ workspaceId: workspace.id, type: command.type, title });
    if (result.success) {
      link = `/w/${workspace.slug}/maps/${result.data.id}`;
      reply = vi
        ? `Đã tạo map **${title}** (${MAP_TYPE_LABEL[command.type]}). Mình mở ra nhé.`
        : `Created the map **${title}** (${MAP_TYPE_LABEL[command.type]}). Opening it now.`;
    } else {
      reply = apologyFor(result.error, "map", lang);
    }
  }

  await prisma.aiMessage
    .create({
      data: { conversationId, role: AiRole.ASSISTANT, content: reply, model: "kanovra-guide" },
    })
    .catch((e: unknown) => logError("ai.command.persist", e, { conversationId }));
  await prisma.aiConversation
    .update({ where: { id: conversationId }, data: { updatedAt: new Date() } })
    .catch(() => {});

  return NextResponse.json(
    { kind: "action", conversationId, link, reply },
    { headers: { "x-conversation-id": conversationId } },
  );
}

/** Turn an action's error into a friendly line, naming the permission case. */
function apologyFor(error: string, resource: string, lang: Lang): string {
  const forbidden = /permission|forbidden|quyền/i.test(error);
  if (forbidden) {
    return lang === "vi"
      ? `Bạn chưa có quyền tạo ${resource} trong workspace này (cần vai trò Member trở lên).`
      : `You don't have permission to create a ${resource} here (needs Member or above).`;
  }
  return lang === "vi"
    ? `Xin lỗi, mình chưa tạo được ${resource}: ${error}`
    : `Sorry, I couldn't create the ${resource}: ${error}`;
}

async function respondWithImage(input: {
  conversationId: string;
  prompt: string;
  modelId: string;
}) {
  try {
    // Generate from the subject alone; the original request is kept below as the
    // caption. Sending the whole "please make me a picture of …" sentence is a
    // large part of why the results came out strange.
    const { bytes, mime } = await generateImage({
      modelId: input.modelId,
      prompt: cleanImagePrompt(input.prompt),
    });

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
