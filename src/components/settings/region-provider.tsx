"use client";

import { enUS } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";
import { useRouter } from "next/navigation";
import * as React from "react";

import { formatDate as rawFormatDate, formatDateTime as rawFormatDateTime } from "@/lib/date";
import {
  AUTO_TIME_ZONE,
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIME_ZONE,
  REGION_COOKIE,
  patternsFor,
  serializeRegionCookie,
  type Region,
} from "@/lib/region";

/**
 * Supplies the active date-format and timezone to the whole client tree, seeded
 * from the cookie the server read at request time. Every client component that
 * shows a date calls `useRegion().formatDate` instead of importing the raw
 * helper, so one setting reaches all of them — and because the seed is the same
 * cookie the server rendered from, the first client render matches the HTML.
 *
 * An explicit timezone formats from the zone's offset, identically on the
 * server and the client. `auto` falls back to the raw formatters, which use the
 * runtime's own timezone — the app's historical behaviour, unchanged.
 */

type RegionContext = {
  region: Region;
  setRegion: (patch: Partial<Region>) => void;
  formatDate: (date: Date | string | null | undefined) => string;
  formatDateTime: (date: Date | string | null | undefined) => string;
};

const Ctx = React.createContext<RegionContext | null>(null);

function makeFormatters(region: Region) {
  const patterns = patternsFor(region.dateFormat);
  const zoned = region.timeZone !== AUTO_TIME_ZONE;
  return {
    formatDate: (date: Date | string | null | undefined) =>
      !date
        ? "—"
        : zoned
          ? formatInTimeZone(new Date(date), region.timeZone, patterns.date, { locale: enUS })
          : rawFormatDate(date, patterns.date),
    formatDateTime: (date: Date | string | null | undefined) =>
      !date
        ? "—"
        : zoned
          ? formatInTimeZone(new Date(date), region.timeZone, patterns.dateTime, { locale: enUS })
          : rawFormatDateTime(date, patterns.dateTime),
  };
}

export function RegionProvider({
  initial,
  children,
}: {
  initial: Region;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [region, setLocal] = React.useState<Region>(initial);

  // Keep in step if the server sends a different seed (e.g. after a refresh
  // following a change on another tab).
  React.useEffect(() => setLocal(initial), [initial]);

  const setRegion = React.useCallback(
    (patch: Partial<Region>) => {
      setLocal((prev) => {
        const next = { ...prev, ...patch };
        try {
          // Not sensitive and read by the server on the next request, so a
          // plain, long-lived, same-site cookie — never httpOnly, since the
          // point is that both sides can read it.
          document.cookie = `${REGION_COOKIE}=${serializeRegionCookie(next)}; path=/; max-age=31536000; SameSite=Lax`;
        } catch {
          // Blocked cookies: the choice still applies for this session via state.
        }
        return next;
      });
      // Re-render the server components (and SSR) that read the cookie directly.
      router.refresh();
    },
    [router],
  );

  const value = React.useMemo<RegionContext>(
    () => ({ region, setRegion, ...makeFormatters(region) }),
    [region, setRegion],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * The active date formatters. Falls back to the defaults when used outside a
 * provider — so a component still renders a sensible date rather than throwing,
 * which matters because these are called in a lot of places (including the
 * public share page, which has no provider).
 */
export function useRegion(): RegionContext {
  const ctx = React.useContext(Ctx);
  if (ctx) return ctx;
  const region: Region = { dateFormat: DEFAULT_DATE_FORMAT, timeZone: DEFAULT_TIME_ZONE };
  return { region, setRegion: () => {}, ...makeFormatters(region) };
}
