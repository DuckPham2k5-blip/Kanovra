import { describe, expect, it } from "vitest";

import {
  entrySeconds,
  estimateProgress,
  formatDuration,
  isRunning,
  runningEntry,
  secondsToHours,
  totalSeconds,
} from "@/lib/time-tracking";

const NOW = new Date("2026-09-03T12:00:00.000Z").getTime();
const at = (iso: string) => new Date(iso);

describe("entrySeconds", () => {
  it("measures a finished entry between its own timestamps", () => {
    expect(
      entrySeconds(
        { startedAt: at("2026-09-03T10:00:00Z"), endedAt: at("2026-09-03T11:30:00Z") },
        NOW,
      ),
    ).toBe(90 * 60);
  });

  it("measures a running entry against the clock", () => {
    expect(entrySeconds({ startedAt: at("2026-09-03T11:00:00Z"), endedAt: null }, NOW)).toBe(
      60 * 60,
    );
  });

  it("accepts ISO strings as well as dates, since that is what a DTO carries", () => {
    expect(entrySeconds({ startedAt: "2026-09-03T11:00:00.000Z", endedAt: null }, NOW)).toBe(
      60 * 60,
    );
  });

  /**
   * The one that protects the sum. A negative entry does not merely misreport
   * itself — it subtracts from everybody else's logged time in the same total.
   */
  it("clamps a backwards interval to zero rather than going negative", () => {
    expect(
      entrySeconds(
        { startedAt: at("2026-09-03T11:00:00Z"), endedAt: at("2026-09-03T10:00:00Z") },
        NOW,
      ),
    ).toBe(0);
  });

  it("clamps a running entry whose start is in the future", () => {
    expect(entrySeconds({ startedAt: at("2026-09-03T13:00:00Z"), endedAt: null }, NOW)).toBe(0);
  });

  it("answers zero for an unreadable timestamp instead of NaN", () => {
    expect(entrySeconds({ startedAt: "not a date", endedAt: null }, NOW)).toBe(0);
    expect(entrySeconds({ startedAt: at("2026-09-03T11:00:00Z"), endedAt: "nope" }, NOW)).toBe(0);
  });
});

describe("totalSeconds", () => {
  it("adds finished and running entries together", () => {
    const total = totalSeconds(
      [
        { startedAt: at("2026-09-03T08:00:00Z"), endedAt: at("2026-09-03T09:00:00Z") },
        { startedAt: at("2026-09-03T10:00:00Z"), endedAt: at("2026-09-03T10:30:00Z") },
        { startedAt: at("2026-09-03T11:45:00Z"), endedAt: null },
      ],
      NOW,
    );
    expect(total).toBe(60 * 60 + 30 * 60 + 15 * 60);
  });

  it("is zero for no entries", () => {
    expect(totalSeconds([], NOW)).toBe(0);
  });

  /** A single bad row must not be able to shrink the total. */
  it("cannot be reduced by a backwards entry", () => {
    const good = { startedAt: at("2026-09-03T08:00:00Z"), endedAt: at("2026-09-03T09:00:00Z") };
    const bad = { startedAt: at("2026-09-03T11:00:00Z"), endedAt: at("2026-09-03T09:00:00Z") };
    expect(totalSeconds([good, bad], NOW)).toBe(totalSeconds([good], NOW));
  });
});

describe("formatDuration", () => {
  it("names the short cases the way a person would", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(40)).toBe("less than a minute");
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(45 * 60)).toBe("45m");
  });

  it("shows hours and minutes together up to ten hours", () => {
    expect(formatDuration(2 * 3600 + 15 * 60)).toBe("2h 15m");
    expect(formatDuration(9 * 3600 + 59 * 60)).toBe("9h 59m");
  });

  it("drops the minutes past ten hours, and on a whole hour", () => {
    expect(formatDuration(3 * 3600)).toBe("3h");
    expect(formatDuration(12 * 3600 + 3 * 60)).toBe("12h");
  });

  it("does not print a number for something unmeasurable", () => {
    expect(formatDuration(-1)).toBe("—");
    expect(formatDuration(Number.NaN)).toBe("—");
  });
});

describe("secondsToHours", () => {
  it("converts, and never returns a negative", () => {
    expect(secondsToHours(3600)).toBe(1);
    expect(secondsToHours(5400)).toBe(1.5);
    expect(secondsToHours(-100)).toBe(0);
  });
});

describe("estimateProgress", () => {
  it("is null without a usable estimate", () => {
    // A bar with no ceiling measures nothing; drawing one anyway would be a
    // confident lie.
    expect(estimateProgress(3600, null)).toBeNull();
    expect(estimateProgress(3600, undefined)).toBeNull();
    expect(estimateProgress(3600, 0)).toBeNull();
    expect(estimateProgress(3600, -2)).toBeNull();
  });

  it("reports the fraction used", () => {
    expect(estimateProgress(3600, 4)).toEqual({ percent: 25, over: false, overBy: 0 });
    expect(estimateProgress(2 * 3600, 4)).toEqual({ percent: 50, over: false, overBy: 0 });
  });

  /**
   * The cap is a drawing concern. It must not reach the number people read, or
   * a task at triple its estimate reports as merely "full".
   */
  it("caps the bar at 100 but reports the overrun honestly", () => {
    const out = estimateProgress(6 * 3600, 2);
    expect(out).not.toBeNull();
    expect(out!.percent).toBe(100);
    expect(out!.over).toBe(true);
    expect(out!.overBy).toBe(4);
  });

  it("is not over when logged exactly equals the estimate", () => {
    expect(estimateProgress(2 * 3600, 2)).toEqual({ percent: 100, over: false, overBy: 0 });
  });
});

describe("runningEntry", () => {
  const rows = [
    { userId: "a", startedAt: at("2026-09-03T08:00:00Z"), endedAt: at("2026-09-03T09:00:00Z") },
    { userId: "b", startedAt: at("2026-09-03T11:00:00Z"), endedAt: null },
    { userId: "a", startedAt: at("2026-09-03T11:30:00Z"), endedAt: null },
  ];

  it("finds this person's running entry and nobody else's", () => {
    expect(runningEntry(rows, "a")?.startedAt).toEqual(at("2026-09-03T11:30:00Z"));
    expect(runningEntry(rows, "b")?.startedAt).toEqual(at("2026-09-03T11:00:00Z"));
  });

  it("is null when this person has none running", () => {
    expect(runningEntry(rows, "c")).toBeNull();
    expect(runningEntry([rows[0]], "a")).toBeNull();
  });

  it("agrees with isRunning", () => {
    expect(isRunning(rows[0])).toBe(false);
    expect(isRunning(rows[1])).toBe(true);
  });
});
