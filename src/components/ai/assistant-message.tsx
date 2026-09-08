"use client";

import { Loader2, Sparkles } from "lucide-react";

import type { ChatMessage } from "@/components/ai/assistant";
import { findModel } from "@/lib/ai-providers";
import { cn } from "@/lib/utils";

/**
 * One turn in the conversation.
 *
 * ## The answer is rendered as text, not as HTML
 *
 * A model's output is untrusted in exactly the way a comment is: it is
 * influenced by whatever the person typed, and this application has already
 * decided elsewhere that an uploaded `.svg` downloads rather than renders
 * because rendering it same-origin would be stored XSS. Running a markdown
 * pipeline over model output on this origin is the same risk with better
 * manners, so the answer keeps its line breaks and its structure and is
 * otherwise plain text.
 *
 * The one exception is the lightest possible: `**bold**` becomes bold, because
 * models emphasise the answer and losing it makes a reply harder to skim. It is
 * done by splitting on a delimiter and building elements — never by writing a
 * string into the DOM — so there is no path from model output to markup.
 */
export function AssistantMessage({
  message,
  streaming,
}: {
  message: ChatMessage;
  streaming?: boolean;
}) {
  const mine = message.role === "user";
  const model = message.model ? findModel(message.model) : null;
  const empty = !message.content.trim();

  if (mine) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <Sparkles className="size-3.5 text-muted-foreground" />
      </span>

      <div className="min-w-0 flex-1 space-y-2">
        {message.hasImage ? (
          /* A plain <img>, and `next/image` deliberately not used: this project
             keeps `remotePatterns` empty so `/_next/image` refuses every URL —
             see the note in next.config.ts about the bundled `sharp` and its
             CVEs. The picture is served from a route that re-checks the owner. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/ai/image/${message.id}`}
            alt={message.content}
            className="max-w-full rounded-lg border"
          />
        ) : null}

        {empty && streaming ? (
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Thinking…
          </span>
        ) : (
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            <Emphasised text={message.content} />
          </div>
        )}

        {model ? (
          <p className="text-[11px] text-muted-foreground">{model.model.label}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * `**bold**`, and nothing else.
 *
 * Split on the delimiter and build React elements from the pieces. The odd
 * indices are the emphasised runs, so an unmatched `**` simply leaves its text
 * alone rather than swallowing the rest of the answer — which is what a regex
 * replace into `innerHTML` would do, on top of being an injection.
 */
function Emphasised({ text }: { text: string }) {
  const parts = text.split("**");
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className={cn("font-semibold")}>
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
