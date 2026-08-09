import {
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  formatDistanceToNowStrict,
  isSameDay,
  isToday,
  isTomorrow,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { enUS } from "date-fns/locale";

const OPTS = { locale: enUS } as const;

export function formatDate(date: Date | string | null | undefined, pattern = "MMM d, yyyy") {
  if (!date) return "—";
  return format(new Date(date), pattern, OPTS);
}

export function formatDateTime(date: Date | string | null | undefined) {
  if (!date) return "—";
  return format(new Date(date), "MMM d, yyyy 'at' h:mm a", OPTS);
}

/** `2 hours ago` — used by the activity feed and comment list. */
export function fromNow(date: Date | string) {
  return formatDistanceToNowStrict(new Date(date), { addSuffix: true, ...OPTS });
}

/**
 * Human due-date label with an urgency flag so callers can colour it.
 * `overdue` is only true for dates strictly before today.
 */
export function dueLabel(date: Date | string | null | undefined): {
  text: string;
  overdue: boolean;
  soon: boolean;
} | null {
  if (!date) return null;
  const d = new Date(date);
  const days = differenceInCalendarDays(d, new Date());

  if (days < 0) {
    const n = Math.abs(days);
    return { text: `${n} day${n === 1 ? "" : "s"} overdue`, overdue: true, soon: false };
  }
  if (isToday(d)) return { text: "Today", overdue: false, soon: true };
  if (isTomorrow(d)) return { text: "Tomorrow", overdue: false, soon: true };
  if (days <= 7) return { text: format(d, "EEEE", OPTS), overdue: false, soon: days <= 3 };
  return { text: format(d, "MMM d", OPTS), overdue: false, soon: false };
}

/** Inclusive day range covering the month grid shown by the calendar view. */
export function monthGridRange(month: Date) {
  return {
    from: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    to: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  };
}

/** Array of `count` days ending today, used by the analytics trend charts. */
export function lastNDays(count: number) {
  const days: Date[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

/** Every day between two dates, inclusive — fills the calendar month grid. */
export function eachDay(from: Date, to: Date) {
  const days: Date[] = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** Column headers for the month grid, Monday first. */
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Validates a `?month=YYYY-MM` param, falling back to the current month. */
export function resolveMonth(param?: string) {
  if (param && /^\d{4}-\d{2}$/.test(param)) return param;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Inclusive [from, to] covering the whole month grid for a `YYYY-MM` key. */
export function monthRangeFromKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  return {
    from: startOfWeek(startOfMonth(first), { weekStartsOn: 1 }),
    to: endOfDay(endOfWeek(endOfMonth(first), { weekStartsOn: 1 })),
  };
}

export {
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameDay,
  isToday,
  differenceInCalendarDays,
  format,
};
