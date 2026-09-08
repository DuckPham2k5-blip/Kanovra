/**
 * Public read-only share links — the rules, with no database and no request.
 *
 * This module is imported from the server action that mints a link, from the
 * public page that resolves one, and from the dialog that shows it. Keeping it
 * free of `server-only` and of `node:crypto` is what makes that possible: the
 * expiry question in particular is asked in two places, and two implementations
 * of "has this expired" is how a revoked board stays readable.
 */

/**
 * The token alphabet is base64url, and the length is fixed.
 *
 * 43 symbols from a 64-symbol alphabet is 258 bits. Far past any need — the
 * point is not the exact figure but that guessing is not a threat model at all,
 * so the link can be treated as the whole of the secret and nothing else in the
 * URL has to be hidden.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
export const SHARE_TOKEN_LENGTH = 43;

/** Matches exactly what `randomShareToken` produces, and nothing else. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/**
 * A new token.
 *
 * `bytes` exists so a test can hand in a known sequence; production passes
 * nothing and gets `crypto.getRandomValues`, which is present in Node and in
 * browsers alike. `Math.random` would be catastrophic here and is easy to reach
 * for by accident, so the randomness is taken once, in this one place.
 *
 * The alphabet has 64 symbols and a byte has 256 values, so `byte % 64` is
 * exactly uniform — no modulo bias, and no rejection loop to get it wrong.
 */
export function randomShareToken(bytes?: Uint8Array): string {
  const source = bytes ?? crypto.getRandomValues(new Uint8Array(SHARE_TOKEN_LENGTH));
  let out = "";
  for (let i = 0; i < SHARE_TOKEN_LENGTH; i += 1) {
    out += ALPHABET[(source[i] ?? 0) % ALPHABET.length];
  }
  return out;
}

/**
 * True when a string could be one of our tokens.
 *
 * Checked before the database is touched. A public URL is reachable by anything
 * on the internet, and most of what arrives is a scanner trying `/share/wp-admin`
 * — answering those from a regex rather than from an index keeps a crawl from
 * costing a query each.
 */
export function isShareTokenShape(value: string): boolean {
  return TOKEN_SHAPE.test(value);
}

/**
 * Whether a link is still good.
 *
 * Expiry is decided at read time, never by a sweep job. A sweep that has not
 * run yet — or that failed last night — leaves an expired board public, and
 * nothing about the page would look wrong.
 */
export function shareLinkLive(
  link: { expiresAt: Date | null } | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!link) return false;
  if (!link.expiresAt) return true;
  return link.expiresAt.getTime() > now.getTime();
}

/**
 * How stale `lastViewedAt` is allowed to get.
 *
 * The field answers one question — is anybody still using this link — and an
 * answer to the nearest hour settles it. Stamping every view would turn a page
 * open to the internet into a database write per request, which is a crawler's
 * way of making the application do work on its behalf.
 */
export const SHARE_VIEW_STAMP_MS = 60 * 60 * 1000;

export function shouldStampView(
  lastViewedAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastViewedAt) return true;
  return now.getTime() - lastViewedAt.getTime() >= SHARE_VIEW_STAMP_MS;
}

/** The address to hand somebody. `origin` carries no trailing slash. */
export function shareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/share/${token}`;
}

/**
 * How long a link lasts, offered as a few choices rather than a date picker.
 *
 * "Until I turn it off" is the honest name for no expiry: it says the link
 * outlives whoever set it up unless somebody acts, which "Never" manages to
 * make sound like a safety property.
 */
export const SHARE_EXPIRY_CHOICES = [
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "90d", label: "90 days", days: 90 },
  { value: "never", label: "Until I turn it off", days: null },
] as const;

export type ShareExpiryChoice = (typeof SHARE_EXPIRY_CHOICES)[number]["value"];

export function expiryFromChoice(
  choice: ShareExpiryChoice,
  now: Date = new Date(),
): Date | null {
  const found = SHARE_EXPIRY_CHOICES.find((c) => c.value === choice);
  if (!found || found.days === null) return null;
  return new Date(now.getTime() + found.days * 24 * 60 * 60 * 1000);
}
