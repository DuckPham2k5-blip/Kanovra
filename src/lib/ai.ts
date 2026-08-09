import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { logError } from "@/lib/logger";

/**
 * Claude-backed assistant helpers.
 *
 * Every function here is server-only and takes already-authorised data — the
 * caller is responsible for asserting workspace membership before handing
 * anything to the model. Nothing user-typed is ever concatenated into the
 * system prompt; task text always arrives as user-turn content.
 */

const MODEL = "claude-opus-5";

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
}

export function isAiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("The AI assistant is not configured. Add ANTHROPIC_API_KEY to enable it.");
    this.name = "AiNotConfiguredError";
  }
}

/** Text content of a response, with thinking blocks skipped. */
function textOf(message: Anthropic.Message) {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

const SYSTEM = `You are the assistant inside Kanovra, a team task-management app.

You help teams turn vague intentions into concrete, well-scoped work. You are
concise: product surfaces have limited room, so answer in the shape asked for and
skip preamble.

Rules:
- Write in the same language the user's content is in. If the task titles are in
  Vietnamese, answer in Vietnamese; if English, answer in English.
- Never invent facts about the project. Work only from the data you are given.
- When you propose subtasks, each one must be independently completable and
  phrased as an action.`;

export type SubtaskSuggestion = { title: string; reason: string };

/** Proposes a breakdown of a task into independently completable subtasks. */
export async function suggestSubtasks(input: {
  title: string;
  description?: string | null;
  projectName: string;
}): Promise<SubtaskSuggestion[]> {
  const anthropic = getClient();
  if (!anthropic) throw new AiNotConfiguredError();

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            subtasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  reason: { type: "string" },
                },
                required: ["title", "reason"],
                additionalProperties: false,
              },
            },
          },
          required: ["subtasks"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "user",
        content: `Project: ${input.projectName}
Task: ${input.title}
${input.description ? `Description:\n${input.description}` : "(no description)"}

Break this into 3–6 subtasks. For each, give a short imperative title and a
one-line reason explaining what it covers.`,
      },
    ],
  });

  if (message.stop_reason === "refusal") return [];

  try {
    const parsed = JSON.parse(textOf(message)) as { subtasks?: SubtaskSuggestion[] };
    return parsed.subtasks ?? [];
  } catch {
    logError("ai.parse", new Error("Model returned unparseable subtask JSON"), { model: MODEL });
    return [];
  }
}

/** Expands a terse task title into a fuller description. */
export async function draftDescription(input: {
  title: string;
  projectName: string;
  existing?: string | null;
}): Promise<string> {
  const anthropic = getClient();
  if (!anthropic) throw new AiNotConfiguredError();

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: `Project: ${input.projectName}
Task title: ${input.title}
${input.existing ? `Current description (improve it):\n${input.existing}` : ""}

Write a task description: a short context paragraph, then a bulleted list of
acceptance criteria. Plain markdown, no heading, under 150 words.`,
      },
    ],
  });

  return message.stop_reason === "refusal" ? "" : textOf(message);
}

export type ProjectDigestInput = {
  projectName: string;
  columns: { name: string; taskCount: number }[];
  overdue: { title: string; daysLate: number }[];
  recentlyCompleted: string[];
  unassignedCount: number;
};

/** A short status read on a project, for the board header. */
export async function summariseProject(input: ProjectDigestInput): Promise<string> {
  const anthropic = getClient();
  if (!anthropic) throw new AiNotConfiguredError();

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: `Summarise the state of this project in 3–5 sentences. Lead with
the single most important thing. Mention risks only if the data shows them.

${JSON.stringify(input, null, 2)}`,
      },
    ],
  });

  return message.stop_reason === "refusal" ? "" : textOf(message);
}
