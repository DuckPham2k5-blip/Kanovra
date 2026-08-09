import "server-only";

import { EventEmitter } from "node:events";

import { Client } from "pg";

import { logError, logWarn } from "@/lib/logger";

/**
 * Cross-process change notifications, carried by Postgres `LISTEN/NOTIFY`.
 *
 * PM2 runs the app in cluster mode, so a plain in-process EventEmitter would
 * only ever reach the clients whose stream happens to be held by the same
 * worker that handled the write — some teammates would see an update and
 * others would not, unpredictably. Postgres is already shared by every worker,
 * which makes it a pub/sub bus we get for free: no Redis to keep alive, no
 * third-party service, and nothing added to the client bundle.
 *
 * Payloads stay tiny on purpose. A notification says only *that* a workspace
 * changed; the browser then refetches through the normal data path, so there
 * is one source of truth and no risk of the pushed copy drifting from it.
 * (Postgres also caps a NOTIFY payload at 8000 bytes.)
 */

const CHANNEL = "kanovra_changes";

export type ChangeEvent = {
  workspaceId: string;
  /** Coarse hint so a client can ignore changes it does not render. */
  scope: "task" | "project" | "comment" | "member" | "notification" | "workspace";
  /** The actor, so a client can skip echoing a change back to whoever made it. */
  actorId?: string;
};

/** Local fan-out to the SSE streams held by *this* process. */
const local = new EventEmitter();
// One process can hold many open streams; the default cap of 10 would start
// printing spurious leak warnings on the eleventh visitor.
local.setMaxListeners(0);

let listener: Client | null = null;
let connecting: Promise<void> | null = null;

/**
 * Opens the dedicated LISTEN connection. It cannot be borrowed from Prisma's
 * pool: a listening connection is occupied for its whole life, and returning
 * it to a pool would silently drop the subscription.
 */
async function ensureListening() {
  if (listener) return;
  if (connecting) return connecting;

  connecting = (async () => {
    const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
    if (!connectionString) {
      logWarn("realtime", "No database URL; live updates are disabled.");
      return;
    }

    const client = new Client({ connectionString });

    client.on("notification", (message) => {
      if (!message.payload) return;
      try {
        local.emit("change", JSON.parse(message.payload) as ChangeEvent);
      } catch (error) {
        logError("realtime.parse", error, { payload: message.payload.slice(0, 200) });
      }
    });

    client.on("error", (error) => {
      logError("realtime.connection", error);
      // Drop the handle so the next subscriber reconnects rather than
      // attaching to a socket that is already dead.
      listener = null;
      connecting = null;
      client.end().catch(() => {});
    });

    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    listener = client;
  })().catch((error) => {
    logError("realtime.listen", error);
    connecting = null;
  });

  return connecting;
}

/**
 * Announces a change to every worker. Fire-and-forget by design: a failure to
 * broadcast must never fail the mutation that already succeeded — the worst
 * case is a client that refreshes a little later than it could have.
 */
export function publishChange(event: ChangeEvent) {
  void (async () => {
    try {
      const { prisma } = await import("@/lib/prisma");
      // Parameterised, so a payload can never be read as SQL.
      await prisma.$executeRaw`SELECT pg_notify(${CHANNEL}, ${JSON.stringify(event)})`;
    } catch (error) {
      logError("realtime.publish", error, { workspaceId: event.workspaceId, scope: event.scope });
    }
  })();
}

/** Subscribes to changes for one workspace. Returns an unsubscribe function. */
export async function subscribeToWorkspace(
  workspaceId: string,
  onChange: (event: ChangeEvent) => void,
) {
  await ensureListening();

  const handler = (event: ChangeEvent) => {
    if (event.workspaceId === workspaceId) onChange(event);
  };

  local.on("change", handler);
  return () => local.off("change", handler);
}
