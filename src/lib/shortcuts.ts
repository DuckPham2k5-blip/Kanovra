/**
 * Keyboard shortcuts: the table, and the rule for deciding what a key press
 * meant.
 *
 * ## Why a sequence rather than more modifiers
 *
 * `⌘K` was the only shortcut, and the obvious way to add nine more is nine more
 * modifier combinations. Every one of those is a coin toss against the browser
 * and the operating system — `⌘P` prints, `⌘L` is the address bar, `⌘N` is a new
 * window, and which of those a page may override differs per browser. A prefix
 * key costs one extra press and collides with nothing, which is why GitHub and
 * Linear both landed on it.
 *
 * ## Why the prefix expires
 *
 * `g` is also a letter people press by accident. Without a timeout, a stray `g`
 * arms the sequence for the rest of the session, and the next unrelated `p`
 * navigates somewhere. The window is short enough that an accident has passed
 * before the second key, and long enough to type two keys without hurrying.
 *
 * ## What is deliberately not here
 *
 * No shortcut writes anything. Everything below navigates or opens a panel, so
 * the worst a misfire can do is move the page — recoverable with Back. A
 * single key that deleted or completed a task would be one slipped finger from
 * a change nobody meant, on a board other people share.
 */

/** How long a prefix key stays armed. */
export const PREFIX_TIMEOUT_MS = 1500;

export type ShortcutId =
  | "palette"
  | "help"
  | "go-overview"
  | "go-my-tasks"
  | "go-projects"
  | "go-calendar"
  | "go-maps"
  | "go-analytics"
  | "go-notifications"
  | "go-members"
  | "go-settings";

export type Shortcut = {
  id: ShortcutId;
  /** Printed in the help sheet, one box per element. */
  keys: string[];
  label: string;
  group: string;
  /** Appended to `/w/<slug>` for the navigating ones. */
  path?: string;
};

/**
 * The table. The help sheet renders this, so a shortcut that works and is not
 * listed here cannot exist — which is the point: an undiscoverable shortcut is
 * a feature only its author has.
 */
export const SHORTCUTS: Shortcut[] = [
  { id: "palette", keys: ["⌘", "K"], label: "Search everything", group: "General" },
  { id: "help", keys: ["?"], label: "Keyboard shortcuts", group: "General" },

  { id: "go-overview", keys: ["G", "O"], label: "Overview", group: "Go to", path: "" },
  { id: "go-my-tasks", keys: ["G", "T"], label: "My tasks", group: "Go to", path: "/my-tasks" },
  { id: "go-projects", keys: ["G", "P"], label: "Projects", group: "Go to", path: "/projects" },
  { id: "go-calendar", keys: ["G", "C"], label: "Calendar", group: "Go to", path: "/calendar" },
  { id: "go-maps", keys: ["G", "M"], label: "Maps", group: "Go to", path: "/maps" },
  { id: "go-analytics", keys: ["G", "A"], label: "Analytics", group: "Go to", path: "/analytics" },
  {
    id: "go-notifications",
    keys: ["G", "N"],
    label: "Notifications",
    group: "Go to",
    path: "/notifications",
  },
  { id: "go-members", keys: ["G", "U"], label: "Members", group: "Go to", path: "/members" },
  { id: "go-settings", keys: ["G", "S"], label: "Settings", group: "Go to", path: "/settings" },
];

/** `g` followed by this letter. Derived from the table so the two cannot drift. */
const SEQUENCES = new Map<string, ShortcutId>(
  SHORTCUTS.filter((s) => s.keys.length === 2 && s.keys[0] === "G").map((s) => [
    s.keys[1].toLowerCase(),
    s.id,
  ]),
);

/**
 * Shortcuts that are *not* ours, listed so the help sheet can still name them.
 *
 * They belong to the canvas and the list and are handled where they are used.
 * Leaving them out would make the sheet a lie by omission — somebody reading it
 * would conclude Ctrl+Z does nothing on a map.
 */
export const FOREIGN_SHORTCUTS: { keys: string[]; label: string; group: string }[] = [
  { keys: ["Ctrl", "Z"], label: "Undo", group: "Mind map" },
  { keys: ["Ctrl", "⇧", "Z"], label: "Redo", group: "Mind map" },
  { keys: ["Ctrl", "click"], label: "Add a row to the selection", group: "Task list" },
  { keys: ["⇧", "click"], label: "Select a range of rows", group: "Task list" },
  { keys: ["Esc"], label: "Close the panel or dialog", group: "General" },
];

/**
 * Whether a key press belongs to whatever the person is typing into.
 *
 * The failure this prevents is the loud one: typing "going to the shop" in a
 * comment box and having the `g` and the `o` navigate away mid-sentence. Radix
 * menu items are included because they take arrow keys and type-ahead of their
 * own, and a stray letter there should search the menu, not leave the page.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  const el = target as Element;

  const tag = el.tagName?.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;

  return Boolean(el.closest('[contenteditable="true"], [role="menu"], [role="listbox"]'));
}

export type PrefixState = { key: string; at: number } | null;

export type ShortcutOutcome =
  /** Run this. The caller clears any prefix. */
  | { kind: "action"; id: ShortcutId }
  /** Arm a prefix; the caller stores it with the time. */
  | { kind: "prefix"; key: string }
  /** Not a shortcut, but a prefix was armed and must not survive. */
  | { kind: "clear" }
  /** Nothing to do, and any prefix stays as it was. */
  | { kind: "ignore" };

type KeyLike = {
  key?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
};

/**
 * What a key press means, given whatever prefix is armed.
 *
 * Pure, and takes `now` rather than reading the clock, so the expiry is a test
 * case rather than a sleep.
 */
export function resolveShortcut(
  event: KeyLike,
  prefix: PrefixState,
  now: number,
): ShortcutOutcome {
  // `event.key` is occasionally undefined for synthetic and IME-composed events
  // — the same guard the ⌘K handler has carried since it was written.
  const key = event.key?.toLowerCase();
  if (!key) return { kind: "ignore" };

  const armed = prefix && now - prefix.at <= PREFIX_TIMEOUT_MS ? prefix : null;

  // Modifier combinations first, and they ignore any armed prefix: ⌘K is ⌘K
  // whatever was pressed a moment ago.
  if (event.metaKey || event.ctrlKey) {
    if (key === "k" && !event.altKey) return { kind: "action", id: "palette" };
    // Everything else with a modifier belongs to the browser. Taking `Ctrl+P`
    // away from printing to save one keystroke is not a trade worth making.
    return armed ? { kind: "clear" } : { kind: "ignore" };
  }
  if (event.altKey) return armed ? { kind: "clear" } : { kind: "ignore" };

  if (armed?.key === "g") {
    const id = SEQUENCES.get(key);
    // Either way the prefix is spent: `g` then a letter that means nothing
    // should not leave the sequence armed for the next keystroke.
    return id ? { kind: "action", id } : { kind: "clear" };
  }

  // Shift is allowed through here: `?` is Shift+/ on most layouts, and
  // requiring it to arrive unshifted would mean it never fires.
  if (key === "?") return { kind: "action", id: "help" };
  if (key === "/") return { kind: "action", id: "palette" };
  if (key === "g") return { kind: "prefix", key: "g" };

  return armed ? { kind: "clear" } : { kind: "ignore" };
}

/** The route a navigating shortcut leads to, or null for the rest. */
export function shortcutHref(id: ShortcutId, slug: string): string | null {
  const found = SHORTCUTS.find((s) => s.id === id);
  if (!found || found.path === undefined) return null;
  return `/w/${slug}${found.path}`;
}
