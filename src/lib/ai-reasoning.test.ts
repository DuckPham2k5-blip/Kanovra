import { afterEach, describe, expect, it, vi } from "vitest";

import { streamChat } from "@/lib/ai-chat";

/**
 * Deep reasoning, proved to reach the wire.
 *
 * The toggle is wired to each provider's own reasoning control, and the gate in
 * `streamChat` withholds it from a model that cannot reason. Both are the kind of
 * thing that fails silently — a reasoning flag that never leaves the process, or
 * one sent to a model that rejects it — so this stands in for the network and
 * reads what the request body actually carries. Gemini and OpenAI only, the same
 * two the grounding test can see: Anthropic goes through its SDK, not `fetch`.
 */
describe("deep reasoning reaches the wire", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function capture(modelId: string, envVar: string, thinking: boolean) {
    vi.stubEnv(envVar, "test-key-abcdefghijklmnopqrstuvwxyz");

    let body: Record<string, unknown> | null = null;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(new ReadableStream({ start: (c) => c.close() }), { status: 200 });
    });

    const stream = streamChat({
      modelId,
      system: "system",
      turns: [{ role: "user", content: "Plan a product launch" }],
      thinking,
    });
    for await (const _ of stream) {
      // drain
    }

    return body!;
  }

  it("asks OpenAI for high reasoning effort only when thinking is on", async () => {
    const on = await capture("gpt-5", "OPENAI_API_KEY", true);
    expect(on.reasoning_effort).toBe("high");

    const off = await capture("gpt-5", "OPENAI_API_KEY", false);
    expect(off.reasoning_effort).toBeUndefined();
  });

  it("lets Gemini think when on, and zeroes its budget when off", async () => {
    const on = (await capture("gemini-2.5-pro", "GOOGLE_AI_API_KEY", true)) as {
      generationConfig: { thinkingConfig?: unknown };
    };
    expect(on.generationConfig.thinkingConfig).toBeUndefined();

    const off = (await capture("gemini-2.5-pro", "GOOGLE_AI_API_KEY", false)) as {
      generationConfig: { thinkingConfig?: unknown };
    };
    expect(off.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it("does not ask a non-reasoning model to reason", async () => {
    // gpt-5-mini has no reasoning capability, so the toggle is ignored — the
    // gate in streamChat that stops a reasoning setting reaching a model that
    // would reject it.
    const on = await capture("gpt-5-mini", "OPENAI_API_KEY", true);
    expect(on.reasoning_effort).toBeUndefined();
  });
});
