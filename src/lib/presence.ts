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
};

const EMPTY: Snapshot = { you: null, online: new Set(), arrived: new Set(), left: new Set() };

let snapshot: Snapshot = EMPTY;
const subscribers = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let currentSlug: string | null = null;
let seenFirstResponse = false;

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
      body: JSON.stringify({ slug: currentSlug }),
      cache: "no-store",
    });
    if (!res.ok) return;

    const data = (await res.json()) as { you: string; online: string[] };
    const online = new Set(data.online);

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

    publish({ you: data.you, online, arrived, left });
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
