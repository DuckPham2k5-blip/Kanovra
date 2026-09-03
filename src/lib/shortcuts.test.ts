import { describe, expect, it } from "vitest";

import {
  FOREIGN_SHORTCUTS,
  PREFIX_TIMEOUT_MS,
  SHORTCUTS,
  isTypingTarget,
  resolveShortcut,
  shortcutHref,
  type PrefixState,
} from "@/lib/shortcuts";

/**
 * A stand-in for a DOM element, shaped exactly like the two things
 * `isTypingTarget` reads. The tests run in Node with no DOM, and the guard is
 * the piece whose failure is loudest — typing "going to the shop" in a comment
 * box and having the `g` and the `o` navigate away mid-sentence.
 */
function element(tagName: string, matches: string[] = []): EventTarget {
  return {
    tagName,
    closest(selector: string) {
      // Good enough for the selectors this guard uses: the caller asks with one
      // comma-separated list, and the stub says which of those it sits inside.
      const wanted = selector.split(",").map((s) => s.trim());
      return matches.some((m) => wanted.includes(m)) ? {} : null;
    },
  } as unknown as EventTarget;
}

const T = 1_000_000;
const armed: PrefixState = { key: "g", at: T };

describe("resolveShortcut — modifiers", () => {
  it("opens the palette on Ctrl+K and on Cmd+K", () => {
    expect(resolveShortcut({ key: "k", ctrlKey: true }, null, T)).toEqual({
      kind: "action",
      id: "palette",
    });
    expect(resolveShortcut({ key: "K", metaKey: true }, null, T)).toEqual({
      kind: "action",
      id: "palette",
    });
  });

  /**
   * The rule that keeps this feature from being resented. Every combination the
   * browser already owns stays the browser's.
   */
  it("leaves every other modifier combination to the browser", () => {
    for (const key of ["p", "l", "n", "t", "w", "s", "f"]) {
      expect(resolveShortcut({ key, ctrlKey: true }, null, T)).toEqual({ kind: "ignore" });
      expect(resolveShortcut({ key, metaKey: true }, null, T)).toEqual({ kind: "ignore" });
    }
  });

  it("ignores Alt combinations", () => {
    expect(resolveShortcut({ key: "g", altKey: true }, null, T)).toEqual({ kind: "ignore" });
  });

  it("answers Ctrl+K even while a prefix is armed", () => {
    expect(resolveShortcut({ key: "k", ctrlKey: true }, armed, T)).toEqual({
      kind: "action",
      id: "palette",
    });
  });
});

describe("resolveShortcut — single keys", () => {
  it("opens the help sheet on ?", () => {
    // `?` arrives with shift held on most layouts; it must still fire.
    expect(resolveShortcut({ key: "?", shiftKey: true }, null, T)).toEqual({
      kind: "action",
      id: "help",
    });
  });

  it("opens the palette on /", () => {
    expect(resolveShortcut({ key: "/" }, null, T)).toEqual({ kind: "action", id: "palette" });
  });

  it("arms the prefix on g", () => {
    expect(resolveShortcut({ key: "g" }, null, T)).toEqual({ kind: "prefix", key: "g" });
  });

  it("ignores an unrelated key when nothing is armed", () => {
    expect(resolveShortcut({ key: "p" }, null, T)).toEqual({ kind: "ignore" });
  });

  it("ignores a key press with no key at all", () => {
    expect(resolveShortcut({}, null, T)).toEqual({ kind: "ignore" });
    expect(resolveShortcut({ key: undefined }, armed, T)).toEqual({ kind: "ignore" });
  });
});

