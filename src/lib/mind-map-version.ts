/**
 * Which version of a map document the browser is holding.
 *
 * Autosave writes the whole document, so two people on one map overwrite each
 * other continuously — the file that does the writing says so in its own comment
 * and calls the fix "per-node merging, a different piece of work". This is not
 * that fix. It is the smaller half that stops the loss being *silent*: a save
 * carries the version it was based on, and a save based on a version that has
 * moved is refused rather than applied.
 *
 * ### Why a fingerprint of the document and not the row's `updatedAt`
 *
 * `updatedAt` moves when anything on the row moves, and three other actions
 * write that row without touching the drawing: rename, colour and background.
 * Keyed on the timestamp, opening the appearance panel and picking a hue would
 * make the canvas's own version stale — and then every autosave for the rest of
 * the session is refused, by the person's own action, on a map nobody else is
 * looking at. A false conflict that cannot be escaped is worse than the silent
 * overwrite this is meant to replace.
 *
 * The fingerprint answers the narrower question actually being asked: has the
 * *document* changed since I read it. A colour change cannot make it move.
 *
 * ### Why it is canonical
 *
 * A document is compared across a round trip through `jsonb`, which sorts keys
 * and drops whitespace of its own accord. The comparison therefore has to be
 * insensitive to key order, or the fingerprint of what was just written differs
 * from the fingerprint of the same document read back — and every second save
 * conflicts with the first. Sorting the keys here is what lets the server
 * fingerprint what it *wrote* rather than paying for another read to see what
 * Postgres made of it.
 *
 * ### Why not a cryptographic hash
 *
 * Nothing here is a security boundary: a caller who wants to overwrite somebody
 * else's work can simply omit the version, which is the deliberate "save mine
 * anyway" path. This only has to notice an honest change, so it is arithmetic
 * with no dependencies, safe to import from a client component.
 */

/** JSON with object keys in a fixed order, so two equal documents render alike. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    // `undefined` has no JSON form; an array hole is `null` and a key holding it
    // is dropped below, which is what `JSON.stringify` itself does.
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
}

/**
 * A short token standing for one map document.
 *
 * Two passes with different constants, plus the length. One 32-bit pass is a
 * one-in-four-billion chance of two different documents agreeing, and the cost
 * of that coincidence is one overwrite going unnoticed — the very failure this
 * exists to catch. The second pass and the length make it not worth thinking
 * about again.
 */
export function mapVersion(data: unknown): string {
  const text = canonical(data ?? {});

  let a = 0x811c9dc5;
  let b = 0xcbf29ce4;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b + code, 0x85ebca6b) >>> 0;
    b = ((b << 13) | (b >>> 19)) >>> 0;
  }

  return `${text.length.toString(36)}.${a.toString(36)}.${b.toString(36)}`;
}

/**
 * What the server says when a save is based on a version that has moved on.
 *
 * A shared constant rather than a string the client matches by eye, and it lives
 * here rather than beside the action because a `"use server"` module may export
 * nothing but async functions.
 */
export const MAP_MOVED_ON = "Somebody else has changed this map since you opened it.";
