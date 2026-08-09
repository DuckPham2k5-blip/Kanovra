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
export function RealtimeSync({
  workspaceSlug,
  currentUserId,
}: {
  workspaceSlug: string;
  currentUserId: string;
}) {
  const router = useRouter();

  React.useEffect(() => {
    // EventSource reconnects on its own, honouring the `retry:` the server
    // sends, so there is no reconnect loop to write here.
    const source = new EventSource(`/api/realtime/${workspaceSlug}`);

    let pending: ReturnType<typeof setTimeout> | undefined;

    source.addEventListener("change", (event) => {
      let payload: { actorId?: string } = {};
      try {
        payload = JSON.parse((event as MessageEvent).data);
      } catch {
        return;
      }

      // Skip our own writes. The action that caused them already called
      // `router.refresh()`, and refreshing again just doubles the work.
      if (payload.actorId && payload.actorId === currentUserId) return;

      // A single drag can produce several activities in a row; coalesce them
      // so the page refetches once rather than once per event.
      clearTimeout(pending);
      pending = setTimeout(() => router.refresh(), 300);
    });

    return () => {
      clearTimeout(pending);
      source.close();
    };
  }, [workspaceSlug, currentUserId, router]);

  return null;
}
