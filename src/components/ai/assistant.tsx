"use client";

import {
  Brain,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  SendHorizontal,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { AssistantMessage } from "@/components/ai/assistant-message";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { suggestionsFor } from "@/lib/ai-suggestions";
import { UNAVAILABLE_ASSISTANTS, type ProviderStatus } from "@/lib/ai-providers";
import { cn } from "@/lib/utils";
import { clearConversations, deleteConversation, renameConversation } from "@/server/actions/ai-chat";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string | null;
  hasImage?: boolean;
};

type ConversationSummary = { id: string; title: string; updatedAt: string };

/**
 * The assistant page.
 *
 * ## The answer is streamed, and that is not a detail
 *
 * A model takes a second to start and can take twenty to finish. Waiting for
 * the whole answer means twenty seconds of nothing, which every reader
 * interprets as a broken page rather than as thinking. So the reply is appended
 * as it arrives, from a plain `text/plain` stream — no SSE framing, because
 * there is only one kind of event and a protocol for that would be ceremony.
 *
 * ## Sending is optimistic, and the failure is visible
 *
 * The question appears the moment it is sent, before the server has agreed to
 * anything, because a message box that empties into nothing feels lost. If the
 * request then fails, the failure is written into the answer where the reader
 * is already looking — not into a toast that appears somewhere else and
 * disappears on its own.
 */
