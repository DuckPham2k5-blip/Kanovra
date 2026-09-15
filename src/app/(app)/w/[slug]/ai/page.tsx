import type { Metadata } from "next";

import { Assistant } from "@/components/ai/assistant";
import { listConversations, openConversation } from "@/lib/ai-conversations";
import { providerStatus, defaultModel } from "@/lib/ai-providers";
import { requireWorkspace } from "@/lib/auth";

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

  const conversations = await listConversations({
    userId: user.id,
    workspaceId: workspace.id,
  });

  /*
   * `?c=` comes from the address bar, so the lookup is scoped by owner in its
   * `where` — somebody else's id has to answer exactly as a made-up one. See
   * `ai-conversations.ts`.
   */
  const open = openId
    ? await openConversation({
        conversationId: openId,
        userId: user.id,
        workspaceId: workspace.id,
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
