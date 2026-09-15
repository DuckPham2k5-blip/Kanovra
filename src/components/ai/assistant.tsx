"use client";

import {
  Bot,
  Brain,
  Lightbulb,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
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
import type { ProviderStatus } from "@/lib/ai-providers";
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
  conversations,
  open,
}: {
  workspaceSlug: string;
  workspaceId: string;
  providers: ProviderStatus[];
  defaultModelId: string | null;
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

  // Always at least the free built-in, so there is no "nothing configured"
  // dead-end any more — the page always has an assistant to talk to.
  const configured = providers.filter((p) => p.configured);

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

  const composer = (
    <Composer
      draft={draft}
      setDraft={setDraft}
      onSend={() => void send(draft)}
      onStop={stop}
      sending={sending}
      canSend={Boolean(draft.trim()) && Boolean(modelId)}
      modelId={modelId}
      setModelId={setModelId}
      thinking={thinking}
      setThinking={setThinking}
      configured={configured}
    />
  );

  return (
    // Transparent on purpose: the star field belongs behind the whole AI page,
    // not just the part below the box, so nothing here covers it.
    <div className="flex h-full min-h-0">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
              <Landing composer={composer} />
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
              {messages.map((m) => (
                <AssistantMessage key={m.id} message={m} streaming={sending} />
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* The composer is pinned at the bottom while a conversation is open; on
            the landing it sits in the hero instead, so it is never on screen
            twice. */}
        {messages.length > 0 ? (
          <div className="shrink-0 border-t bg-background/80 backdrop-blur">
            <div className="mx-auto w-full max-w-3xl px-4 py-3 sm:px-6">
              {composer}
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                The assistant explains and drafts; it cannot press anything for you. Conversations
                are private to you.
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Right column: chat history. Desktop only — on a narrow screen the
          conversation fills the width instead. */}
      <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l p-4 xl:flex">
        <HistoryPanel
          conversations={conversations}
          openId={open?.id ?? null}
          onNew={() => openConversation(null)}
          onOpen={openConversation}
          onRename={(c) => {
            setRenaming(c);
            setRenameValue(c.title);
          }}
          onDelete={setConfirmDelete}
          onClear={() => setConfirmClear(true)}
        />
        <QuoteCard />
      </aside>

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

/** The composer: the box you type in, the model picker, thinking and send. */
function Composer({
  draft,
  setDraft,
  onSend,
  onStop,
  sending,
  canSend,
  modelId,
  setModelId,
  thinking,
  setThinking,
  configured,
}: {
  draft: string;
  setDraft: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  sending: boolean;
  canSend: boolean;
  modelId: string;
  setModelId: (v: string) => void;
  thinking: boolean;
  setThinking: (fn: (v: boolean) => boolean) => void;
  configured: ProviderStatus[];
}) {
  return (
    <div className="rounded-2xl border bg-card p-2 shadow-sm transition-shadow focus-within:border-primary/50 focus-within:shadow-md">
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends, Shift+Enter breaks a line. The other way round makes a
          // chat box feel like a form.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder="Ask about this app, your projects, or how to use Kanovra…"
        rows={1}
        className="max-h-44 min-h-[2.75rem] resize-none border-0 bg-transparent px-2 py-2 text-[15px] shadow-none focus-visible:ring-0"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
        <div className="flex items-center gap-1.5">
          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger className="h-8 w-auto min-w-40 gap-1.5 rounded-full text-xs">
              <Sparkles className="size-3.5 text-primary" />
              <SelectValue placeholder="Choose an assistant" />
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
            className="h-8 rounded-full text-xs"
            onClick={() => setThinking((v) => !v)}
            aria-pressed={thinking}
            title="Let the assistant work the answer out at more length before replying"
          >
            <Brain className="size-3.5" />
            <span className="hidden sm:inline">Thinking</span>
          </Button>
        </div>

        {sending ? (
          <Button variant="outline" size="icon" className="rounded-xl" onClick={onStop} aria-label="Stop">
            <Square className="size-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            className="rounded-xl"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send"
          >
            <SendHorizontal className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The name and tagline in the reader's language.
 *
 * The owner asked for the title to follow the language they use, so it is read
 * from the browser rather than fixed. English is the default the server and the
 * first client render agree on — a fixed value there avoids a hydration mismatch
 * — and the effect below swaps to Vietnamese when the browser says so.
 */
const HERO_TEXT: Record<"en" | "vi", { title: string; tagline: string }> = {
  en: { title: "Kanovra AI", tagline: "From a small question to big work." },
  vi: { title: "AI hỗ trợ", tagline: "Từ câu hỏi nhỏ, đến công việc to." },
};

/**
 * The landing: the AI emblem, the name, a tagline, and the box — centred.
 *
 * The star field is *not* covered here any more (the page shows it across its
 * whole surface); the emblem is a robot rather than a sparkle, an AI mark that
 * reads as its own thing against that field.
 */
function Landing({ composer }: { composer: React.ReactNode }) {
  const [lang, setLang] = React.useState<"en" | "vi">("en");
  React.useEffect(() => {
    const code = (navigator.language || "").toLowerCase();
    setLang(code.startsWith("vi") ? "vi" : "en");
  }, []);
  const hero = HERO_TEXT[lang];

  return (
    <div className="space-y-6 py-6 text-center">
      <div className="space-y-4">
        <div
          aria-hidden
          className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-fuchsia-500 text-white shadow-lg shadow-primary/25"
        >
          <Bot className="size-8" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            <span className="bg-gradient-to-r from-primary via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
              {hero.title}
            </span>
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">{hero.tagline}</p>
        </div>
      </div>

      <div className="text-left">{composer}</div>
    </div>
  );
}

/** Chat history in the right column, with new / rename / delete / clear. */
function HistoryPanel({
  conversations,
  openId,
  onNew,
  onOpen,
  onRename,
  onDelete,
  onClear,
}: {
  conversations: ConversationSummary[];
  openId: string | null;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRename: (c: ConversationSummary) => void;
  onDelete: (c: ConversationSummary) => void;
  onClear: () => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Chat history</h2>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onNew}>
          <Plus className="size-3.5" />
          New
        </Button>
      </div>

      {conversations.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
          Nothing yet. Ask something and it will be kept here.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {conversations.map((c) => (
            <li key={c.id} className="group/row flex items-center gap-1">
              <button
                onClick={() => onOpen(c.id)}
                className={cn(
                  "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  c.id === openId ? "bg-accent font-medium" : "hover:bg-accent/60",
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
                  <DropdownMenuItem onClick={() => onRename(c)}>
                    <Pencil /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => onDelete(c)}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      {conversations.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 h-7 w-full justify-start text-xs text-muted-foreground"
          onClick={onClear}
        >
          <Trash2 className="size-3.5" />
          Delete all
        </Button>
      ) : null}
    </section>
  );
}

function QuoteCard() {
  return (
    <div className="mt-auto flex items-start gap-2 rounded-xl border bg-gradient-to-br from-primary/5 to-fuchsia-500/5 p-3 text-xs text-muted-foreground">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
      <p>
        “Big ideas start with the right questions.”
        <span className="mt-1 block font-medium text-foreground">— Kanovra AI</span>
      </p>
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
