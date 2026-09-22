"use client";

import {
  Brain,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Lightbulb,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  SendHorizontal,
  Sparkles,
  Square,
  Trash2,
  UserRound,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { AssistantMessage } from "@/components/ai/assistant-message";
import { EdgeToggle } from "@/components/layout/edge-toggle";
import { AiOrbitMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { findModel, type ProviderStatus } from "@/lib/ai-providers";
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

  /*
   * The "About you" note. Kept in the browser (localStorage) rather than the
   * server: it is private to this person and small, and this avoids a schema
   * change. It is sent with each question so the assistant can match the
   * person's tone and interests — which a real model uses, and the free
   * built-in cannot (it answers from a fixed knowledge base, not the prompt).
   */
  const [profile, setProfile] = React.useState("");
  const [profileOpen, setProfileOpen] = React.useState(false);
  React.useEffect(() => {
    try {
      setProfile(localStorage.getItem("tf-ai-profile") ?? "");
    } catch {
      // Blocked storage: no profile this session.
    }
  }, []);
  const saveProfile = React.useCallback((text: string) => {
    setProfile(text);
    try {
      localStorage.setItem("tf-ai-profile", text);
    } catch {
      // Not persisting is fine; it still applies for this session.
    }
    setProfileOpen(false);
  }, []);

  /*
   * Whether the right history column is folded to a thin rail. Kept in
   * `localStorage` so the choice sticks across visits, and read after mount so
   * the server and first client render agree (both start expanded).
   */
  const [asideCollapsed, setAsideCollapsed] = React.useState(false);
  React.useEffect(() => {
    try {
      setAsideCollapsed(localStorage.getItem("tf-ai-aside-collapsed") === "1");
    } catch {
      // Blocked storage: stay expanded.
    }
  }, []);
  const toggleAside = React.useCallback(() => {
    setAsideCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem("tf-ai-aside-collapsed", next ? "1" : "0");
      } catch {
        // Not persisting is fine; the toggle still works this session.
      }
      return next;
    });
  }, []);

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
          profile: profile.trim() || null,
        }),
      });

      const conversationId = response.headers.get("x-conversation-id");

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `The assistant could not answer (${response.status}).`);
      }

      // A picture and a performed command both arrive whole, as JSON; an answer
      // arrives as a stream.
      if (response.headers.get("content-type")?.includes("application/json")) {
        const data = (await response.json().catch(() => null)) as { link?: string | null } | null;
        // A command that created something hands back where it lives — open it,
        // which is the "it did the thing" the person asked for. `refresh` as
        // well as `push`, so the left sidebar's project list (fetched in the
        // workspace layout) refetches and the new project appears there at once
        // — the same pair the New project dialog uses.
        if (data?.link) {
          router.push(data.link);
          router.refresh();
          return;
        }
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
      hasProfile={Boolean(profile.trim())}
      onEditProfile={() => setProfileOpen(true)}
    />
  );

  return (
    // Transparent on purpose: the star field belongs behind the whole AI page,
    // not just the part below the box, so nothing here covers it.
    <div className="flex h-full min-h-0">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            // Centred vertically in the view: `min-h-full` makes the wrapper at
            // least the full height so `items-center` has room to work, and it
            // still scrolls if the hero grows taller than the screen.
            <div className="flex min-h-full items-center justify-center px-4 py-10 sm:px-6">
              <div className="w-full max-w-2xl">
                <Landing composer={composer} />
              </div>
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
          conversation fills the width instead. It carries its own surface
          (`bg-sidebar` + blur) and a border so it reads as a distinct column
          against the star field rather than blending into the page. Folds to a
          thin rail with the edge handle, mirroring the left sidebar.

          The scrolling panel and the handle are separate elements: the panel
          scrolls (which clips horizontal overflow), so the handle hangs off a
          non-clipping `relative` wrapper around it instead. */}
      <div className="relative hidden h-full shrink-0 xl:block">
        {asideCollapsed ? (
          // Collapsed: a thin, full-height sliver — the column's own border and
          // a hint of its surface stay visible, and the edge toggle keeps its
          // vertical middle so it does not jump when folded.
          <div className="h-full w-8 border-l border-sidebar-border bg-sidebar/70 backdrop-blur-xl" />
        ) : (
          <aside className="flex h-full w-80 flex-col gap-4 overflow-y-auto border-l border-sidebar-border bg-sidebar/70 p-4 backdrop-blur-xl">
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
        )}
        <EdgeToggle
          side="right"
          collapsed={asideCollapsed}
          onToggle={toggleAside}
          label={asideCollapsed ? "Show chat history" : "Hide chat history"}
          breakpoint="xl"
        />
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

      <ProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        value={profile}
        onSave={saveProfile}
        canAdapt={configured.some((p) => p.id !== "builtin")}
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
  hasProfile,
  onEditProfile,
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
  hasProfile: boolean;
  onEditProfile: () => void;
}) {
  // A taller box for a longer question, folded back to one line when done.
  const [expanded, setExpanded] = React.useState(false);

  // What the configured assistants can actually do right now. These gate the
  // tools honestly: a control that would fail when pressed is shown disabled
  // with the reason, never as if it worked.
  const imageModel = configured
    .flatMap((p) => p.models)
    .find((m) => m.capabilities.includes("images"));
  const selected = modelId ? findModel(modelId) : null;
  const canReason = Boolean(selected?.model.capabilities.includes("reasoning"));
  const makingImage = Boolean(selected?.model.capabilities.includes("images"));

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
        placeholder={
          makingImage
            ? "Describe a picture to make…"
            : "Ask about this app, your projects, or how to use Kanovra…"
        }
        rows={1}
        className={cn(
          "resize-none border-0 bg-transparent px-2 py-2 text-[15px] shadow-none transition-[min-height] focus-visible:ring-0",
          expanded ? "min-h-[9rem] max-h-80" : "min-h-[2.75rem] max-h-44",
        )}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
        <div className="flex items-center gap-1.5">
          {/* The tools menu — the "+" that ChatGPT and Gemini put here. Each
              entry is a real capability of the configured assistants; the ones
              a paid key would unlock are shown disabled with the reason rather
              than hidden, so nothing here fails silently when pressed. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 rounded-full"
                aria-label="Tools"
                title="Tools"
              >
                <Plus className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Tools</DropdownMenuLabel>

              <DropdownMenuItem onClick={onEditProfile}>
                <UserRound />
                <div className="flex flex-col">
                  <span>About you {hasProfile ? "· on" : ""}</span>
                  <span className="text-xs text-muted-foreground">
                    Tell the assistant who you are, so it answers to suit you
                  </span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                disabled={!imageModel}
                onClick={() => imageModel && setModelId(imageModel.id)}
              >
                <ImagePlus />
                <div className="flex flex-col">
                  <span>Create image</span>
                  <span className="text-xs text-muted-foreground">
                    {imageModel
                      ? "Switch to an image model and describe a picture"
                      : "Needs a Gemini or OpenAI key"}
                  </span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuCheckboxItem
                checked={thinking}
                disabled={!canReason}
                onCheckedChange={() => setThinking((v) => !v)}
              >
                <div className="flex flex-col">
                  <span>Deep reasoning</span>
                  <span className="text-xs text-muted-foreground">
                    {canReason
                      ? "Work the answer out at more length"
                      : "Needs a reasoning model — add a free Gemini key to switch on"}
                  </span>
                </div>
              </DropdownMenuCheckboxItem>

              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                Web search, deep research, video and music need an outside
                service and are not wired up yet.
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger className="h-8 w-auto min-w-40 gap-1.5 rounded-full text-xs">
              {makingImage ? (
                <ImagePlus className="size-3.5 text-primary" />
              ) : (
                <Sparkles className="size-3.5 text-primary" />
              )}
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

          {thinking && canReason ? (
            <span className="hidden items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs text-secondary-foreground sm:inline-flex">
              <Brain className="size-3.5" />
              Deep reasoning
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-xl"
            onClick={() => setExpanded((v) => !v)}
            aria-pressed={expanded}
            aria-label={expanded ? "Collapse the box" : "Expand the box"}
            title={expanded ? "Collapse the box" : "Expand the box"}
          >
            {expanded ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </Button>

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
 * whole surface); the emblem is the Orbit mark — the brand K ringed by an
 * orbit — a self-contained tile that reads as its own thing against that field.
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
        <AiOrbitMark className="mx-auto size-16 rounded-full shadow-lg shadow-primary/25" />
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

/**
 * The "About you" editor. What the person writes here is sent with each question
 * and dropped into the assistant's instructions, so a real model can match their
 * tone, interests, language and slang. Stored in this browser only.
 */
function ProfileDialog({
  open,
  onOpenChange,
  value,
  onSave,
  canAdapt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onSave: (text: string) => void;
  canAdapt: boolean;
}) {
  const [text, setText] = React.useState(value);
  React.useEffect(() => {
    if (open) setText(value);
  }, [open, value]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>About you</DialogTitle>
          <DialogDescription>
            {canAdapt
              ? "The assistant reads this to match your tone and what you care about. Kept in this browser only."
              : "Kept in this browser only. It shapes answers once a real model is set (a free Gemini key does it) — the free built-in answers from a fixed knowledge base and can't adapt its tone."}
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          rows={6}
          placeholder="Ví dụ: Mình là PM, thích trả lời ngắn gọn, thẳng vào việc. Hay dùng tiếng Việt + teencode. Quan tâm deadline và các bước tiếp theo rõ ràng."
          aria-label="About you"
        />

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => onSave("")} disabled={!text.trim()}>
            Clear
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => onSave(text)}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
