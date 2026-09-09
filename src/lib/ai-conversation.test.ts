import { describe, expect, it } from "vitest";

import { conversationWindow, titleFromMessage, type WindowTurn } from "@/lib/ai-conversation";

/** A real conversation: alternating, oldest first, ending with the new question. */
function exchange(count: number): WindowTurn[] {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content: `m${i}`,
  }));
}

describe("conversationWindow", () => {
  /*
   * The bug this exists for.
   *
   * Turns alternate and the newest is the question just written, so counting
   * back from the end gives user, assistant, user … and an EVEN limit lands on
   * an assistant turn. Anthropic refuses a conversation that does not open with
   * the user — so a chat works perfectly until it passes twenty turns, roughly
   * ten exchanges in, and then fails on every message after that. Far enough in
   * to read as the assistant breaking rather than as a window built wrong.
   */
  it("begins with a user turn even when the limit lands on an assistant one", () => {
    const messages = exchange(41); // ends on a user turn, as a real one does

    // What the route did before this function existed, and the whole reason it
    // now exists: a plain trim opens on the assistant, which Anthropic refuses.
    expect(messages.slice(-20)[0].role).toBe("assistant");

    const window = conversationWindow(messages, 20);
    expect(window[0].role).toBe("user");
    expect(window.at(-1)?.role).toBe("user");
  });

  it("keeps a whole short conversation untouched", () => {
    const messages = exchange(5);
    expect(conversationWindow(messages, 20)).toEqual(messages);
  });

  it("keeps the most recent turns, not the opening ones", () => {
    const window = conversationWindow(exchange(41), 20);
    expect(window.at(-1)?.content).toBe("m40");
    expect(window.some((m) => m.content === "m0")).toBe(false);
  });

  it("alternates all the way through", () => {
    const window = conversationWindow(exchange(41), 20);
    for (let i = 1; i < window.length; i += 1) {
      expect(window[i].role, `turn ${i}`).not.toBe(window[i - 1].role);
    }
  });

  it("works for an odd limit too", () => {
    const window = conversationWindow(exchange(41), 7);
    expect(window[0].role).toBe("user");
    expect(window).toHaveLength(7);
  });

  /*
   * A stream that produces nothing writes no assistant row — a provider error,
   * or a tab closed before the first token. The next question then sits beside
   * the previous one. Both were really asked, so they are joined rather than
   * one being thrown away: dropping the earlier one silently changes what the
   * person believes they said.
   */
  describe("when a turn is missing its answer", () => {
    it("joins two questions into one turn rather than dropping either", () => {
      const window = conversationWindow(
        [
          { role: "user", content: "first question" },
          { role: "user", content: "second question" },
        ],
        20,
      );

      expect(window).toHaveLength(1);
      expect(window[0].role).toBe("user");
      expect(window[0].content).toContain("first question");
      expect(window[0].content).toContain("second question");
    });

    it("still alternates afterwards", () => {
      const window = conversationWindow(
        [
          { role: "user", content: "a" },
          { role: "user", content: "b" },
          { role: "assistant", content: "answer" },
          { role: "user", content: "c" },
        ],
        20,
      );
      expect(window.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    });

    it("does not mutate what it was given", () => {
      // The merge builds new objects; writing into the caller's rows would
      // corrupt whatever else is reading them.
      const messages: WindowTurn[] = [
        { role: "user", content: "a" },
        { role: "user", content: "b" },
      ];
      conversationWindow(messages, 20);
      expect(messages[0].content).toBe("a");
    });
  });

  it("skips a blank turn rather than sending an empty message", () => {
    // An empty string is refused by every provider, and one can be written by
    // a stream that ended before its first token.
    const window = conversationWindow(
      [
        { role: "user", content: "real" },
        { role: "assistant", content: "   " },
        { role: "user", content: "also real" },
      ],
      20,
    );
    expect(window).toHaveLength(1);
    expect(window[0].content).toBe("real\n\nalso real");
  });

  it("answers with nothing when there is no user turn at all", () => {
    expect(conversationWindow([{ role: "assistant", content: "x" }], 20)).toEqual([]);
    expect(conversationWindow([], 20)).toEqual([]);
    expect(conversationWindow(exchange(5), 0)).toEqual([]);
  });

  /*
   * Trimming happens before the alternation is fixed. The other order takes the
   * limit, then drops a leading turn, and quietly returns fewer turns than
   * asked for — which is not wrong so much as untrue to its own parameter.
   */
  it("never returns more than the limit", () => {
    for (const limit of [1, 2, 3, 7, 20, 21]) {
      expect(conversationWindow(exchange(60), limit).length, `limit ${limit}`)
        .toBeLessThanOrEqual(limit);
    }
  });
});

describe("titleFromMessage", () => {
  it("takes the message when it is short", () => {
    expect(titleFromMessage("How do I share a board?")).toBe("How do I share a board?");
  });

  it("flattens whitespace so a pasted block does not become a tall row", () => {
    expect(titleFromMessage("  two\n\nlines\t here ")).toBe("two lines here");
  });

  it("cuts a long message on a word boundary", () => {
    const original =
      "Explain the four roles in this application and give me an example of each one";
    const title = titleFromMessage(original);

    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith("…")).toBe(true);

    /*
     * The property, stated as what it actually is: the kept text is a prefix of
     * the original that stops where a word does. Asserting "does not end in a
     * word character" would be wrong — a correctly cut title always ends in
     * one — so this checks the character the cut *left behind* instead.
     */
    const kept = title.slice(0, -1);
    expect(original.startsWith(kept)).toBe(true);
    expect(original[kept.length]).toBe(" ");
  });

  it("cuts mid-word rather than losing half the title to one long word", () => {
    // A word boundary is preferred, not required: a 60-character word with a
    // space at position 3 would otherwise leave a three-letter title.
    const title = titleFromMessage(`ab ${"x".repeat(90)}`);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.length).toBeGreaterThan(50);
  });

  it("falls back rather than naming a conversation with an empty string", () => {
    expect(titleFromMessage("")).toBe("New conversation");
    expect(titleFromMessage("   \n  ")).toBe("New conversation");
  });
});
