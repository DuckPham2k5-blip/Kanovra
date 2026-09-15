import { describe, expect, it } from "vitest";

import {
  AI_PROVIDERS,
  capabilityAvailable,
  defaultModel,
  findModel,
  isRealKey,
  providerStatus,
  UNAVAILABLE_ASSISTANTS,
} from "@/lib/ai-providers";

const REAL = "sk-abcdefghijklmnopqrstuvwxyz0123456789";

describe("isRealKey", () => {
  it("accepts a key that looks like a key", () => {
    expect(isRealKey(REAL)).toBe(true);
    expect(isRealKey(`  ${REAL}  `)).toBe(true);
  });

  it("rejects absent and blank values", () => {
    for (const v of [undefined, null, "", "   "]) expect(isRealKey(v)).toBe(false);
  });

  /*
   * The one that has already cost this project something.
   *
   * `CLERK_WEBHOOK_SECRET` sat in `.env` holding `whsec_xxxx…` for weeks, and
   * every truthiness check in the codebase read it as configured — so the Clerk
   * webhook had never once run, and nothing said so. A placeholder is not a
   * key, and this is the only place that gets to decide that.
   */
  /*
   * The prefixes below are deliberately broken with a `<…>` marker.
   *
   * GitHub's push protection reads `sk_test_` followed by ~24 plausible
   * characters as a Stripe secret and rejects the **entire push** — this
   * project has already lost a push to a string of x's in `.env.example`, and
   * writing the unbroken shape here would rebuild that trap inside the test
   * that exists to reject it. The run of x's is what `isRealKey` actually
   * matches on, and it survives the break.
   */
  it("rejects the placeholder shapes people actually leave behind", () => {
    for (const v of [
      "whsec_<placeholder>xxxxxxxxxxxxxxxx",
      "sk_test_<placeholder>xxxxxxxxxxxxxxxx",
      "<your-anthropic-api-key>",
      "your-api-key-goes-here",
      "YOUR_API_KEY_HERE_PLEASE",
    ]) {
      expect(isRealKey(v), v).toBe(false);
    }
  });

  it("rejects something too short to be a key", () => {
    expect(isRealKey("sk-abc")).toBe(false);
  });
});

describe("providerStatus", () => {
  it("reports only the keyless built-in configured on an empty environment", () => {
    const statuses = providerStatus({});
    expect(statuses).toHaveLength(AI_PROVIDERS.length);
    // The built-in assistant needs no key, so it is always available — that is
    // the whole point of it. Every keyed provider is off with an empty env.
    expect(statuses.find((s) => s.id === "builtin")?.configured).toBe(true);
    expect(statuses.filter((s) => s.id !== "builtin").every((s) => !s.configured)).toBe(true);
  });

  it("reports exactly the providers whose key is present", () => {
    const statuses = providerStatus({ ANTHROPIC_API_KEY: REAL, OPENAI_API_KEY: "  " });
    expect(statuses.find((s) => s.id === "anthropic")?.configured).toBe(true);
    expect(statuses.find((s) => s.id === "openai")?.configured).toBe(false);
    expect(statuses.find((s) => s.id === "google")?.configured).toBe(false);
    // Keyless, so present regardless of the environment.
    expect(statuses.find((s) => s.id === "builtin")?.configured).toBe(true);
  });

  /*
   * The property that matters more than any single assertion: whatever crosses
   * to the browser must not contain a key. The picker needs names, models and a
   * boolean, and this is what stops a later "just send the whole env" edit.
   */
  it("never carries a key in what it returns", () => {
    const env = { ANTHROPIC_API_KEY: REAL, GOOGLE_AI_API_KEY: REAL, OPENAI_API_KEY: REAL };
    const serialised = JSON.stringify(providerStatus(env));
    expect(serialised).not.toContain(REAL);
    // The *name* of the variable is fine and is what the "not configured"
    // message needs; the value is not.
    expect(serialised).toContain("ANTHROPIC_API_KEY");
  });
});

describe("defaultModel", () => {
  it("falls back to the free built-in when no key is set", () => {
    // Never null now: there is always the keyless assistant to open on, so the
    // page is never a dead end for want of a key.
    expect(defaultModel(providerStatus({}))).toBe("kanovra-guide");
  });

  it("prefers a configured keyed provider over the built-in", () => {
    // The built-in is last, so a real key wins the default when there is one.
    expect(defaultModel(providerStatus({ ANTHROPIC_API_KEY: REAL }))).toBe("claude-opus-5");
  });

  /*
   * Never an image model. Those cannot hold a conversation, so opening a chat
   * on one would give a page whose first message fails — and the person would
   * reasonably read that as the assistant being broken.
   */
  it("never opens a conversation on an image model", () => {
    const chosen = defaultModel(providerStatus({ GOOGLE_AI_API_KEY: REAL }));
    expect(chosen).toBe("gemini-2.5-pro");
    expect(findModel(chosen!)?.model.capabilities).toContain("text");
  });
});

describe("capabilityAvailable", () => {
  it("says images are unavailable on Claude alone", () => {
    // Worth stating plainly: Claude does not generate images. A button that is
    // offered and then fails is worse than one that explains why it is off.
    const statuses = providerStatus({ ANTHROPIC_API_KEY: REAL });
    expect(capabilityAvailable(statuses, "text")).toBe(true);
    expect(capabilityAvailable(statuses, "reasoning")).toBe(true);
    expect(capabilityAvailable(statuses, "images")).toBe(false);
  });

  it("says images are available once Gemini or ChatGPT is configured", () => {
    expect(capabilityAvailable(providerStatus({ GOOGLE_AI_API_KEY: REAL }), "images")).toBe(true);
    expect(capabilityAvailable(providerStatus({ OPENAI_API_KEY: REAL }), "images")).toBe(true);
  });

  it("still offers text through the built-in with no keys at all", () => {
    const statuses = providerStatus({});
    // The keyless assistant can hold a conversation, so text is always there;
    // reasoning, images and vision still need a keyed provider.
    expect(capabilityAvailable(statuses, "text")).toBe(true);
    for (const cap of ["reasoning", "images", "vision"] as const) {
      expect(capabilityAvailable(statuses, cap), cap).toBe(false);
    }
  });
});

describe("the catalogue itself", () => {
  it("has no duplicate model ids across providers", () => {
    const ids = AI_PROVIDERS.flatMap((p) => p.models.map((m) => m.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("finds every declared model, and nothing else", () => {
    for (const provider of AI_PROVIDERS) {
      for (const model of provider.models) {
        expect(findModel(model.id)?.provider.id).toBe(provider.id);
      }
    }
    expect(findModel("gpt-4-turbo")).toBeNull();
    expect(findModel("")).toBeNull();
  });

  it("gives every model at least one capability and a hint", () => {
    for (const provider of AI_PROVIDERS) {
      for (const model of provider.models) {
        expect(model.capabilities.length, model.id).toBeGreaterThan(0);
        expect(model.hint.trim(), model.id).not.toBe("");
      }
    }
  });

  it("explains the assistants that cannot be offered", () => {
    expect(UNAVAILABLE_ASSISTANTS.length).toBeGreaterThan(0);
    for (const entry of UNAVAILABLE_ASSISTANTS) {
      expect(entry.reason.length).toBeGreaterThan(30);
    }
  });
});
