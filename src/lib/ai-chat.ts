import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { builtinChunks, builtinReply } from "@/lib/ai-builtin";
import { AI_PROVIDERS, findModel, isRealKey } from "@/lib/ai-providers";
import { guideAsText, guideForPath } from "@/lib/product-guide";
import { parseJsonFrame, SseDecoder } from "@/lib/sse-parse";

/**
 * Talking to whichever assistant was picked.
 *
 * Three providers, one shape: hand in a conversation, get back an async
 * iterable of text as it is written. The adapters are deliberately thin —
 * Anthropic through its SDK because it is already a dependency, Google and
 * OpenAI through plain `fetch` because adding two more SDKs would put megabytes
 * into `node_modules` and a stream of release notes into this project's future
 * for two HTTP calls.
 *
 * Nothing here decides *whether* the caller may ask. The route does that.
 */

export type ChatTurn = { role: "user" | "assistant"; content: string };

export class AiProviderNotConfiguredError extends Error {
  constructor(public readonly envVar: string) {
    super(`Set ${envVar} to use this assistant.`);
    this.name = "AiProviderNotConfiguredError";
  }
}

export class AiModelUnknownError extends Error {
  constructor(modelId: string) {
    super(`No such model: ${modelId}`);
    this.name = "AiModelUnknownError";
  }
}

/**
 * What the assistant is told before it is asked anything.
 *
 * The whole product guide goes in. It is a few thousand tokens and the
 * alternative — retrieving the two most relevant entries — is a moving part
 * that can pick the wrong page, which is the exact failure the guide exists to
 * prevent. When the person is on a page we recognise, that page is named again
 * at the end so "this page" has an answer.
 *
 * User text never reaches this string. It is assembled from constants and from
 * a pathname the browser sent, and a pathname that matches no route contributes
 * nothing rather than being interpolated — otherwise the address bar is an
 * injection point into the system prompt.
 */
/**
 * A workspace name, safe to drop into a sentence.
 *
 * The guarantee is *structural*, not a word filter: every run of whitespace
 * becomes a single space, so the name cannot open a new line — and a new line
 * is what turns a name into what looks to the model like a fresh instruction.
 * A `#` left mid-sentence is not a heading and is not a threat, and stripping
 * it would rename a team genuinely called "C# guild".
 */
function flattenForPrompt(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, 80);
}

export function buildSystemPrompt(input: {
  workspaceName: string;
  currentPath?: string | null;
}): string {
  const here = input.currentPath ? guideForPath(input.currentPath) : undefined;

  return `You are the assistant built into Kanovra, a team task-management application.
The person you are talking to is signed in and working in a workspace called
"${flattenForPrompt(input.workspaceName)}".

## What you are for

Two things, and you can tell which is being asked:

1. Explaining this application — what a page is for, what a control does, where
   to find it, what a role is allowed to do.
2. Helping with the work itself — breaking a task down, drafting a description,
   thinking through a plan, weighing an approach.

## The rule that matters most

Everything you say about where a control is must come from the guide below. If
somebody asks about something that is not in it, say plainly that you cannot
find it rather than describing where it would probably be. Most task managers
have a Share button in the top right; this one puts sharing in the project's ⋯
menu, and a confident wrong answer costs the reader their trust in the screen in
front of them. "I don't see that in this app — here is what is nearby" is a good
answer. An invented one is not.

You are also not able to press anything. You explain; the person acts.

## How to write

- Answer in the language the person wrote in. Vietnamese question, Vietnamese
  answer.
- Lead with the answer. No preamble, no restating the question.
- For "how do I…", give the steps in order, naming the control exactly as it is
  labelled on screen.
- Short. A person mid-task is not reading an essay.

# The application

${guideAsText()}

## Roles

Viewer is read-only. Member does day-to-day work — tasks, comments, projects,
maps. Admin manages people, settings, archiving and deletion, and is the lowest
role that can publish a board publicly. Owner is everything, plus deleting the
workspace and transferring ownership. Permission is always checked on the
server, so a control that is hidden is not merely hidden.
${here ? `\n## Where they are right now\n\nThe person is on: ${here.name} (${here.route}). If they say "this page" or "here", they mean that one.` : ""}`;
}

/**
 * Streams an answer, a piece of text at a time.
 *
 * An async generator rather than a callback, so the route can pipe it straight
 * into a `ReadableStream` and cancellation propagates on its own when the
 * reader goes away — a person closing the tab mid-answer should stop the bill,
 * not keep a request running to the end for nobody.
 */
