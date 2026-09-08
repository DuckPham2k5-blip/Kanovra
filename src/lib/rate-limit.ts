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

/**
 * Who to charge an anonymous request to.
 *
 * ## `X-Forwarded-For` is read from the *end*, and getting this backwards is a
 * silent hole
 *
 * Nginx sets the header with `$proxy_add_x_forwarded_for`, which is
 * `"$http_x_forwarded_for, $remote_addr"` — it **appends** the real peer address
 * to whatever the client sent. So the list runs oldest-first and everything
 * before the last entry was written by the caller. Reading the *first* entry
 * therefore reads a value the caller chose: send a different
 * `X-Forwarded-For` on every request and every request gets its own bucket,
 * which is not a weaker limit but no limit at all. That is how this function
 * was first written.
 *
 * `X-Real-IP` is preferred because it cannot carry caller data at all: it is a
 * plain `proxy_set_header X-Real-IP $remote_addr`, which *replaces* anything
 * that arrived. Behind this project's Nginx the two agree; the fallback exists
 * for a proxy that sets only the standard header.
 *
 * ## Without a proxy there is no answer, and it fails closed
 *
 * Run Next with nothing in front and both headers are whatever the caller says,
 * so neither can be trusted — but then they are usually absent, and `unknown`
 * puts every anonymous caller in one shared bucket. That is a stricter limit
 * rather than a looser one, which is the right direction to be wrong in, and it
 * is one more reason `deploy/nginx.conf` is not optional.
 */
export function clientAddress(
  forwardedFor: string | null | undefined,
  realIp?: string | null,
): string {
  const real = realIp?.trim();
  if (real) return real;

  const hops = (forwardedFor ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);

  // The last hop is the one our own proxy appended.
  return hops.length > 0 ? hops[hops.length - 1] : "unknown";
}
