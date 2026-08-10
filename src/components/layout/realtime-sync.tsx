"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

/**
 * Keeps the page in step with what teammates are doing.
 *
 * The server only ever says *that* something changed; this refetches through
 * the normal Server Component path rather than patching a client-side copy of
 * the data. That keeps one source of truth — a pushed patch and a refetch can
 * disagree, and when they do the bug is invisible until someone reloads.
 *
 * Renders nothing.
 */
const ORIGIN_COOKIE = "tf_origin";
/** A year: long enough that a browser keeps one identity across visits. */
const ORIGIN_MAX_AGE = 60 * 60 * 24 * 365;

function readCookie(name: string) {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/**
 * This browser's id, minted on first sight and kept in a cookie so it rides
 * along with every Server Action automatically — actions are POSTs to the
 * page's own URL, so there is no request to thread it through by hand.
 */
function ensureOriginId() {
  const existing = readCookie(ORIGIN_COOKIE);
  if (existing) return existing;

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);

  document.cookie = `${ORIGIN_COOKIE}=${id}; path=/; max-age=${ORIGIN_MAX_AGE}; SameSite=Lax`;
  return id;
}

export function RealtimeSync({ workspaceSlug }: { workspaceSlug: string }) {
  const router = useRouter();

  React.useEffect(() => {
    // EventSource reconnects on its own, honouring the `retry:` the server
    // sends, so there is no reconnect loop to write here.
    const originId = ensureOriginId();
    const source = new EventSource(`/api/realtime/${workspaceSlug}`);

    let pending: ReturnType<typeof setTimeout> | undefined;

    source.addEventListener("change", (event) => {
      let payload: { originId?: string } = {};
      try {
        payload = JSON.parse((event as MessageEvent).data);
      } catch {
        return;
      }

      // Skip this browser's own writes: the action that caused them already
      // called `router.refresh()`, and refreshing again doubles the work.
      //
      // Deliberately *not* keyed on the actor. One person signed in on a laptop
      // and a phone is a single actor, so an actor check told the phone to
      // ignore everything the laptop did — the two screens never converged
      // until one was reloaded by hand. The browser is what already refreshed,
      // so the browser is what gets to skip.
      if (payload.originId && payload.originId === originId) return;

      // A single drag can produce several activities in a row; coalesce them
      // so the page refetches once rather than once per event.
      clearTimeout(pending);
      pending = setTimeout(() => router.refresh(), 300);
    });

    return () => {
      clearTimeout(pending);
      source.close();
    };
  }, [workspaceSlug, router]);

  return null;
}
