import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { describe, expect, it } from "vitest";

import {
  DATE_FORMATS,
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIME_ZONE,
  parseDateFormat,
  parseRegionCookie,
  patternsFor,
  serializeRegionCookie,
} from "@/lib/region";

/**
 * The date-format preference. The sharp test is the last one: the example shown
 * next to each option in the settings menu must be exactly what its pattern
 * produces, or the menu promises "22/09/2026" and the app prints "09/22/2026".
 * Tying the two together here means a changed pattern with a stale example goes
 * red instead of lying on screen.
 */

describe("date format preference", () => {
  it("falls back to the default for an absent or unknown cookie", () => {
    expect(parseDateFormat(undefined)).toBe(DEFAULT_DATE_FORMAT);
    expect(parseDateFormat(null)).toBe(DEFAULT_DATE_FORMAT);
    expect(parseDateFormat("nonsense")).toBe(DEFAULT_DATE_FORMAT);
  });

  it("keeps a valid key", () => {
    for (const f of DATE_FORMATS) {
      expect(parseDateFormat(f.key)).toBe(f.key);
    }
  });

  it("resolves patterns for every key and for a bad one", () => {
    for (const f of DATE_FORMATS) {
      expect(patternsFor(f.key).date).toBe(f.date);
    }
    // @ts-expect-error — a value the type forbids, to prove the runtime fallback.
    expect(patternsFor("bogus").date).toBe(DATE_FORMATS[0].date);
  });

  it("shows an example that its own pattern actually produces", () => {
    // 22 September 2026 — a day and month that read differently in every format,
    // so DD/MM and MM/DD cannot accidentally agree.
    const sample = new Date(2026, 8, 22, 13, 5);
    for (const f of DATE_FORMATS) {
      expect(format(sample, f.date)).toBe(f.example);
    }
  });
});

describe("region cookie (format + timezone)", () => {
  it("round-trips a full region through the cookie value", () => {
    const region = { dateFormat: "iso" as const, timeZone: "Asia/Bangkok" };
    expect(parseRegionCookie(serializeRegionCookie(region))).toEqual(region);
  });

  it("reads an older format-only cookie and defaults the zone", () => {
    expect(parseRegionCookie("dmy")).toEqual({
      dateFormat: "dmy",
      timeZone: DEFAULT_TIME_ZONE,
    });
  });

  it("defaults both halves for an absent or unknown cookie", () => {
    expect(parseRegionCookie(undefined)).toEqual({
      dateFormat: DEFAULT_DATE_FORMAT,
      timeZone: DEFAULT_TIME_ZONE,
    });
    // A zone not in the curated list falls back, so no unvalidated string ever
    // reaches the formatter.
    expect(parseRegionCookie("iso~Mars/Olympus").timeZone).toBe(DEFAULT_TIME_ZONE);
  });

  it("formats a UTC instant into the chosen zone", () => {
    // 20:30 UTC is the next calendar day in Bangkok (+7) and still evening in
    // New York (-4) — the whole point of an explicit zone.
    const instant = new Date("2026-09-22T20:30:00Z");
    expect(formatInTimeZone(instant, "Asia/Bangkok", "dd/MM/yyyy HH:mm")).toBe("23/09/2026 03:30");
    expect(formatInTimeZone(instant, "America/New_York", "yyyy-MM-dd HH:mm")).toBe("2026-09-22 16:30");
  });
});
