"use client";

import { usePathname } from "next/navigation";
import * as React from "react";

/**
 * Who else has this workspace open right now.
 *
 * One poller per page, shared by every component that asks. Several avatar
 * stacks can be on screen at once — the project header, the overview cards —
 * and each running its own timer would multiply the requests for identical
 * data.
 *
 * The interval is well under the server's 50s staleness window, so a single
 * dropped request never makes anyone flicker offline. Polling stops while the
 * tab is hidden and resumes with an immediate call when it comes back: a
 * background tab has nobody looking at it, and its heartbeat lapsing is
 * correct — that person is not really *here*.
 */

/**
 * Ten seconds. Departure can only ever be inferred from silence — a closed tab
 * does not get to announce itself — so the delay before someone is called gone
 * is the server's staleness window plus however long until the next poll
 * notices. Halving both from the original 20s/50s brings that from over a
 * minute down to well under one, at six requests a minute per open tab.
 *
 * Tighter than this stops buying much: the window cannot go below the interval
 * without people flickering offline between their own heartbeats.
 */
const INTERVAL_MS = 10_000;

type Snapshot = {
  /** The signed-in user's own id, once the server has told us. */
  you: string | null;
  /** Everyone in the workspace with a live heartbeat, including you. */
  online: ReadonlySet<string>;
  /** Ids that appeared in this poll and not the one before it. */
  arrived: ReadonlySet<string>;
  /** Ids that were here in the previous poll and are not any more. */
  left: ReadonlySet<string>;
  /**
   * Where each online person is looking, as an opaque scope string.
   *
   * Only ever compared for equality, never displayed. The value is chosen by
   * somebody else's browser, so treating it as text to render would be putting
   * a string a teammate controls onto this page.
   */
  focus: ReadonlyMap<string, string>;
};

const EMPTY: Snapshot = {
  you: null,
  online: new Set(),
  arrived: new Set(),
  left: new Set(),
  focus: new Map(),
};

let snapshot: Snapshot = EMPTY;
const subscribers = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let currentSlug: string | null = null;
let seenFirstResponse = false;

/**
 * What this browser is looking at, sent up with the heartbeat.
 *
 * Module-level rather than a hook argument, for the same reason the poller is:
 * there is one browser and it is looking at one thing, however many components
 * happen to be asking who else is around.
 */
let myFocus: string | null = null;

function publish(next: Snapshot) {
  snapshot = next;
  for (const notify of subscribers) notify();
}

async function poll() {
  if (!currentSlug) return;
  try {
    const res = await fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: currentSlug, focus: myFocus }),
      cache: "no-store",
    });
    if (!res.ok) return;

    const data = (await res.json()) as {
      you: string;
      online: string[];
      focus?: Record<string, string>;
    };
    const online = new Set(data.online);
    const focus = new Map(Object.entries(data.focus ?? {}));

    // The first response is the baseline. Treating it as arrivals would light
    // up every teammate the moment a page loads, which says "they just got
    // here" about people who have been here all along.
    const arrived = new Set<string>();
    const left = new Set<string>();
    if (seenFirstResponse) {
      for (const id of online) if (!snapshot.online.has(id)) arrived.add(id);
      for (const id of snapshot.online) if (!online.has(id)) left.add(id);
    }
    seenFirstResponse = true;

    publish({ you: data.you, online, arrived, left, focus });
  } catch {
    // Offline or a transient failure. Keeping the previous snapshot is the
    // right call: a failed request is not evidence that anybody left.
  }
}

function start(slug: string) {
  if (currentSlug === slug && timer) return;
  stop();
  currentSlug = slug;
  seenFirstResponse = false;
  void poll();
  timer = setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    void poll();
  }, INTERVAL_MS);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = undefined;
  currentSlug = null;
}

function onVisible() {
  if (document.visibilityState === "visible") void poll();
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  if (subscribers.size === 1) document.addEventListener("visibilitychange", onVisible);
  return () => {
    subscribers.delete(notify);
    if (subscribers.size === 0) {
      document.removeEventListener("visibilitychange", onVisible);
      stop();
      publish(EMPTY);
      seenFirstResponse = false;
    }
  };
}

/** `/w/<slug>/…` — every workspace page lives under it. */
function slugFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = /^\/w\/([^/]+)/.exec(pathname);
  return match ? match[1] : null;
}

/**
 * Says what this browser is looking at, and tells the server straight away.
 *
 * Waiting for the next scheduled heartbeat would mean up to ten seconds between
 * clicking a node and anyone else seeing you on it, which for something as
 * fine-grained as "who is editing this box" is long enough that two people
 * overwrite each other before either ring appears.
 */
export function setPresenceFocus(scope: string | null) {
  if (myFocus === scope) return;
  myFocus = scope;
  if (currentSlug) void poll();
}

/**
 * Everyone looking at something under `prefix`, grouped by whatever follows it.
 *
 * Grouped here rather than asked per thing, because a caller with a list of
 * things cannot call a hook for each of them — the count changes as the list
 * does, and React counts hooks. One call returns the whole picture.
 *
 * Yourself excluded: your own avatar on the node you are typing in tells you
 * nothing you do not already know, and it would sit on top of that node's own
 * controls.
 */
export function useFocusGroups(prefix: string): ReadonlyMap<string, string[]> {
  const { you, online, focus } = usePresence();

  return React.useMemo(() => {
    const out = new Map<string, string[]>();
    for (const [userId, at] of focus) {
      if (userId === you) continue;
      if (!online.has(userId)) continue;
      if (!at.startsWith(prefix)) continue;

      const key = at.slice(prefix.length);
      const list = out.get(key);
      if (list) list.push(userId);
      else out.set(key, [userId]);
    }
    return out;
  }, [prefix, focus, online, you]);
}

export function usePresence(): Snapshot {
  const pathname = usePathname();
  const slug = slugFromPath(pathname);

  React.useEffect(() => {
    if (!slug) return;
    start(slug);
  }, [slug]);

  return React.useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
}
