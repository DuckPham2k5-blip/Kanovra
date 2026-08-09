import { getCurrentUser } from "@/lib/auth";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { subscribeToWorkspace, type ChangeEvent } from "@/lib/realtime";

export const dynamic = "force-dynamic";
// Node, not Edge: the subscription is backed by a Postgres LISTEN connection.
export const runtime = "nodejs";

/** Nginx and most proxies drop an idle connection; this keeps it warm. */
const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events for one workspace.
 *
 * SSE rather than WebSockets because the traffic is one-way — the server says
 * "something changed", the browser refetches through the normal data path.
 * That needs no custom server, no protocol upgrade, and works through the
 * existing Nginx config with a couple of buffering settings.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!workspace) return new Response("Not found", { status: 404 });

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspaceId: workspace.id },
    select: { id: true },
  });
  // Same answer for "no such workspace" and "not your workspace", so this
  // never confirms that a slug exists to someone who cannot see it.
  if (!membership) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // The client vanished between the check and the write; the cancel
          // handler below does the cleanup.
        }
      };

      // Tells the browser to wait this long before reconnecting, and gives
      // proxies a first byte immediately so nothing sits in a buffer.
      controller.enqueue(encoder.encode("retry: 5000\n\n"));
      send("ready", { workspaceId: workspace.id });

      heartbeat = setInterval(() => {
        // A comment line is a valid SSE frame that the client ignores.
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          /* handled by cancel */
        }
      }, HEARTBEAT_MS);

      try {
        unsubscribe = await subscribeToWorkspace(workspace.id, (event: ChangeEvent) => {
          send("change", event);
        });
      } catch (error) {
        logError("realtime.subscribe", error, { workspaceId: workspace.id });
        controller.close();
      }
    },

    cancel() {
      // Fired when the browser navigates away or the connection drops. Without
      // this, every page view would leak a listener and an interval.
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Tells Nginx not to buffer this response even if buffering is on
      // globally — without it events sit in the proxy until the buffer fills.
      "X-Accel-Buffering": "no",
    },
  });
}
