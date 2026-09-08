import type { Metadata } from "next";

import { Assistant } from "@/components/ai/assistant";
import { providerStatus, defaultModel, capabilityAvailable } from "@/lib/ai-providers";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Assistant" };

/**
 * The assistant page.
 *
 * Conversations are loaded here rather than fetched by the browser, so opening
 * the page shows the last one already written out — a chat that has to fetch
 * its own history flashes empty first, and an empty chat looks like a lost one.
 *
 * `?c=<id>` names the open conversation, for the same reason the task panel
 * puts `?task=` in the address bar: it makes the browser's Back button work
 * through a conversation list, and it survives a reload.
 */
export default async function AssistantPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { slug } = await params;
  const { c: openId } = await searchParams;
  const { workspace, user } = await requireWorkspace(slug);

  const conversations = await prisma.aiConversation.findMany({
    where: { userId: user.id, workspaceId: workspace.id },
    orderBy: { updatedAt: "desc" },
    take: 60,
    select: { id: true, title: true, updatedAt: true },
  });

  /*
   * Scoped by owner in the `where`, not filtered after: `?c=` comes from the
   * address bar, and somebody else's id has to answer exactly as a made-up one.
   */
  const open = openId
    ? await prisma.aiConversation.findFirst({
        where: { id: openId, userId: user.id, workspaceId: workspace.id },
        select: {
          id: true,
          title: true,
          messages: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              role: true,
              content: true,
              model: true,
              imageId: true,
              createdAt: true,
            },
          },
        },
      })
    : null;

  // Only booleans and names cross to the browser — never a key. See the note on
  // `providerStatus`.
  const statuses = providerStatus(process.env);

  return (
    <Assistant
      workspaceSlug={slug}
      workspaceId={workspace.id}
      providers={statuses}
      defaultModelId={defaultModel(statuses)}
      canMakeImages={capabilityAvailable(statuses, "images")}
      conversations={conversations.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt.toISOString(),
      }))}
      open={
        open
          ? {
              id: open.id,
              title: open.title,
              messages: open.messages.map((m) => ({
                id: m.id,
                role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
                content: m.content,
                model: m.model,
                hasImage: Boolean(m.imageId),
              })),
            }
          : null
      }
    />
  );
}