export function Assistant({
  workspaceSlug,
  workspaceId,
  providers,
  defaultModelId,
  canMakeImages,
  conversations,
  open,
}: {
  workspaceSlug: string;
  workspaceId: string;
  providers: ProviderStatus[];
  defaultModelId: string | null;
  canMakeImages: boolean;
  conversations: ConversationSummary[];
  open: { id: string; title: string; messages: ChatMessage[] } | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [messages, setMessages] = React.useState<ChatMessage[]>(open?.messages ?? []);
  const [draft, setDraft] = React.useState("");
  const [modelId, setModelId] = React.useState(defaultModelId ?? "");
  const [thinking, setThinking] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [renaming, setRenaming] = React.useState<ConversationSummary | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState<ConversationSummary | null>(null);
  const [confirmClear, setConfirmClear] = React.useState(false);

  const abortRef = React.useRef<AbortController | null>(null);
  const bottomRef = React.useRef<HTMLDivElement | null>(null);

  const configured = providers.filter((p) => p.configured);
  const nothingConfigured = configured.length === 0;

  /*
   * The server render is the source of truth for which conversation is open.
   * Without this, clicking a conversation in the list changes the URL and the
   * server payload, and the transcript on screen stays on the previous one.
   */
  React.useEffect(() => {
    setMessages(open?.messages ?? []);
  }, [open?.id, open?.messages]);

  // Follow the answer as it is written. `auto` rather than `smooth`: a smooth
  // scroll restarts on every token and never arrives.
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const suggestions = React.useMemo(
    () => suggestionsFor({ pathname: previousPath(searchParams), canMakeImages }),
    [searchParams, canMakeImages],
  );

  function openConversation(id: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("c", id);
    else params.delete("c");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || sending || !modelId) return;

    setDraft("");
    setSending(true);

    const localId = `local-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: localId, role: "user", content: question },
      { id: `${localId}-a`, role: "assistant", content: "" },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          workspaceSlug,
          conversationId: open?.id ?? null,
          message: question,
          modelId,
          thinking,
          path: previousPath(searchParams),
        }),
      });

      const conversationId = response.headers.get("x-conversation-id");

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `The assistant could not answer (${response.status}).`);
      }

      // A picture arrives whole, as JSON; an answer arrives as a stream.
      if (response.headers.get("content-type")?.includes("application/json")) {
        await response.json();
        if (conversationId) openConversation(conversationId);
        else router.refresh();
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("The assistant sent nothing back.");
      const decoder = new TextDecoder();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const piece = decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) => (m.id === `${localId}-a` ? { ...m, content: m.content + piece } : m)),
        );
      }

      /*
       * A brand-new conversation now exists on the server with an id the
       * browser has only just learned. Putting it in the URL is what makes the
       * sidebar list it, the Back button work, and a reload keep the thread.
       * Refreshing an existing one updates its position in the list without
       * throwing away what is on screen.
       */
      if (conversationId && conversationId !== open?.id) openConversation(conversationId);
      else router.refresh();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const note = error instanceof Error ? error.message : "Something went wrong.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === `${localId}-a` ? { ...m, content: `${m.content}\n\n**${note}**` } : m,
        ),
      );
    } finally {
      abortRef.current = null;
      setSending(false);
    }
  }

  function stop() {
    // Aborting the fetch closes the connection, which the route notices through
    // `request.signal` and stops paying for.
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
  }

  async function handleRename() {
    if (!renaming) return;
    const result = await renameConversation({
      conversationId: renaming.id,
      title: renameValue,
    });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setRenaming(null);
    router.refresh();
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const result = await deleteConversation({ conversationId: confirmDelete.id });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    const wasOpen = confirmDelete.id === open?.id;
    setConfirmDelete(null);
    if (wasOpen) openConversation(null);
    else router.refresh();
  }

  async function handleClear() {
    const result = await clearConversations({ workspaceId });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setConfirmClear(false);
    toast.success(
      result.data.removed === 1 ? "Conversation deleted." : `${result.data.removed} conversations deleted.`,
    );
    openConversation(null);
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-64 shrink-0 flex-col border-r md:flex">
        <div className="p-3">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => openConversation(null)}
          >
            <MessageSquarePlus className="size-4" />
            New conversation
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {conversations.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              Nothing yet. Ask something and it will be kept here.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {conversations.map((c) => (
                <li key={c.id} className="group/row flex items-center gap-1">
                  <button
                    onClick={() => openConversation(c.id)}
                    className={cn(
                      "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      c.id === open?.id ? "bg-accent font-medium" : "hover:bg-accent/60",
                    )}
                  >
                    {c.title}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="opacity-0 group-hover/row:opacity-100 data-[state=open]:opacity-100"
                        aria-label={`Options for ${c.title}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setRenaming(c);
                          setRenameValue(c.title);
                        }}
                      >
                        <Pencil /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(c)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          )}
        </div>

        {conversations.length > 0 ? (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs text-muted-foreground"
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 className="size-3.5" />
              Delete all conversations
            </Button>
          </div>
        ) : null}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
            {messages.length === 0 ? (
              <EmptyState
                nothingConfigured={nothingConfigured}
                providers={providers}
                suggestions={suggestions}
                onPick={(prompt) => {
                  if (prompt.trimEnd() !== prompt.trim()) setDraft(prompt);
                  else void send(prompt);
                }}
              />
            ) : (
              <div className="space-y-6">
                {messages.map((m) => (
                  <AssistantMessage key={m.id} message={m} streaming={sending} />
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="shrink-0 border-t bg-background/80 backdrop-blur">
          <div className="mx-auto w-full max-w-3xl space-y-2 px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={modelId} onValueChange={setModelId} disabled={nothingConfigured}>
                <SelectTrigger className="h-8 w-auto min-w-44 text-xs">
                  <SelectValue placeholder="No assistant configured" />
                </SelectTrigger>
                <SelectContent>
                  {configured.map((p) => (
                    <SelectGroup key={p.id}>
                      <SelectLabel>{p.label}</SelectLabel>
                      {p.models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant={thinking ? "secondary" : "ghost"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setThinking((v) => !v)}
                aria-pressed={thinking}
                title="Let the assistant work the answer out at more length before replying"
              >
                <Brain className="size-3.5" />
                Thinking
              </Button>
            </div>

            <div className="flex items-end gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter breaks a line. The other way round
                  // makes a chat box feel like a form.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(draft);
                  }
                }}
                placeholder={
                  nothingConfigured ? "No assistant is configured yet." : "Ask about this app, or about your work…"
                }
                disabled={nothingConfigured}
                rows={1}
                className="max-h-40 min-h-[2.5rem] resize-y"
              />
              {sending ? (
                <Button variant="outline" size="icon" onClick={stop} aria-label="Stop">
                  <Square className="size-4" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  onClick={() => void send(draft)}
                  disabled={!draft.trim() || nothingConfigured}
                  aria-label="Send"
                >
                  <SendHorizontal className="size-4" />
                </Button>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">
              The assistant explains and drafts; it cannot press anything for you. Conversations
              are private to you.
            </p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Delete this conversation?"
        description="It is removed for good, along with any pictures in it."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={Boolean(renaming)}
        onOpenChange={(v) => !v && setRenaming(null)}
        title="Rename conversation"
        description={
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            maxLength={80}
            className="mt-2"
            aria-label="Conversation name"
          />
        }
        confirmLabel="Save"
        onConfirm={handleRename}
      />

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Delete every conversation?"
        description="All of your conversations in this workspace go, along with any pictures in them. Nobody else could read them, and nobody else loses anything."
        confirmLabel="Delete them all"
        destructive
        onConfirm={handleClear}
      />
    </div>
  );
}

/**
 * Where the person came from, so "this page" can mean something.
 *
 * Read from `?from=`, which the sidebar link sets. The value is only ever
 * matched against the product guide's known routes — an unrecognised one
 * contributes nothing to the prompt rather than being passed through.
 */
function previousPath(params: URLSearchParams): string | null {
  return params.get("from");
}

function EmptyState({
  nothingConfigured,
  providers,
  suggestions,
  onPick,
}: {
  nothingConfigured: boolean;
  providers: ProviderStatus[];
  suggestions: { label: string; prompt: string; group: string }[];
  onPick: (prompt: string) => void;
}) {
  if (nothingConfigured) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-12 text-center">
        <Sparkles className="mx-auto size-8 text-muted-foreground" />
        <h2 className="text-lg font-semibold">No assistant is configured yet</h2>
        <p className="text-sm text-muted-foreground">
          Add one of these keys to the server&apos;s <code>.env</code> and restart it. Any one is
          enough; adding more just puts more choices in the picker.
        </p>
        <ul className="space-y-2 text-left text-sm">
          {providers.map((p) => (
            <li key={p.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{p.label}</span>
                <code className="text-xs text-muted-foreground">{p.envVar}</code>
              </div>
              <a
                href={p.keyUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Where to get a key
              </a>
            </li>
          ))}
        </ul>
        <div className="rounded-lg border border-dashed p-3 text-left text-xs text-muted-foreground">
          {UNAVAILABLE_ASSISTANTS.map((a) => (
            <p key={a.label} className="mb-1 last:mb-0">
              <span className="font-medium">{a.label}:</span> {a.reason}
            </p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-10">
      <div className="space-y-1 text-center">
        <Sparkles className="mx-auto size-8 text-muted-foreground" />
        <h2 className="text-lg font-semibold">What would you like to know?</h2>
        <p className="text-sm text-muted-foreground">
          Ask how something in this app works, or think a piece of work through.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {suggestions.map((s) => (
          <button
            key={s.label}
            onClick={() => onPick(s.prompt)}
            className="rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent/60"
          >
            <span className="block font-medium">{s.label}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {s.group === "this page" ? "About the page you came from" : s.prompt.slice(0, 80)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Shown while the first token is still on its way. */
export function Thinking() {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" />
      Thinking…
    </span>
  );
}
