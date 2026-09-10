import { describe, expect, it } from "vitest";

import {
  anchorKey,
  daysInMonth,
  periodLabel,
  pickableParts,
  pickerYears,
  rangeFor,
  resolveAnchor,
  resolveView,
  step,
  withPart,
} from "@/lib/calendar-view";

const iso = (d: Date) => `${anchorKey(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

describe("resolveView", () => {
  it("accepts the three views", () => {
    expect(resolveView("day")).toBe("day");
    expect(resolveView("month")).toBe("month");
    expect(resolveView("year")).toBe("year");
  });

  it("falls back to month for anything else", () => {
    // The value comes from the address bar, so "week", "", null and junk all
    // have to land on the same safe default rather than reaching a switch with
    // no arm for them.
    for (const bad of ["week", "", "  ", "MONTH", "day ", undefined, null, "../etc"]) {
      expect(resolveView(bad), String(bad)).toBe("month");
    }
  });
});

describe("resolveAnchor", () => {
  const today = new Date(2026, 8, 20); // 20 Sep 2026, local

  it("reads a valid date", () => {
    expect(anchorKey(resolveAnchor("2026-03-15", today))).toBe("2026-03-15");
  });

  it("falls back to today for a missing or malformed value", () => {
    for (const bad of [undefined, null, "", "2026-3-5", "15/03/2026", "2026-03"]) {
      expect(anchorKey(resolveAnchor(bad, today)), String(bad)).toBe("2026-09-20");
    }
  });

  /*
   * A shape that passes the regex but is not a real date. `2026-13-40` would
   * roll over to a day in 2027 if trusted, so it is checked to round-trip and
   * rejected when it does not.
   */
  it("rejects a well-shaped but impossible date", () => {
    expect(anchorKey(resolveAnchor("2026-13-40", today))).toBe("2026-09-20");
    expect(anchorKey(resolveAnchor("2026-02-30", today))).toBe("2026-09-20");
  });

  /*
   * The timezone trap, made explicit. `new Date("2026-09-15")` is UTC midnight,
   * which is the 14th at 19:00 in New York — so a naive parse shifts the whole
   * calendar back a day for anyone west of Greenwich. The local parse keeps the
   * day the string names.
   */
  it("keeps the day the string names, not the UTC one", () => {
    const anchor = resolveAnchor("2026-09-15", today);
    expect(anchor.getDate()).toBe(15);
    expect(anchor.getMonth()).toBe(8);
    expect(anchor.getHours()).toBe(0);
  });
});

describe("rangeFor", () => {
  const anchor = new Date(2026, 8, 15); // 15 Sep 2026

  it("day view covers exactly the one day", () => {
    const { from, to } = rangeFor("day", anchor);
    expect(iso(from)).toBe("2026-09-15 00:00");
    expect(iso(to)).toBe("2026-09-15 23:59");
  });

  it("year view covers 1 January to 31 December", () => {
    const { from, to } = rangeFor("year", anchor);
    expect(anchorKey(from)).toBe("2026-01-01");
    expect(anchorKey(to)).toBe("2026-12-31");
  });

  /*
   * The one that is easy to get wrong. September 2026 begins on a Tuesday, so
   * the grid's first cell is Monday 31 August, and it ends on a Wednesday, so
   * the last cell is Sunday 4 October. A range of just 1–30 September leaves a
   * task due on the 31st of August visible in the grid but never fetched — a
   * cell that silently lies. The range has to cover the whole grid.
   */
  it("month view covers the whole grid, not just the calendar month", () => {
    const { from, to } = rangeFor("month", anchor);
    expect(anchorKey(from)).toBe("2026-08-31"); // Monday of the 1st's week
    expect(anchorKey(to)).toBe("2026-10-04"); // Sunday of the last day's week
    expect(iso(to)).toBe("2026-10-04 23:59");
  });

  it("month view starts on a Monday and ends on a Sunday, every month of a year", () => {
    for (let m = 0; m < 12; m += 1) {
      const { from, to } = rangeFor("month", new Date(2026, m, 15));
      // 1 = Monday, 0 = Sunday in getDay().
      expect(from.getDay(), `month ${m} start`).toBe(1);
      expect(to.getDay(), `month ${m} end`).toBe(0);
    }
  });
});

describe("step", () => {
  it("day moves one day", () => {
    expect(anchorKey(step("day", new Date(2026, 8, 15), 1))).toBe("2026-09-16");
    expect(anchorKey(step("day", new Date(2026, 8, 15), -1))).toBe("2026-09-14");
  });

  it("day crosses a month boundary", () => {
    expect(anchorKey(step("day", new Date(2026, 8, 30), 1))).toBe("2026-10-01");
  });

  it("year moves one year", () => {
    expect(anchorKey(step("year", new Date(2026, 8, 15), 1))).toBe("2027-09-15");
    expect(anchorKey(step("year", new Date(2026, 8, 15), -1))).toBe("2025-09-15");
  });

  it("month moves one month", () => {
    expect(anchorKey(step("month", new Date(2026, 8, 15), 1))).toBe("2026-10-01");
    expect(anchorKey(step("month", new Date(2026, 8, 15), -1))).toBe("2026-08-01");
  });

  /*
   * The month trap this project already carries a note about, for recurring
   * tasks. Stepping a month from the 31st with the day-of-month kept would ask
   * for 31 November, which JavaScript rolls to 1 December — so October would be
   * unreachable, skipped every time you paged forward from a 31-day month. It
   * steps on the 1st to avoid it.
   */
  it("month steps on the first, so a 31-day month does not skip the next", () => {
    expect(anchorKey(step("month", new Date(2026, 9, 31), 1))).toBe("2026-11-01");
    expect(anchorKey(step("month", new Date(2026, 0, 31), 1))).toBe("2026-02-01");
  });

  it("month steps across a year boundary in both directions", () => {
    expect(anchorKey(step("month", new Date(2026, 11, 10), 1))).toBe("2027-01-01");
    expect(anchorKey(step("month", new Date(2026, 0, 10), -1))).toBe("2025-12-01");
  });
});

describe("periodLabel", () => {
  const anchor = new Date(2026, 8, 15);

  it("names each period at the right resolution", () => {
    expect(periodLabel("day", anchor)).toBe("Tuesday, 15 September 2026");
    expect(periodLabel("month", anchor)).toBe("September 2026");
    expect(periodLabel("year", anchor)).toBe("2026");
  });
});

describe("pickableParts", () => {
  it("offers only what the view reads", () => {
    // Picking a day while looking at a year sets something the year view never
    // shows, so the parts follow the view rather than always being three.
    expect(pickableParts("day")).toEqual(["day", "month", "year"]);
    expect(pickableParts("month")).toEqual(["month", "year"]);
    expect(pickableParts("year")).toEqual(["year"]);
  });
});

describe("daysInMonth", () => {
  it("knows the length of each kind of month", () => {
    expect(daysInMonth(2026, 0)).toBe(31); // January
    expect(daysInMonth(2026, 3)).toBe(30); // April
    expect(daysInMonth(2026, 1)).toBe(28); // Feb 2026, not a leap year
    expect(daysInMonth(2028, 1)).toBe(29); // Feb 2028, a leap year
  });
});

describe("withPart", () => {
  it("replaces the year, keeping month and day", () => {
    expect(anchorKey(withPart(new Date(2026, 2, 15), "year", 2030))).toBe("2030-03-15");
  });

  it("replaces the month, keeping the day where it fits", () => {
    expect(anchorKey(withPart(new Date(2026, 8, 15), "month", 0))).toBe("2026-01-15");
  });

  it("replaces the day", () => {
    expect(anchorKey(withPart(new Date(2026, 8, 15), "day", 1))).toBe("2026-09-01");
  });

  /*
   * The clamp, which is the whole reason this is not `date.setMonth(...)`.
   * Moving the 31st to February must land on the last real day of February, not
   * roll forward into March — the overflow the stepper also guards against.
   */
  it("clamps a day that the new month does not have", () => {
    expect(anchorKey(withPart(new Date(2026, 0, 31), "month", 1))).toBe("2026-02-28");
    expect(anchorKey(withPart(new Date(2028, 0, 31), "month", 1))).toBe("2028-02-29");
  });

  it("clamps the 31st when a year change makes February shorter", () => {
    // 29 Feb 2028 → set year 2026: 2026 is not a leap year, so it becomes the 28th.
    expect(anchorKey(withPart(new Date(2028, 1, 29), "year", 2026))).toBe("2026-02-28");
  });
});

describe("pickerYears", () => {
  it("spans a wide range around the current year, in order", () => {
    const years = pickerYears(2026, { back: 2, forward: 3 });
    expect(years).toEqual([2024, 2025, 2026, 2027, 2028, 2029]);
  });

  it("reaches far past any real due date, and includes the year 3000", () => {
    const years = pickerYears(2026);
    expect(years).toContain(2026);
    expect(years).toContain(3000);
    expect(years[0]).toBe(1926);
  });
});
