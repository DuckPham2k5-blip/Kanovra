import { afterEach, describe, expect, it, vi } from "vitest";

import { buildSystemPrompt, streamChat } from "@/lib/ai-chat";
import { conceptIds, groundsClaimed } from "@/lib/ai-suggestions";
import { PRODUCT_CONCEPTS, shortcutsAsText } from "@/lib/product-concepts";
import { guideAsText } from "@/lib/product-guide";
import { FOREIGN_SHORTCUTS, SHORTCUTS } from "@/lib/shortcuts";

/**
 * Whether the assistant can actually answer what the product invites it to be
 * asked, and whether the grounding reaches the model at all.
 *
 * These exist because two openers on the assistant page were found asking
 * questions the grounding could not answer: "Keyboard shortcuts", while nothing
 * in the prompt mentioned a single key, and "what exactly will they be able to
 * see?" about share links, while the prompt knew only that the button is in a
 * menu. An application that invites a question its assistant must invent an
 * answer to is worse than one that offers no openers: the fabrication arrives
 * carrying the product's own endorsement.
 */

describe("every opener is grounded", () => {
  it("names only concepts that exist", () => {
    const known = new Set(conceptIds());
    const missing = groundsClaimed().filter((g) => !known.has(g));
    expect(
      missing,
      `openers lean on concepts that are not written down: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("puts every concept it claims into the prompt", () => {
    const prompt = buildSystemPrompt({ workspaceName: "Acme" });
    for (const id of groundsClaimed()) {
      const concept = PRODUCT_CONCEPTS.find((c) => c.id === id)!;
      expect(prompt, `"${concept.title}" is claimed by an opener but absent from the prompt`)
        .toContain(concept.title);
    }
  });
});

describe("the sharing answer, which was the one that was wrong", () => {
  const prompt = buildSystemPrompt({ workspaceName: "Acme" });

  it("names the menu the control is actually in", () => {
    // Most task managers put this in a top-right Share button. This one does
    // not, and that is exactly the answer a model gets wrong from its priors.
    expect(prompt).toContain("⋯ menu");
    expect(prompt).toContain("Share board");
  });

  it("says which role is needed", () => {
    expect(prompt).toMatch(/Admin role or above/);
  });

  it("can answer what a visitor sees, and what they do not", () => {
    expect(prompt).toContain("What a visitor sees");
    for (const hidden of ["Email addresses", "comments", "attachments", "time entries"]) {
      expect(prompt.toLowerCase(), hidden).toContain(hidden.toLowerCase());
    }
  });

  it("can answer how to stop it", () => {
    expect(prompt).toContain("Turn off");
  });
});

describe("shortcuts are derived, not retyped", () => {
  const text = shortcutsAsText();

  it("lists every shortcut the application really has", () => {
    for (const s of SHORTCUTS) {
      expect(text, s.label).toContain(s.label);
    }
    for (const s of FOREIGN_SHORTCUTS) {
      expect(text, s.label).toContain(s.label);
    }
  });

  it("prints the keys the app's own help sheet prints", () => {
    // `Ctrl`, not the Mac symbol: the top bar's chip says Ctrl K on this
    // machine, and an assistant naming a different key than the control beside
    // it is worse than one naming only the commoner key.
    expect(text).toContain("Ctrl then K");
    expect(text).not.toContain("⌘");
  });

  it("explains that G is a sequence, which nothing else says", () => {
    expect(text).toContain("press G, release it");
  });

  /*
   * The property that makes deriving worth it: this cannot go stale. If a
   * binding is added to the table and this list were hand-written, the
   * assistant would confidently name a key that does nothing — and nothing
   * would fail.
   */
  it("covers the tables exactly, with nothing invented", () => {
    const listed = text.match(/^- (.+?) — /gm)?.length ?? 0;
    expect(listed).toBe(SHORTCUTS.length + FOREIGN_SHORTCUTS.length);
  });
});

/**
 * And the question underneath all of it: does any of this reach the model?
 *
 * Everything above tests a string that a function returns. This tests what
 * actually goes out on the wire, by standing in for the network — because a
 * perfect prompt that the request body never carries is the exact failure the
 * owner asked about, and no amount of testing `buildSystemPrompt` would show it.
 */
describe("the About-you note is carried into the prompt", () => {
  it("adds a fenced preference section when a profile is given", () => {
    const prompt = buildSystemPrompt({
      workspaceName: "Acme",
      userProfile: "I'm a PM. Keep answers short and use casual slang.",
    });
    expect(prompt).toContain("About the person you are talking to");
    expect(prompt).toContain("I'm a PM. Keep answers short and use casual slang.");
    // Framed as a preference, not an instruction that overrides the rules.
    expect(prompt).toMatch(/preference/i);
    expect(prompt).toMatch(/never overrides the rules/i);
  });

  it("adds nothing when there is no profile", () => {
    const prompt = buildSystemPrompt({ workspaceName: "Acme" });
    expect(prompt).not.toContain("About the person you are talking to");
  });

  it("caps a very long profile so it cannot flood the prompt", () => {
    const prompt = buildSystemPrompt({ workspaceName: "Acme", userProfile: "x".repeat(2000) });
    expect(prompt).toContain("About the person you are talking to");
    // The profile block is trimmed to an 800-char run, not the 2000 sent.
    expect(prompt).toContain("x".repeat(800));
    expect(prompt).not.toContain("x".repeat(801));
  });
});

describe("the grounding reaches the provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function captureRequest(modelId: string, envVar: string) {
    vi.stubEnv(envVar, "test-key-abcdefghijklmnopqrstuvwxyz");

    let captured: { url: string; body: unknown } | null = null;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      captured = { url: String(url), body: JSON.parse(String(init.body)) };
      // An empty but valid stream: the generator finishes and yields nothing,
      // which is all this test needs.
      return new Response(new ReadableStream({ start: (c) => c.close() }), { status: 200 });
    });

    const stream = streamChat({
      modelId,
      system: buildSystemPrompt({ workspaceName: "Acme", currentPath: "/w/acme/projects/p1/board" }),
      turns: [{ role: "user", content: "How do I share a board?" }],
    });
    for await (const _ of stream) {
      // drain
    }

    return captured!;
  }

  it("sends the guide to Gemini, in the system instruction", async () => {
    const req = await captureRequest("gemini-2.5-flash", "GOOGLE_AI_API_KEY");
    const body = req.body as { systemInstruction: { parts: { text: string }[] } };
    const system = body.systemInstruction.parts[0].text;

    expect(req.url).toContain("generativelanguage.googleapis.com");
    expect(system).toContain("⋯ menu");
    expect(system).toContain("Kanban board");
    expect(system).toContain("Ctrl then K");
  });

  it("sends the guide to OpenAI, as the system message", async () => {
    const req = await captureRequest("gpt-5-mini", "OPENAI_API_KEY");
    const body = req.body as { messages: { role: string; content: string }[] };
    const system = body.messages.find((m) => m.role === "system")!.content;

    expect(req.url).toContain("api.openai.com");
    expect(system).toContain("⋯ menu");
    expect(system).toContain("Kanban board");
  });

  it("sends the guide to OpenRouter, as the system message", async () => {
    const req = await captureRequest("qwen/qwen3.8-27b:free", "OPENROUTER_API_KEY");
    const body = req.body as { messages: { role: string; content: string }[] };
    const system = body.messages.find((m) => m.role === "system")!.content;

    expect(req.url).toContain("openrouter.ai");
    expect(system).toContain("⋯ menu");
    expect(system).toContain("Kanban board");
  });

  it("sends the guide to Groq, as the system message", async () => {
    const req = await captureRequest("llama-3.3-70b-versatile", "GROQ_API_KEY");
    const body = req.body as { messages: { role: string; content: string }[] };
    const system = body.messages.find((m) => m.role === "system")!.content;

    expect(req.url).toContain("api.groq.com");
    expect(system).toContain("⋯ menu");
    expect(system).toContain("Kanban board");
  });

  it("carries the whole guide, not a truncated head of it", async () => {
    // A prompt assembled correctly and then cut by a max-length somewhere would
    // lose the concepts at the end — the sharing answer among them — and the
    // assistant would be wrong about exactly the things added last.
    const req = await captureRequest("gpt-5-mini", "OPENAI_API_KEY");
    const body = req.body as { messages: { content: string }[] };
    expect(body.messages[0].content.length).toBeGreaterThanOrEqual(guideAsText().length);
  });
});