export async function* streamChat(input: {
  modelId: string;
  system: string;
  turns: ChatTurn[];
  /** Ask the model to work the answer out at more length before replying. */
  thinking?: boolean;
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const found = findModel(input.modelId);
  if (!found) throw new AiModelUnknownError(input.modelId);

  const { provider, model } = found;

  // The built-in assistant answers here, from the app's own knowledge — no key,
  // no network. Handled before the key check because it has no key to check.
  if (provider.id === "builtin") {
    yield* streamBuiltin(input.turns);
    return;
  }

  const key = process.env[provider.envVar];
  if (!isRealKey(key)) throw new AiProviderNotConfiguredError(provider.envVar);

  const thinking = Boolean(input.thinking) && model.capabilities.includes("reasoning");

  switch (provider.id) {
    case "anthropic":
      yield* streamAnthropic({ ...input, key: key!, thinking });
      return;
    case "google":
      yield* streamGoogle({ ...input, key: key!, thinking });
      return;
    case "openai":
      yield* streamOpenAi({ ...input, key: key!, thinking });
      return;
  }
}

/**
 * The built-in assistant's answer, streamed in small pieces like a model's.
 *
 * It reads the latest question — the system prompt and the earlier turns are for
 * a real model and this needs neither — matches it to the app's knowledge base,
 * and emits the reply a few words at a time so the page fills in as it would for
 * any other provider.
 */
async function* streamBuiltin(turns: ChatTurn[]): AsyncGenerator<string> {
  const question = [...turns].reverse().find((t) => t.role === "user")?.content ?? "";
  for (const piece of builtinChunks(builtinReply(question))) {
    yield piece;
  }
}

async function* streamAnthropic(input: {
  modelId: string;
  system: string;
  turns: ChatTurn[];
  key: string;
  thinking: boolean;
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const client = new Anthropic({ apiKey: input.key });

  const stream = client.messages.stream(
    {
      model: input.modelId,
      max_tokens: 4000,
      /*
       * Marked cacheable, because it is the same ~5,300 tokens on every single
       * turn of every conversation — the whole product guide, which is the
       * point of it. Paying full price to re-send an unchanged block on each
       * message is the sort of cost that is invisible until a bill arrives.
       *
       * An array of blocks rather than a plain string is what carries the
       * marker; the content is identical either way. A cache miss costs
       * slightly more than no caching at all, which is why the marker sits on
       * the one block guaranteed to be byte-identical between turns — the
       * conversation itself is deliberately not marked, since it changes with
       * every message and would miss every time.
       */
      system: [{ type: "text" as const, text: input.system, cache_control: { type: "ephemeral" as const } }],
      ...(input.thinking ? { thinking: { type: "adaptive" as const } } : {}),
      output_config: { effort: input.thinking ? ("high" as const) : ("low" as const) },
      messages: input.turns.map((t) => ({ role: t.role, content: t.content })),
    },
    { signal: input.signal },
  );

  for await (const event of stream) {
    // Only the answer. Thinking blocks arrive on this stream too and are
    // deliberately not forwarded: they are the model's workings, not its reply,
    // and showing them beside the answer makes the answer harder to find.
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

async function* streamGoogle(input: {
  modelId: string;
  system: string;
  turns: ChatTurn[];
  key: string;
  thinking: boolean;
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.modelId)}` +
    `:streamGenerateContent?alt=sse`;

  const response = await fetch(url, {
    method: "POST",
    signal: input.signal,
    headers: { "content-type": "application/json", "x-goog-api-key": input.key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.system }] },
      contents: input.turns.map((t) => ({
        // Google calls the assistant "model"; everything else calls it
        // "assistant". The mapping lives here rather than in the caller.
        role: t.role === "assistant" ? "model" : "user",
        parts: [{ text: t.content }],
      })),
      generationConfig: {
        maxOutputTokens: 4000,
        ...(input.thinking ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
      },
    }),
  });

  yield* readSse(response, (frame: GoogleFrame) => {
    const parts = frame.candidates?.[0]?.content?.parts ?? [];
    return parts.map((p) => p.text ?? "").join("");
  });
}

async function* streamOpenAi(input: {
  modelId: string;
  system: string;
  turns: ChatTurn[];
  key: string;
  thinking: boolean;
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: input.signal,
    headers: { "content-type": "application/json", authorization: `Bearer ${input.key}` },
    body: JSON.stringify({
      model: input.modelId,
      stream: true,
      messages: [
        { role: "system", content: input.system },
        ...input.turns.map((t) => ({ role: t.role, content: t.content })),
      ],
      ...(input.thinking ? { reasoning_effort: "high" } : {}),
    }),
  });

  yield* readSse(response, (frame: OpenAiFrame) => frame.choices?.[0]?.delta?.content ?? "");
}

type GoogleFrame = { candidates?: { content?: { parts?: { text?: string }[] } }[] };
type OpenAiFrame = { choices?: { delta?: { content?: string } }[] };

/**
 * The shared half of the two SSE providers.
 *
 * A failed response is read as text and thrown with the provider's own message
 * in it — an assistant that says "something went wrong" when the provider said
 * "you are out of credit" wastes the reader's afternoon. The body is truncated
 * because an error page can be a whole HTML document.
 */
async function* readSse<T>(response: Response, textOf: (frame: T) => string): AsyncGenerator<string> {
  if (!response.ok || !response.body) {
    const detail = (await response.text().catch(() => "")).slice(0, 400);
    throw new Error(`The assistant's provider refused the request (${response.status}). ${detail}`);
  }

  const decoder = new SseDecoder();
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const payload of decoder.push(value)) {
        const frame = parseJsonFrame<T>(payload);
        if (!frame) continue;
        const text = textOf(frame);
        if (text) yield text;
      }
    }
    for (const payload of decoder.flush()) {
      const frame = parseJsonFrame<T>(payload);
      if (frame) {
        const text = textOf(frame);
        if (text) yield text;
      }
    }
  } finally {
    // Releasing matters when the reader abandoned the stream early — a person
    // closing the tab mid-answer, which is the common case.
    reader.releaseLock();
  }
}

