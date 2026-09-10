import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";

/**
 * The three ways to look at the calendar, and the arithmetic behind each.
 *
 * ## Why this is a module and not inline in the component
 *
 * Three things have to agree about what "the September 2026 view" means: the
 * server, which fetches exactly the tasks in a range; the header, which names
 * the period; and the prev/next buttons, which step by one unit of it. Written
 * three times they drift — a range that fetches a day while the header says a
 * month is a screen that looks empty for no reason anybody can see. So the
 * range, the label and the step all come from here, and the one thing that is
 * hard to get right — a fetch range that covers the *whole grid*, not just the
 * calendar month — is pinned by a test.
 *
 * ## The anchor is one date, whatever the view
 *
 * `?date=YYYY-MM-DD` carries the position for all three views rather than a
 * param per view, so switching day→month→year keeps you where you were instead
 * of resetting to today. The day it names is only *within* the period on the
 * wider views: the anchor `2026-09-15` is "September" to the month view and
 * "2026" to the year view.
 */

export type CalendarView = "day" | "month" | "year";

const VIEWS: readonly CalendarView[] = ["day", "month", "year"] as const;

/** A value from the address bar is only ever one of the three. */
export function resolveView(param: string | undefined | null): CalendarView {
  return VIEWS.includes(param as CalendarView) ? (param as CalendarView) : "month";
}

/**
 * The anchor date, from `?date=YYYY-MM-DD`, falling back to today.
 *
 * Parsed into a *local* date rather than through `new Date("2026-09-15")`,
 * which reads the string as UTC midnight and lands on the day before in any
 * timezone west of Greenwich. Every other date in this file is local, and a
 * calendar that disagrees with itself by a day near midnight is the kind of bug
 * that only ever reproduces for somebody in the wrong timezone.
 */
export function resolveAnchor(param: string | undefined | null, today = new Date()): Date {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    const [y, m, d] = param.split("-").map(Number);
    const parsed = new Date(y, m - 1, d);
    // A shape like 2026-13-40 passes the regex and rolls over; reject anything
    // that did not round-trip to the numbers it was built from.
    if (parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d) {
      return parsed;
    }
  }
  return startOfDay(today);
}

/** The anchor as the string the URL carries. */
export function anchorKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/**
 * The inclusive [from, to] range to fetch for a view at an anchor.
 *
 * Day is that day. Year is 1 January to 31 December. Month is the whole grid a
 * month view draws — Monday of the week the 1st falls in, to Sunday of the week
 * the last day falls in — because the grid shows the tail of the previous month
 * and the head of the next, and a task due on one of those trailing days is
 * visible in the cell and must be fetched or the cell lies.
 */
export function rangeFor(view: CalendarView, anchor: Date): { from: Date; to: Date } {
  switch (view) {
    case "day":
      return { from: startOfDay(anchor), to: endOfDay(anchor) };
    case "year":
      return { from: startOfYear(anchor), to: endOfYear(anchor) };
    case "month":
      return {
        from: startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }),
        to: endOfDay(endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 })),
      };
  }
}

/**
 * The anchor moved one unit of the view — a day, a month or a year.
 *
 * Month steps on the 1st, not the anchor's own day-of-month: stepping from the
 * 31st would skip February and land on 3 March, the same `setUTCMonth` trap the
 * recurring-task code already carries a note about. Day and year cannot hit it.
 */
export function step(view: CalendarView, anchor: Date, direction: 1 | -1): Date {
  const next = new Date(anchor);
  switch (view) {
    case "day":
      next.setDate(next.getDate() + direction);
      break;
    case "month":
      next.setDate(1);
      next.setMonth(next.getMonth() + direction);
      break;
    case "year":
      next.setFullYear(next.getFullYear() + direction);
      break;
  }
  return startOfDay(next);
}

/** What the header says the current period is. */
export function periodLabel(view: CalendarView, anchor: Date): string {
  switch (view) {
    case "day":
      return format(anchor, "EEEE, d MMMM yyyy");
    case "month":
      return format(anchor, "MMMM yyyy");
    case "year":
      return format(anchor, "yyyy");
  }
}

export const VIEW_LABELS: Record<CalendarView, string> = {
  day: "Day",
  month: "Month",
  year: "Year",
};

export { VIEWS };
