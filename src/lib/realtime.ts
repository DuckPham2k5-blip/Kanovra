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

/**
 * Names the browser, not the person. Set by the client on first paint and read
 * back on the server for every mutation, which is how a change can be traced to
 * the one browser that already refreshed itself. Readable by script on purpose
 * — the client has to compare it against incoming events — and therefore never
 * used for anything that requires trust.
 */
export const ORIGIN_COOKIE = "tf_origin";

export type ChangeEvent = {
  workspaceId: string;
  /** Coarse hint so a client can ignore changes it does not render. */
  scope: "task" | "project" | "comment" | "member" | "notification" | "workspace";
  /** Who made the change. Carried for display and debugging, not for filtering. */
  actorId?: string;
  /**
   * Which *browser* made the change, from the `tf_origin` cookie.
   *
   * This is what a client skips its own echo on. Filtering on `actorId` looked
   * equivalent and is not: one person signed in on a laptop and a phone is one
   * actor with two screens, so every change they made on one silently failed to
   * reach the other. The browser is the thing that already refreshed.
   */
  originId?: string;
};

/**
 * Local fan-out to the SSE streams held by *this* process, together with the
 * handle to the LISTEN connection that feeds it.
 *
 * Parked on `globalThis` for the same reason `prisma` is: in development HMR
 * builds a fresh instance of this module on every edit, and module-scope state
 * would start over at `null`. The new instance then opens a second LISTEN
 * connection while the first stays open, idle and referenced by nobody, until
 * the dev server exits — measured at one leaked connection per recompile,
 * which walks a long session toward `max_connections`.
 *
 * The emitter has to be shared as well, not just the client. Sharing only the
 * client would leave a reloaded module reusing it while its `notification`
 * handler still published into the *previous* emitter; new streams subscribe
 * to the new one and receive nothing at all, with no error logged anywhere. A
 * leaked connection is visible in `pg_stat_activity`; that failure is silent,
 * and worse.
 *
 * In production the module is evaluated once per worker, so this is simply one
 * object created once — the same shape either way, rather than a code path
 * that only runs in development.
 */
const globalForRealtime = globalThis as unknown as {
  realtime:
    | { local: EventEmitter; listener: Client | null; connecting: Promise<void> | null }
    | undefined;
};

const state = (globalForRealtime.realtime ??= {
  // One process can hold many open streams; the default cap of 10 would start
  // printing spurious leak warnings on the eleventh visitor.
  local: new EventEmitter().setMaxListeners(0),
  listener: null,
  connecting: null,
});

/**
 * Opens the dedicated LISTEN connection. It cannot be borrowed from Prisma's
 * pool: a listening connection is occupied for its whole life, and returning
 * it to a pool would silently drop the subscription.
 */
async function ensureListening() {
  if (state.listener) return;
  if (state.connecting) return state.connecting;

  state.connecting = (async () => {
    const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
    if (!connectionString) {
      logWarn("realtime", "No database URL; live updates are disabled.");
      return;
    }

    const client = new Client({ connectionString });

    client.on("notification", (message) => {
      if (!message.payload) return;
      try {
        state.local.emit("change", JSON.parse(message.payload) as ChangeEvent);
      } catch (error) {
        logError("realtime.parse", error, { payload: message.payload.slice(0, 200) });
      }
    });

    client.on("error", (error) => {
      logError("realtime.connection", error);
      // Drop the handle so the next subscriber reconnects rather than
      // attaching to a socket that is already dead.
      state.listener = null;
      state.connecting = null;
      client.end().catch(() => {});
    });

    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    state.listener = client;
  })().catch((error) => {
    logError("realtime.listen", error);
    state.connecting = null;
  });

  return state.connecting;
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

  state.local.on("change", handler);
  return () => state.local.off("change", handler);
}
