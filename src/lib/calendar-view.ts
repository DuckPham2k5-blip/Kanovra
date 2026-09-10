import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

/**
 * The calendar is a month grid, and one date is *selected* on it.
 *
 * There used to be three views — day, month, year — behind a switcher, and the
 * owner removed it: the grid is the one canvas now, and the picker moves the
 * selected date around it. So this module is two things — the range the server
 * fetches for a month, and the arithmetic the date picker needs — with the day
 * arithmetic pinned by tests because every piece of it has a trap in it.
 *
 * ## The anchor is the selected date, carried as `?date=YYYY-MM-DD`
 *
 * It positions the grid (which month it shows) and marks the cell that glows.
 * Parsed local, never through `new Date("…")`, which is UTC midnight and lands
 * a day early west of Greenwich.
 */

export function resolveAnchor(param: string | undefined | null, today = new Date()): Date {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    const [y, m, d] = param.split("-").map(Number);
    const parsed = new Date(y, m - 1, d);
    // 2026-13-40 passes the regex and rolls over; reject anything that did not
    // round-trip to the numbers it was built from.
    if (parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d) {
      return parsed;
    }
  }
  return startOfDay(today);
}

/** The anchor as the string the URL carries. */
export function anchorKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * The inclusive [from, to] to fetch for the month the anchor sits in.
 *
 * The whole grid, not the calendar month — Monday of the week the 1st falls in
 * to Sunday of the week the last day falls in — because the grid draws the tail
 * of the previous month and the head of the next, and a task due on one of
 * those trailing days shows in the cell and must be fetched or the cell lies.
 */
export function monthGridRange(anchor: Date): { from: Date; to: Date } {
  return {
    from: startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }),
    to: endOfDay(endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 })),
  };
}

/**
 * The anchor moved one month, landing on the 1st.
 *
 * Not on the anchor's own day-of-month: stepping a month from the 31st would
 * ask for 31 November, which JavaScript rolls to 1 December — October skipped
 * every time you page forward off a 31-day month. The same `setUTCMonth` trap
 * the recurring-task code carries a note about.
 */
export function stepMonth(anchor: Date, direction: 1 | -1): Date {
  const next = new Date(anchor);
  next.setDate(1);
  next.setMonth(next.getMonth() + direction);
  return startOfDay(next);
}

// ---------------------------------------------------------------------------
// The date picker — choosing an exact day/month/year to jump to.
// ---------------------------------------------------------------------------

/**
 * All three, always. The picker offers day, month and year whatever the grid
 * is showing, because the grid is always a month and the point of the picker is
 * to reach a cell that is not currently on it.
 */
export type DatePart = "day" | "month" | "year";
export const DATE_PARTS: readonly DatePart[] = ["day", "month", "year"] as const;
export const PART_LABELS: Record<DatePart, string> = { day: "Day", month: "Month", year: "Year" };

/**
 * Days in a month, month being 0-based like `Date`.
 *
 * Day 0 of the *next* month is the last day of this one, which is how February
 * comes out 28 or 29 without a leap-year branch to get wrong.
 */
export function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/**
 * The anchor with one part replaced, the day clamped to a real date.
 *
 * The day is *kept* where it can be — picking "February" from the 15th stays
 * the 15th — and clamped only when it cannot: the 31st in February becomes the
 * 28th (or 29th) rather than leaking into March, the overflow `stepMonth` also
 * guards against.
 */
export function withPart(anchor: Date, part: DatePart, value: number): Date {
  let year = anchor.getFullYear();
  let month = anchor.getMonth();
  let day = anchor.getDate();

  if (part === "year") year = value;
  else if (part === "month") month = value; // 0-based
  else day = value;

  const max = daysInMonth(year, month);
  if (day > max) day = max;
  return new Date(year, month, day);
}

/**
 * The span of years the picker lists.
 *
 * Wide rather than unbounded — a list ends somewhere — but far past any real
 * due date in either direction, and typing reaches anything outside it. The
 * current year is scrolled to without the list starting there.
 */
export function pickerYears(currentYear: number, span = { back: 100, forward: 1000 }): number[] {
  const first = currentYear - span.back;
  const count = span.back + span.forward + 1;
  return Array.from({ length: count }, (_, i) => first + i);
}
