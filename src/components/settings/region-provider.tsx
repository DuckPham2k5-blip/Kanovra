"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { formatDate as rawFormatDate, formatDateTime as rawFormatDateTime } from "@/lib/date";
import {
  DEFAULT_DATE_FORMAT,
  REGION_COOKIE,
  patternsFor,
  type DateFormatKey,
} from "@/lib/region";

/**
 * Supplies the active date-format preference to the whole client tree, seeded
 * from the cookie the server read at request time. Every client component that
 * shows a date calls `useRegion().formatDate` instead of importing the raw
 * helper, so one setting reaches all of them — and because the seed is the same
 * cookie the server rendered from, the first client render matches the HTML.
 */

type RegionContext = {
  dateFormat: DateFormatKey;
  setDateFormat: (key: DateFormatKey) => void;
  formatDate: (date: Date | string | null | undefined) => string;
  formatDateTime: (date: Date | string | null | undefined) => string;
};

const Ctx = React.createContext<RegionContext | null>(null);

export function RegionProvider({
  initial,
  children,
}: {
  initial: DateFormatKey;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [dateFormat, setDate] = React.useState<DateFormatKey>(initial);

  // Keep in step if the server sends a different seed (e.g. after a refresh
  // following a change on another tab).
  React.useEffect(() => setDate(initial), [initial]);

  const setDateFormat = React.useCallback(
    (key: DateFormatKey) => {
      setDate(key);
      try {
        // Not sensitive and read by the server on the next request, so a plain,
        // long-lived, same-site cookie — never httpOnly, since the point is that
        // both sides can read it.
        document.cookie = `${REGION_COOKIE}=${key}; path=/; max-age=31536000; SameSite=Lax`;
      } catch {
        // Blocked cookies: the choice still applies for this session via state.
      }
      // Re-render the server components (and SSR) that read the cookie directly.
      router.refresh();
    },
    [router],
  );

  const value = React.useMemo<RegionContext>(() => {
    const patterns = patternsFor(dateFormat);
    return {
      dateFormat,
      setDateFormat,
      formatDate: (date) => rawFormatDate(date, patterns.date),
      formatDateTime: (date) => rawFormatDateTime(date, patterns.dateTime),
    };
  }, [dateFormat, setDateFormat]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * The active date formatters. Falls back to the default format when used
 * outside a provider — so a component still renders a sensible date rather than
 * throwing, which matters because these are called in a lot of places.
 */
export function useRegion(): RegionContext {
  const ctx = React.useContext(Ctx);
  if (ctx) return ctx;
  const patterns = patternsFor(DEFAULT_DATE_FORMAT);
  return {
    dateFormat: DEFAULT_DATE_FORMAT,
    setDateFormat: () => {},
    formatDate: (date) => rawFormatDate(date, patterns.date),
    formatDateTime: (date) => rawFormatDateTime(date, patterns.dateTime),
  };
}
