/**
 * In-memory token bucket, keyed per caller.
 *
 * Deliberately not `server-only`: this runs from middleware, which Next
 * evaluates in an Edge-like runtime where that guard resolves badly.
 *
 * Scope of the protection, stated plainly: this is an abuse ceiling, not a
 * quota. PM2 runs two workers, each with its own map, so a caller whose
 * requests are balanced across both can reach roughly twice the configured
 * rate. Making it exact would mean a database round trip on every mutation,
 * which is a real cost to buy precision that abuse prevention does not need —
 * so the limits below are set with that factor already in mind.
 */

type Bucket = {
  /** Fractional tokens remaining. */
  tokens: number;
  /** When the bucket was last refilled, in ms. */
  updatedAt: number;
};

const buckets = new Map<string, Bucket>();

/**
 * Hard cap on distinct keys. An unbounded map keyed by user id is a slow leak
 * on a long-lived process; when the cap is hit the oldest entries go, which at
 * worst forgives a caller who has been idle longest.
 */
const MAX_KEYS = 10_000;

export type RateLimitOptions = {
  /** Sustained requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

export type RateLimitResult = {
  ok: boolean;
  /** Whole tokens left after this call. */
  remaining: number;
  /** Seconds until one token is available again; 0 when allowed. */
  retryAfterSeconds: number;
};

function evictOldest() {
  // Map iterates in insertion order, and every touched key is re-inserted
  // below, so the front of the map is the least recently used.
  const overflow = buckets.size - MAX_KEYS + 1;
  let removed = 0;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    if (++removed >= overflow) break;
  }
}

/**
 * Consumes one token for `key`. Refills continuously rather than resetting on
 * a fixed boundary, so a caller cannot save up a full window's worth of
 * requests and spend them the instant the clock ticks over.
 */
export function consumeToken(
  key: string,
  { limit, windowMs }: RateLimitOptions,
  now = Date.now(),
): RateLimitResult {
  const refillPerMs = limit / windowMs;
  const existing = buckets.get(key);

  let tokens: number;
  if (existing) {
    const elapsed = Math.max(0, now - existing.updatedAt);
    tokens = Math.min(limit, existing.tokens + elapsed * refillPerMs);
    // Re-insert so the key moves to the back of the LRU order.
    buckets.delete(key);
  } else {
    tokens = limit;
    if (buckets.size >= MAX_KEYS) evictOldest();
  }

  const allowed = tokens >= 1;
  if (allowed) tokens -= 1;

  buckets.set(key, { tokens, updatedAt: now });

  return {
    ok: allowed,
    remaining: Math.floor(tokens),
    // Time for the bucket to reach one whole token.
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((1 - tokens) / refillPerMs / 1000)),
  };
}

/** Test seam — production never needs to clear this. */
export function resetRateLimits() {
  buckets.clear();
}

/**
 * Writes are capped well above anything a person produces: dragging cards
 * quickly is perhaps a handful a second in bursts, nowhere near this. It exists
 * to stop a script or a runaway client loop, not to pace normal work.
 */
export const WRITE_LIMIT: RateLimitOptions = { limit: 120, windowMs: 60_000 };

/**
 * Anonymous reads of a public share link, per client address.
 *
 * This is the first route in the application that makes the database do work
 * for somebody with no account, so it is the first that can be made expensive
 * by a stranger. A person reading a board makes a handful of requests and then
 * stops; sixty a minute leaves that untouched and still puts a ceiling on a
 * script.
 *
 * Keyed off `X-Forwarded-For`, which the Nginx config sets. With no proxy in
 * front — `next dev`, or a deploy that skipped `deploy/nginx.conf` — there is
 * no address to key on and every anonymous visitor shares one bucket, so the
 * limit degrades into a global cap rather than a per-caller one. That is the
 * safe direction to fail, and it is another reason the Nginx config is not
 * optional.
 */
export const PUBLIC_READ_LIMIT: RateLimitOptions = { limit: 60, windowMs: 60_000 };
