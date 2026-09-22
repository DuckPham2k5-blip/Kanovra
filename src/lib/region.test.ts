import { format } from "date-fns";
import { describe, expect, it } from "vitest";

import {
  DATE_FORMATS,
  DEFAULT_DATE_FORMAT,
  parseDateFormat,
  patternsFor,
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