describe("resolveShortcut — sequences", () => {
  it("navigates on g then the letter", () => {
    expect(resolveShortcut({ key: "p" }, armed, T)).toEqual({
      kind: "action",
      id: "go-projects",
    });
    expect(resolveShortcut({ key: "t" }, armed, T)).toEqual({
      kind: "action",
      id: "go-my-tasks",
    });
  });

  it("is case-insensitive, so Caps Lock does not silently break it", () => {
    expect(resolveShortcut({ key: "P" }, armed, T)).toEqual({
      kind: "action",
      id: "go-projects",
    });
  });

  /**
   * A `g` typed by accident must not stay armed. Without this, the next
   * unrelated `p` — minutes later — navigates away.
   */
  it("forgets the prefix after the timeout", () => {
    const late = T + PREFIX_TIMEOUT_MS + 1;
    expect(resolveShortcut({ key: "p" }, armed, late)).toEqual({ kind: "ignore" });
  });

  it("still answers on the last millisecond inside the window", () => {
    expect(resolveShortcut({ key: "p" }, armed, T + PREFIX_TIMEOUT_MS)).toEqual({
      kind: "action",
      id: "go-projects",
    });
  });

  it("spends the prefix on a letter that means nothing", () => {
    expect(resolveShortcut({ key: "q" }, armed, T)).toEqual({ kind: "clear" });
  });

  it("re-arms rather than chaining on g g", () => {
    expect(resolveShortcut({ key: "g" }, armed, T)).toEqual({ kind: "clear" });
  });
});

describe("isTypingTarget", () => {
  it("is true for the fields people type into", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(isTypingTarget(element(tag))).toBe(true);
    }
  });

  it("is true inside a contenteditable region", () => {
    expect(isTypingTarget(element("SPAN", ['[contenteditable="true"]']))).toBe(true);
  });

  /**
   * Radix menus take arrow keys and type-ahead of their own. A stray letter
   * there should search the menu, not leave the page.
   */
  it("is true inside a menu or a listbox", () => {
    expect(isTypingTarget(element("DIV", ['[role="menu"]']))).toBe(true);
    expect(isTypingTarget(element("DIV", ['[role="listbox"]']))).toBe(true);
  });

  it("is false for ordinary elements and for nothing at all", () => {
    expect(isTypingTarget(element("DIV"))).toBe(false);
    expect(isTypingTarget(element("BUTTON"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  /** `window` is an EventTarget with no `closest`; the guard must not throw. */
  it("survives a target that is not an element", () => {
    expect(isTypingTarget({} as EventTarget)).toBe(false);
  });
});

describe("the table", () => {
  it("has no duplicate ids", () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * Two shortcuts on one key means the second never fires, and nothing would
   * fail — the help sheet would list both and one would simply be dead.
   */
  it("has no two sequences on the same letter", () => {
    const letters = SHORTCUTS.filter((s) => s.keys[0] === "G").map((s) => s.keys[1]);
    expect(new Set(letters).size).toBe(letters.length);
  });

  it("gives every navigating shortcut a reachable route", () => {
    for (const s of SHORTCUTS) {
      if (s.path === undefined) continue;
      const href = shortcutHref(s.id, "acme");
      expect(href).toBe(`/w/acme${s.path}`);
      expect(href).toMatch(/^\/w\/acme(\/|$)/);
    }
  });

  it("returns no route for the shortcuts that are not navigation", () => {
    expect(shortcutHref("palette", "acme")).toBeNull();
    expect(shortcutHref("help", "acme")).toBeNull();
  });

  /** Every id the resolver can produce must be printable in the help sheet. */
  it("lists every sequence the resolver answers", () => {
    for (const letter of ["o", "t", "p", "c", "m", "a", "n", "u", "s"]) {
      const out = resolveShortcut({ key: letter }, armed, T);
      expect(out.kind).toBe("action");
      if (out.kind !== "action") return;
      expect(SHORTCUTS.some((s) => s.id === out.id)).toBe(true);
    }
  });

  it("labels every row in both tables", () => {
    for (const s of [...SHORTCUTS, ...FOREIGN_SHORTCUTS]) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.keys.length).toBeGreaterThan(0);
      expect(s.group.length).toBeGreaterThan(0);
    }
  });
});
