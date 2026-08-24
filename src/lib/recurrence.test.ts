import { describe, expect, it } from "vitest";

import {
  advance,
  describeRecurrence,
  formatRecurrence,
  nextDueDate,
  parseRecurrence,
} from "@/lib/recurrence";

const iso = (date: Date) => date.toISOString().slice(0, 10);
const at = (text: string) => new Date(`${text}T00:00:00.000Z`);

describe("parseRecurrence", () => {
  it("reads what it writes", () => {
    expect(parseRecurrence(formatRecurrence({ freq: "WEEKLY", interval: 2 }))).toEqual({
      freq: "WEEKLY",
      interval: 2,
    });
  });

  /*
   * Never throws. The column is a string and rows outlive the code that wrote
   * them; an unreadable rule has to mean "this task does not repeat", not an
   * error page on whoever opened the list.
   */
  it("answers null for anything it cannot read", () => {
    expect(parseRecurrence(null)).toBeNull();
    expect(parseRecurrence("")).toBeNull();
    expect(parseRecurrence("FORTNIGHTLY:1")).toBeNull();
    expect(parseRecurrence("WEEKLY")).toBeNull();
    expect(parseRecurrence("WEEKLY:0")).toBeNull();
    expect(parseRecurrence("WEEKLY:-3")).toBeNull();
    expect(parseRecurrence("WEEKLY:1.5")).toBeNull();
    expect(parseRecurrence("WEEKLY:9999")).toBeNull();
    expect(parseRecurrence("WEEKLY:abc")).toBeNull();
  });
});

describe("advance", () => {
  it("steps days and weeks exactly", () => {
    expect(iso(advance(at("2026-03-02"), { freq: "DAILY", interval: 3 }))).toBe("2026-03-05");
    expect(iso(advance(at("2026-03-02"), { freq: "WEEKLY", interval: 2 }))).toBe("2026-03-16");
  });

  it("keeps the day of the month", () => {
    expect(iso(advance(at("2026-03-15"), { freq: "MONTHLY", interval: 1 }))).toBe("2026-04-15");
    expect(iso(advance(at("2026-03-15"), { freq: "YEARLY", interval: 1 }))).toBe("2027-03-15");
  });

  /*
   * The trap. 31 January plus one month has no answer, and the obvious
   * implementation says 3 March — after which a monthly task lands on the 3rd
   * for the rest of its life and is never monthly again.
   */
  it("clamps to the end of a short month instead of overflowing into the next", () => {
    expect(iso(advance(at("2026-01-31"), { freq: "MONTHLY", interval: 1 }))).toBe("2026-02-28");
    expect(iso(advance(at("2026-08-31"), { freq: "MONTHLY", interval: 1 }))).toBe("2026-09-30");
  });

  it("comes back to the 31st the month after being clamped", () => {
    // February took it to the 28th; March has a 31st, and the rule is anchored to
    // the previous due date, so the task returns to the end of the month.
    const february = advance(at("2026-01-31"), { freq: "MONTHLY", interval: 1 });
    expect(iso(advance(at("2026-03-31"), { freq: "MONTHLY", interval: 1 }))).toBe("2026-04-30");
    expect(iso(february)).toBe("2026-02-28");
  });

  it("handles a leap day", () => {
    expect(iso(advance(at("2028-02-29"), { freq: "YEARLY", interval: 1 }))).toBe("2029-02-28");
  });
});

describe("nextDueDate", () => {
  /*
   * Anchored to the due date, not to the tick. A weekly report due on Mondays
   * stays due on Mondays when it is finished on the Wednesday; anchoring to the
   * completion drifts it later every cycle until the day means nothing.
   */
  it("counts from the previous due date, not from when it was finished", () => {
    const due = at("2026-03-02"); // a Monday
    const completed = at("2026-03-04"); // finished two days late
    expect(iso(nextDueDate({ freq: "WEEKLY", interval: 1 }, due, completed))).toBe("2026-03-09");
  });

  /*
   * One next occurrence, not one per missed cycle. Catching up on a list means
   * doing the thing once; three identical overdue rows is a mess somebody has to
   * clear by hand.
   */
  it("makes one occurrence however far behind the task is", () => {
    const due = at("2026-01-05");
    const completed = at("2026-03-04");
    expect(iso(nextDueDate({ freq: "WEEKLY", interval: 1 }, due, completed))).toBe("2026-03-09");
  });

  it("always lands in the future", () => {
    const completed = at("2026-03-04");
    const next = nextDueDate({ freq: "DAILY", interval: 1 }, at("2026-03-04"), completed);
    expect(next.getTime()).toBeGreaterThan(completed.getTime());
  });

  it("falls back to the completion when the task had no due date", () => {
    const completed = at("2026-03-04");
    expect(iso(nextDueDate({ freq: "WEEKLY", interval: 1 }, null, completed))).toBe("2026-03-11");
  });
});

describe("describeRecurrence", () => {
  it("drops the number when there is only one", () => {
    expect(describeRecurrence({ freq: "WEEKLY", interval: 1 })).toBe("Every week");
    expect(describeRecurrence({ freq: "DAILY", interval: 3 })).toBe("Every 3 days");
  });
});
