import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Integration check for the one property the whole design rests on: a change
 * published by one process reaches a listener held by a *different* one.
 *
 * That is precisely what an in-process EventEmitter cannot do, and why this
 * uses Postgres. PM2 runs the app in cluster mode, so getting this wrong shows
 * up as "some teammates see the update and some do not" — intermittent, hard
 * to reproduce, and invisible to any single-process test.
 *
 * Skipped automatically when no database is reachable, so `npm test` still
 * passes on a machine with nothing running.
 */

const CHANNEL = "kanovra_changes";
const CONNECTION = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

let listener: Client | undefined;
let publisher: Client | undefined;
let reachable = false;

beforeAll(async () => {
  // No configuration at all is a legitimate skip — someone checked the repo
  // out and ran the tests. A configured-but-unreachable database is not: that
  // is a broken environment, and swallowing it would let this suite report
  // success while never once exercising the thing it exists to prove.
  if (!CONNECTION) return;

  listener = new Client({ connectionString: CONNECTION, connectionTimeoutMillis: 5000 });
  publisher = new Client({ connectionString: CONNECTION, connectionTimeoutMillis: 5000 });
  await listener.connect();
  await publisher.connect();
  await listener.query(`LISTEN ${CHANNEL}`);
  reachable = true;
}, 20_000);

afterAll(async () => {
  await listener?.end().catch(() => {});
  await publisher?.end().catch(() => {});
});

/** Resolves with the first notification, or rejects once the timeout passes. */
function nextNotification(timeoutMs = 5000) {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no notification arrived")), timeoutMs);
    listener!.once("notification", (message) => {
      clearTimeout(timer);
      resolve(message.payload ?? "");
    });
  });
}

// `skipIf` rather than an early `return`: a test that returns early is
// reported as *passed*, so the suite would claim to cover this while never
// connecting to anything. Skipped tests show up as skipped.
describe.skipIf(!CONNECTION)("Postgres LISTEN/NOTIFY bus", () => {
  it("has a live connection to publish and listen on", () => {
    expect(reachable, "beforeAll did not establish both connections").toBe(true);
  });

  it("delivers a change across two separate connections", async () => {
    const received = nextNotification();

    const event = { workspaceId: "ws_test", scope: "task", actorId: "user_1" };
    // Parameterised exactly as `publishChange` does it, so a payload can never
    // be interpreted as SQL.
    await publisher!.query("SELECT pg_notify($1, $2)", [CHANNEL, JSON.stringify(event)]);

    expect(JSON.parse(await received)).toEqual(event);
  }, 15_000);

  it("carries a payload that survives the round trip intact", async () => {
    const received = nextNotification();

    // Quotes and non-ASCII are the two things a hand-built SQL string would
    // mangle; both are ordinary in workspace names.
    const event = {
      workspaceId: "ws_'quoted\"",
      scope: "comment",
      actorId: "Phạm — tester",
    };
    await publisher!.query("SELECT pg_notify($1, $2)", [CHANNEL, JSON.stringify(event)]);

    expect(JSON.parse(await received)).toEqual(event);
  }, 15_000);

  it("stays under the 8000-byte payload ceiling", async () => {
    // Postgres rejects a larger NOTIFY outright, so the events we send must
    // stay small by construction — this is why they carry an id and a scope
    // rather than the changed rows.
    const worstCase = JSON.stringify({
      workspaceId: "c".repeat(30),
      scope: "notification",
      actorId: "c".repeat(30),
    });
    expect(Buffer.byteLength(worstCase)).toBeLessThan(8000);
  });
});
