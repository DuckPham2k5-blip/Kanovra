/**
 * The date-format preference: how a plain date and a date-time read across the
 * app. Pure and directive-free so both the server (which reads the cookie at
 * request time to seed the provider) and the client can import it.
 *
 * The preference lives in a **cookie**, not `localStorage`, and that is the
 * whole reason this works without a hydration mismatch: a date rendered on the
 * server for the first HTML and the same date rendered on the client must come
 * out identical, and only a cookie is readable in both places for one request.
 * The default is `written` — exactly the format the app used before this
 * existed — so an account with no cookie sees no change at all.
 */

export type DateFormatKey = "written" | "dmy" | "mdy" | "iso";

export const REGION_COOKIE = "kanovra-region";

export const DATE_FORMATS: {
  key: DateFormatKey;
  label: string;
  example: string;
  date: string;
  dateTime: string;
}[] = [
  {
    key: "written",
    label: "Month D, YYYY",
    example: "Sep 22, 2026",
    date: "MMM d, yyyy",
    dateTime: "MMM d, yyyy 'at' h:mm a",
  },
  {
    key: "dmy",
    label: "DD/MM/YYYY",
    example: "22/09/2026",
    date: "dd/MM/yyyy",
    dateTime: "dd/MM/yyyy 'at' HH:mm",
  },
  {
    key: "mdy",
    label: "MM/DD/YYYY",
    example: "09/22/2026",
    date: "MM/dd/yyyy",
    dateTime: "MM/dd/yyyy 'at' h:mm a",
  },
  {
    key: "iso",
    label: "YYYY-MM-DD",
    example: "2026-09-22",
    date: "yyyy-MM-dd",
    dateTime: "yyyy-MM-dd HH:mm",
  },
];

export const DEFAULT_DATE_FORMAT: DateFormatKey = "written";

export function isDateFormatKey(value: string | undefined | null): value is DateFormatKey {
  return DATE_FORMATS.some((f) => f.key === value);
}

/** The stored preference from a raw cookie value, defaulting when absent or
 *  unknown so an old cookie for a removed format simply falls back. */
export function parseDateFormat(value: string | undefined | null): DateFormatKey {
  return isDateFormatKey(value) ? value : DEFAULT_DATE_FORMAT;
}

/** The date-fns patterns for a format key. */
export function patternsFor(key: DateFormatKey): { date: string; dateTime: string } {
  const found = DATE_FORMATS.find((f) => f.key === key) ?? DATE_FORMATS[0];
  return { date: found.date, dateTime: found.dateTime };
}
