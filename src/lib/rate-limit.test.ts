import { beforeEach, describe, expect, it } from "vitest";

import { consumeToken, resetRateLimits, WRITE_LIMIT } from "./rate-limit";

/**
 * A limiter is only useful if it blocks the right callers and nobody else, so
 * these cover both directions: that a flood is stopped, and that an ordinary
 * burst of work is not. The clock is injected rather than faked with timers,
 * which keeps the refill maths readable and the suite fast.
 */

const OPTS = { limit: 10, windowMs: 1000 };

beforeEach(() => {
  resetRateLimits();
});

describe("consumeToken()", () => {
  it("allows exactly the configured burst, then blocks", () => {
    const now = 1_000_000;
    for (let i = 0; i < OPTS.limit; i++) {
      expect(consumeToken("u1", OPTS, now).ok, `request ${i + 1} should pass`).toBe(true);
    }
    const blocked = consumeToken("u1", OPTS, now);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps callers independent", () => {
    const now = 1_000_000;
    for (let i = 0; i < OPTS.limit; i++) consumeToken("u1", OPTS, now);
    expect(consumeToken("u1", OPTS, now).ok).toBe(false);
    // A second user must be unaffected by the first one's spending.
    expect(consumeToken("u2", OPTS, now).ok).toBe(true);
  });

  it("refills gradually rather than resetting on a boundary", () => {
    const start = 2_000_000;
    for (let i = 0; i < OPTS.limit; i++) consumeToken("u1", OPTS, start);
    expect(consumeToken("u1", OPTS, start).ok).toBe(false);

    // Half a window later, roughly half the allowance is back — a fixed window
    // would still be refusing everything until the boundary, then hand back
    // the whole budget at once and let a caller spend 2x in an instant.
    const half = consumeToken("u1", OPTS, start + OPTS.windowMs / 2);
    expect(half.ok).toBe(true);
    expect(half.remaining).toBeGreaterThanOrEqual(3);
    expect(half.remaining).toBeLessThan(OPTS.limit);
  });

  it("never refills beyond the cap, however long the caller idles", () => {
    const start = 3_000_000;
    consumeToken("u1", OPTS, start);
    // An hour of silence must not bank an hour's worth of requests.
    const after = consumeToken("u1", OPTS, start + 3_600_000);
    expect(after.remaining).toBe(OPTS.limit - 1);
  });

  it("reports a retry delay the caller can act on", () => {
    const now = 4_000_000;
    for (let i = 0; i < OPTS.limit; i++) consumeToken("u1", OPTS, now);
    const blocked = consumeToken("u1", OPTS, now);
    // One token at 10 per second is ~100ms, rounded up to a whole second.
    expect(blocked.retryAfterSeconds).toBe(1);

    // Waiting that long must actually clear the block, or the header lies.
    const later = consumeToken("u1", OPTS, now + blocked.retryAfterSeconds * 1000);
    expect(later.ok).toBe(true);
  });

  it("bounds memory instead of growing a key per user forever", () => {
    // Well past MAX_KEYS: the map has to evict rather than accumulate.
    for (let i = 0; i < 10_500; i++) consumeToken(`user-${i}`, OPTS, 5_000_000);
    // The most recent caller is still tracked and still limited.
    const key = "user-10499";
    for (let i = 1; i < OPTS.limit; i++) consumeToken(key, OPTS, 5_000_000);
    expect(consumeToken(key, OPTS, 5_000_000).ok).toBe(false);
  });
});

describe("WRITE_LIMIT", () => {
  it("sits far above human pace but well below a script's", () => {
    // A person dragging cards fast might manage a few a second in bursts; the
    // cap has to clear that comfortably while still stopping a loop.
    expect(WRITE_LIMIT.limit).toBeGreaterThanOrEqual(60);
    expect(WRITE_LIMIT.limit).toBeLessThanOrEqual(300);
    expect(WRITE_LIMIT.windowMs).toBe(60_000);
  });

  it("lets a realistic burst of work through untouched", () => {
    const now = 6_000_000;
    // Thirty edits in a few seconds — reordering a column, say — must not trip.
    for (let i = 0; i < 30; i++) {
      expect(consumeToken("busy-user", WRITE_LIMIT, now + i * 100).ok).toBe(true);
    }
  });
});