/**
 * A picture from a description.
 *
 * Claude cannot do this, so the model picker only offers it once Gemini or
 * ChatGPT has a key. That is stated in the interface rather than discovered by
 * pressing a button and getting an error.
 */
export async function generateImage(input: {
  modelId: string;
  prompt: string;
  signal?: AbortSignal;
}): Promise<{ bytes: Buffer; mime: string }> {
  const found = findModel(input.modelId);
  if (!found) throw new AiModelUnknownError(input.modelId);
  if (!found.model.capabilities.includes("images")) {
    throw new Error(`${found.model.label} does not make pictures.`);
  }

  const key = process.env[found.provider.envVar];
  if (!isRealKey(key)) throw new AiProviderNotConfiguredError(found.provider.envVar);

  if (found.provider.id === "google") {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.modelId)}:predict`,
      {
        method: "POST",
        signal: input.signal,
        headers: { "content-type": "application/json", "x-goog-api-key": key! },
        body: JSON.stringify({
          instances: [{ prompt: input.prompt }],
          parameters: { sampleCount: 1 },
        }),
      },
    );
    const body = (await response.json().catch(() => null)) as {
      predictions?: { bytesBase64Encoded?: string; mimeType?: string }[];
      error?: { message?: string };
    } | null;
    if (!response.ok) throw new Error(body?.error?.message ?? `Image request failed (${response.status}).`);

    const first = body?.predictions?.[0];
    if (!first?.bytesBase64Encoded) throw new Error("The provider returned no picture.");
    return { bytes: decodePicture(first.bytesBase64Encoded), mime: first.mimeType ?? "image/png" };
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    signal: input.signal,
    headers: { "content-type": "application/json", authorization: `Bearer ${key!}` },
    body: JSON.stringify({ model: input.modelId, prompt: input.prompt, n: 1, size: "1024x1024" }),
  });
  const body = (await response.json().catch(() => null)) as {
    data?: { b64_json?: string }[];
    error?: { message?: string };
  } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? `Image request failed (${response.status}).`);

  const b64 = body?.data?.[0]?.b64_json;
  if (!b64) throw new Error("The provider returned no picture.");
  return { bytes: decodePicture(b64), mime: "image/png" };
}

/**
 * Base64 to bytes, refusing to hand back nothing.
 *
 * `Buffer.from(x, "base64")` does not throw on rubbish. It skips whatever it
 * cannot decode and returns what is left, which for a short enough string is an
 * empty buffer — and an empty buffer is written to disk as a zero-byte file
 * with a message row pointing at it. The reader then sees a broken image in
 * their conversation with no error anywhere behind it, which is a worse outcome
 * than the request having failed: a failure can be retried, and a saved blank
 * looks like the picture that was made.
 */
function decodePicture(base64: string): Buffer {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) throw new Error("The provider returned no picture.");
  return bytes;
}

/** Providers that are configured right now, for the page to render its picker. */
export function configuredProviderIds(): string[] {
  return AI_PROVIDERS.filter((p) => isRealKey(process.env[p.envVar])).map((p) => p.id);
}
