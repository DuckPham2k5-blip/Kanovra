/**
 * Which assistants this application can talk to, and what each can do.
 *
 * ## Names, capabilities and keys in one place
 *
 * The picker in the browser, the route that answers a message, and the sentence
 * explaining why something is unavailable all have to agree about what exists.
 * Three lists would disagree the first time a model was renamed — and the way
 * that shows up is a picker offering something the server refuses, which reads
 * as the application being broken rather than as a stale constant.
 *
 * ## No key ever crosses to the browser
 *
 * `providerStatus` takes an environment and returns booleans. The server calls
 * it with `process.env` and sends the result to the client, so the browser
 * learns *that* Gemini is configured and never learns the key. This module is
 * deliberately not `server-only`, because the picker needs the names and the
 * capabilities — but it holds no secret to leak, only the names of variables.
 */

export type AiCapability = "text" | "reasoning" | "images" | "vision";

export type AiModel = {
  id: string;
  label: string;
  /** One line for the picker: when somebody would pick this over its siblings. */
  hint: string;
  capabilities: AiCapability[];
};

export type AiProvider = {
  id: "anthropic" | "google" | "openai";
  label: string;
  /** What the picker calls the family, for people who know the product name. */
  familiarName: string;
  envVar: string;
  models: AiModel[];
  /** Where to get a key, shown when the provider is not configured. */
  keyUrl: string;
};

export const AI_PROVIDERS: AiProvider[] = [
  {
    id: "anthropic",
    label: "Claude",
    familiarName: "Claude",
    envVar: "ANTHROPIC_API_KEY",
    keyUrl: "https://console.anthropic.com/settings/keys",
    models: [
      {
        id: "claude-opus-5",
        label: "Claude Opus 5",
        hint: "The most capable. Best for anything that needs working out.",
        capabilities: ["text", "reasoning", "vision"],
      },
      {
        id: "claude-sonnet-5",
        label: "Claude Sonnet 5",
        hint: "Quicker, and enough for most questions about the app.",
        capabilities: ["text", "reasoning", "vision"],
      },
      {
        id: "claude-haiku-4-5-20251001",
        label: "Claude Haiku 4.5",
        hint: "Fastest and cheapest. Good for short 'how do I…' questions.",
        capabilities: ["text", "vision"],
      },
    ],
  },
  {
    id: "google",
    label: "Gemini",
    familiarName: "Gemini",
    envVar: "GOOGLE_AI_API_KEY",
    keyUrl: "https://aistudio.google.com/apikey",
    models: [
      {
        id: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        hint: "Google's most capable, and it can look at pictures.",
        capabilities: ["text", "reasoning", "vision"],
      },
      {
        id: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        hint: "Fast and cheap.",
        capabilities: ["text", "vision"],
      },
      {
        id: "imagen-3.0-generate-002",
        label: "Imagen 3",
        hint: "Makes a picture from a description. It does not hold a conversation.",
        capabilities: ["images"],
      },
    ],
  },
  {
    id: "openai",
    label: "ChatGPT",
    familiarName: "ChatGPT",
    envVar: "OPENAI_API_KEY",
    keyUrl: "https://platform.openai.com/api-keys",
    models: [
      {
        id: "gpt-5",
        label: "GPT-5",
        hint: "OpenAI's most capable.",
        capabilities: ["text", "reasoning", "vision"],
      },
      {
        id: "gpt-5-mini",
        label: "GPT-5 mini",
        hint: "Fast and cheap.",
        capabilities: ["text", "vision"],
      },
      {
        id: "gpt-image-1",
        label: "GPT Image 1",
        hint: "Makes a picture from a description. It does not hold a conversation.",
        capabilities: ["images"],
      },
    ],
  },
];

/**
 * Assistants people will ask for that cannot be here, and why.
 *
 * Written down rather than left as a silence. "Why is Copilot not in the list"
 * is a question somebody will ask once a month for the life of the product, and
 * an answer in the interface costs nothing; an absence with no explanation
 * reads as an oversight and gets re-raised for ever.
 */
export const UNAVAILABLE_ASSISTANTS = [
  {
    label: "GitHub Copilot",
    reason:
      "Copilot has no public chat API to connect an application to — it is available inside GitHub's own editors and products only.",
  },
  {
    label: "Microsoft Copilot",
    reason:
      "Its API is sold through Microsoft 365 / Azure agreements rather than a key you can paste in, so it cannot be enabled the way the others are.",
  },
] as const;

export type ProviderStatus = {
  id: AiProvider["id"];
  label: string;
  configured: boolean;
  envVar: string;
  keyUrl: string;
  models: AiModel[];
};

/**
 * Which providers have a key, from an environment.
 *
 * Takes the environment rather than reading `process.env` so it can be tested
 * without mutating the process — and, more importantly, so it is obvious at
 * every call site that this is the one function that looks at secrets.
 *
 * A key that is present but empty, or still holding a placeholder, counts as
 * missing: `CLERK_WEBHOOK_SECRET` sat in this project's `.env` as `whsec_xxxx…`
 * for weeks and everything treated it as configured, so the webhook had never
 * once run. A truthiness check would repeat that exactly.
 */
export function providerStatus(env: Record<string, string | undefined>): ProviderStatus[] {
  return AI_PROVIDERS.map((provider) => ({
    id: provider.id,
    label: provider.label,
    configured: isRealKey(env[provider.envVar]),
    envVar: provider.envVar,
    keyUrl: provider.keyUrl,
    models: provider.models,
  }));
}

/** A value that is present, non-blank, long enough to be real, and not a placeholder. */
export function isRealKey(value: string | undefined | null): boolean {
  const key = value?.trim();
  if (!key || key.length < 16) return false;
  // Placeholders in this repo's `.env.example` are deliberately shaped like
  // `<your-…-key>`; runs of x or the word "your" are the other two spellings
  // people reach for.
  if (/^<.*>$/.test(key)) return false;
  if (/x{8,}/i.test(key)) return false;
  if (/your[-_ ]?(api[-_ ]?)?key/i.test(key)) return false;
  return true;
}

/** The model with this id, whatever provider it belongs to. */
export function findModel(modelId: string): { provider: AiProvider; model: AiModel } | null {
  for (const provider of AI_PROVIDERS) {
    const model = provider.models.find((m) => m.id === modelId);
    if (model) return { provider, model };
  }
  return null;
}

/**
 * The model a conversation should open with.
 *
 * The first chat-capable model of the first configured provider, in the order
 * declared above. Null when nothing is configured, which the page turns into a
 * sentence naming the variable to set rather than an empty picker.
 */
export function defaultModel(statuses: ProviderStatus[]): string | null {
  for (const status of statuses) {
    if (!status.configured) continue;
    const model = status.models.find((m) => m.capabilities.includes("text"));
    if (model) return model.id;
  }
  return null;
}

/** True when some configured provider can do this. */
export function capabilityAvailable(
  statuses: ProviderStatus[],
  capability: AiCapability,
): boolean {
  return statuses.some(
    (s) => s.configured && s.models.some((m) => m.capabilities.includes(capability)),
  );
}
