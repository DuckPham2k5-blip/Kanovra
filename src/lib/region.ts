/**
 * The date/time display preferences: how a date reads (format) and in which
 * timezone. Pure and directive-free so both the server (which reads the cookie
 * at request time to seed the provider) and the client can import it.
 *
 * The preference lives in a **cookie**, not `localStorage`, and that is the
 * whole reason this works without a hydration mismatch: a date rendered on the
 * server for the first HTML and the same date rendered on the client must come
 * out identical, and only a cookie is readable in both places for one request.
 * The default — `written` format, `auto` timezone — is exactly what the app did
 * before this existed, so an account with no cookie sees no change at all.
 *
 * `auto` means the device's own timezone. An explicit zone is formatted the
 * same on the server and the client (the offset is computed from the zone, not
 * the runtime), so it is fully consistent; `auto` keeps the historical
 * behaviour of formatting in whatever timezone the runtime happens to be in.
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
export const AUTO_TIME_ZONE = "auto";
export const DEFAULT_TIME_ZONE = AUTO_TIME_ZONE;

/** A curated set of common zones, labelled like the picker in the mockup. The
 *  UI only offers these, and the cookie is validated against them, so an edited
 *  cookie can never smuggle an arbitrary string into the formatter. */
export const TIME_ZONES: { value: string; label: string }[] = [
  { value: "auto", label: "Auto (device timezone)" },
  { value: "Pacific/Honolulu", label: "(GMT-10) Hawaii" },
  { value: "America/Anchorage", label: "(GMT-9) Alaska" },
  { value: "America/Los_Angeles", label: "(GMT-8) Pacific Time" },
  { value: "America/Denver", label: "(GMT-7) Mountain Time" },
  { value: "America/Chicago", label: "(GMT-6) Central Time" },
  { value: "America/New_York", label: "(GMT-5) Eastern Time" },
  { value: "America/Sao_Paulo", label: "(GMT-3) São Paulo" },
  { value: "Atlantic/Azores", label: "(GMT-1) Azores" },
  { value: "Europe/London", label: "(GMT+0) London, Dublin" },
  { value: "Europe/Paris", label: "(GMT+1) Paris, Berlin, Madrid" },
  { value: "Europe/Athens", label: "(GMT+2) Athens, Cairo" },
  { value: "Europe/Moscow", label: "(GMT+3) Moscow, Istanbul" },
  { value: "Asia/Dubai", label: "(GMT+4) Dubai" },
  { value: "Asia/Karachi", label: "(GMT+5) Karachi" },
  { value: "Asia/Kolkata", label: "(GMT+5:30) India" },
  { value: "Asia/Dhaka", label: "(GMT+6) Dhaka" },
  { value: "Asia/Bangkok", label: "(GMT+7) Bangkok, Hanoi, Jakarta" },
  { value: "Asia/Shanghai", label: "(GMT+8) Beijing, Singapore" },
  { value: "Asia/Tokyo", label: "(GMT+9) Tokyo, Seoul" },
  { value: "Australia/Sydney", label: "(GMT+10) Sydney" },
  { value: "Pacific/Auckland", label: "(GMT+12) Auckland" },
];

export type Region = { dateFormat: DateFormatKey; timeZone: string };

export function isDateFormatKey(value: string | undefined | null): value is DateFormatKey {
  return DATE_FORMATS.some((f) => f.key === value);
}

export function isTimeZone(value: string | undefined | null): boolean {
  return TIME_ZONES.some((z) => z.value === value);
}

export function parseDateFormat(value: string | undefined | null): DateFormatKey {
  return isDateFormatKey(value) ? value : DEFAULT_DATE_FORMAT;
}

export function parseTimeZone(value: string | undefined | null): string {
  return isTimeZone(value) ? (value as string) : DEFAULT_TIME_ZONE;
}

/**
 * The whole region preference from one cookie value. Stored as `format~zone`;
 * an older cookie holding only a format has no `~` and simply defaults the zone.
 */
export function parseRegionCookie(value: string | undefined | null): Region {
  const [format, zone] = (value ?? "").split("~");
  return { dateFormat: parseDateFormat(format), timeZone: parseTimeZone(zone) };
}

export function serializeRegionCookie(region: Region): string {
  return `${region.dateFormat}~${region.timeZone}`;
}

/** The date-fns patterns for a format key. */
export function patternsFor(key: DateFormatKey): { date: string; dateTime: string } {
  const found = DATE_FORMATS.find((f) => f.key === key) ?? DATE_FORMATS[0];
  return { date: found.date, dateTime: found.dateTime };
}
