import { guideForPath, PRODUCT_GUIDE } from "@/lib/product-guide";

/**
 * What to offer somebody staring at an empty conversation.
 *
 * An empty box is the hardest part of any assistant. People do not know what it
 * can do, so they either ask nothing or ask something it is bad at and conclude
 * it is useless. A handful of concrete openers is worth more than a paragraph
 * explaining the feature.
 *
 * Two kinds, and the distinction is the whole design:
 *
 * - **Grounded** ones name a page that really exists, taken from the product
 *   guide, so pressing one is guaranteed to produce an answer the assistant can
 *   actually give.
 * - **Open** ones are about the person's own work, where there is no right
 *   answer to be wrong about.
 *
 * Nothing here invents a feature. A suggestion reading "Ask it to set up your
 * recurring reports" would be a promise the product has to keep.
 */

export type Suggestion = {
  /** What the button says. Short — it sits in a grid. */
  label: string;
  /** What actually goes in the box. Fuller than the label, and specific. */
  prompt: string;
  group: "this page" | "learn" | "work" | "make";
};

/** Openers that always make sense, wherever the person is. */
export const GENERAL_SUGGESTIONS: Suggestion[] = [
  {
    label: "What can this app do?",
    prompt: "Give me a tour of Kanovra. What are the main pages and what is each one for?",
    group: "learn",
  },
  {
    label: "How do I share a board?",
    prompt:
      "How do I give somebody outside the workspace a read-only link to a project board? What exactly will they be able to see?",
    group: "learn",
  },
  {
    label: "What can each role do?",
    prompt:
      "Explain the four roles — Owner, Admin, Member, Viewer — and give me an example of something each one can do that the one below cannot.",
    group: "learn",
  },
  {
    label: "Keyboard shortcuts",
    prompt: "What keyboard shortcuts does this app have, and what does each one do?",
    group: "learn",
  },
  {
    label: "Break a task down",
    prompt:
      "I need to break a piece of work into subtasks. I'll describe it and you propose 3–6 subtasks, each one something a single person could finish on its own.",
    group: "work",
  },
  {
    label: "Plan a week",
    prompt:
      "Help me plan the coming week. Ask me what is on my plate, then help me order it by what unblocks the most other work.",
    group: "work",
  },
  {
    label: "Write a task description",
    prompt:
      "I'll give you a task title. Write a description for it: a short paragraph of context, then acceptance criteria as a bulleted list.",
    group: "work",
  },
  {
    label: "Think a decision through",
    prompt:
      "I have a decision to make and I want to think it through out loud. Ask me what the options are, then help me weigh them — including the cost of each, not just the benefit.",
    group: "work",
  },
];

/** Offered only when a provider that makes pictures is configured. */
export const IMAGE_SUGGESTIONS: Suggestion[] = [
  {
    label: "Make a picture",
    prompt: "Draw a clean, simple illustration for a project banner about ",
    group: "make",
  },
  {
    label: "An icon idea",
    prompt: "Make a simple, flat icon on a plain background representing ",
    group: "make",
  },
];

/**
 * Suggestions for the page the person came from.
 *
 * Built from the guide rather than written twice: the first control of the page
 * they are on is, by construction, something that exists and that the assistant
 * has been told about. A hand-written list here would be a second description
 * of the product, drifting against the first.
 */
export function suggestionsForPath(pathname: string | null | undefined): Suggestion[] {
  const entry = pathname ? guideForPath(pathname) : undefined;
  if (!entry) return [];

  const out: Suggestion[] = [
    {
      label: `How does ${entry.name} work?`,
      prompt: `Explain the ${entry.name} page: what it is for, and what each control on it does.`,
      group: "this page",
    },
  ];

  const first = entry.controls[0];
  if (first) {
    out.push({
      label: `What does "${first.label}" do?`,
      prompt: `On the ${entry.name} page, what does "${first.label}" do, and when would I use it?`,
      group: "this page",
    });
  }

  if (entry.notes?.length) {
    out.push({
      label: `Anything surprising here?`,
      prompt: `What surprises people about the ${entry.name} page? Things the interface does not say about itself.`,
      group: "this page",
    });
  }

  return out;
}

/**
 * The set to draw, given where the person is and what is configured.
 *
 * Capped, because a wall of suggestions is the same problem as an empty box
 * wearing a different hat — nobody reads twenty options either.
 */
export function suggestionsFor(input: {
  pathname?: string | null;
  canMakeImages?: boolean;
  limit?: number;
}): Suggestion[] {
  const limit = input.limit ?? 6;
  const all = [
    ...suggestionsForPath(input.pathname),
    ...GENERAL_SUGGESTIONS,
    ...(input.canMakeImages ? IMAGE_SUGGESTIONS : []),
  ];
  return all.slice(0, limit);
}

/** Every page name the suggestions can mention, for the test that keeps them honest. */
export function pagesWithSuggestions(): string[] {
  return PRODUCT_GUIDE.map((e) => e.route);
}
