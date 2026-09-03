/**
 * Time actually spent on a task, as opposed to `estimate`, which is what
 * somebody guessed before starting.
 *
 * ## A duration is derived from two timestamps, never stored beside them
 *
 * The obvious shape is a `minutes` column written when a timer stops. It is two
 * sources of truth for one fact, and they drift: an entry edited later, a clock
 * correction, a bug in one write path, and the stored number disagrees with the
 * interval it claims to describe — silently, because nothing recomputes it. This
 * project has already paid for a stored value that disagreed with what the
 * column held once, and once was enough. `endedAt - startedAt` can only be wrong
 * if the timestamps are wrong, and then it is wrong in a way somebody can see.
 *
 * ## A running timer is a row, not a timer
 *
 * An entry with `endedAt` null is running, and its length is measured against
 * the clock at the moment somebody looks. Nothing ticks on the server, so there
 * is nothing for PM2's two workers to fire twice — the same reason recurring
 * tasks spawn on completion rather than on a schedule.
 *
 * ## Seconds in, minutes out
 *
 * The arithmetic is in seconds because that is what two timestamps give, and the
 * display is in hours and minutes because nobody logs work to the second. The
 * one case that needs naming is a very short entry: 40 seconds formats as "less
 * than a minute" rather than "0m", because `0m` reads as *nothing was recorded*
 * and would have people pressing stop twice.
 */

export type TimeEntryLike = {
  startedAt: Date | string;
  /** Null while the timer is still running. */
  endedAt: Date | string | null;
};

function ms(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * How long one entry covers, in seconds.
 *
 * Clamped at zero. A clock adjustment, a hand-edited row or an entry whose end
 * was typed before its start would otherwise produce a negative length, and a
 * negative entry does not merely misreport itself — it quietly subtracts from
 * everybody else's total in the same sum.
 */
export function entrySeconds(entry: TimeEntryLike, now: number): number {
  const start = ms(entry.startedAt);
  if (Number.isNaN(start)) return 0;

  const end = entry.endedAt === null ? now : ms(entry.endedAt);
  if (Number.isNaN(end)) return 0;

  return Math.max(0, Math.floor((end - start) / 1000));
}

/** Whether this entry is still running. */
export function isRunning(entry: TimeEntryLike): boolean {
  return entry.endedAt === null;
}

/** Total across entries, in seconds. */
export function totalSeconds(entries: TimeEntryLike[], now: number): number {
  return entries.reduce((sum, entry) => sum + entrySeconds(entry, now), 0);
}

/**
 * `2h 15m`, `45m`, `less than a minute`.
 *
 * Minutes are dropped once the total passes ten hours: at that size the extra
 * digits are noise, and a column of `12h` reads faster than one of `12h 03m`.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return seconds === 0 ? "—" : "less than a minute";

  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  if (hours >= 10 || minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/** Hours as a number, for comparing against `estimate`. */
export function secondsToHours(seconds: number): number {
  return Math.max(0, seconds) / 3600;
}

/**
 * Logged time against the estimate.
 *
 * `null` when there is no estimate — a bar with no ceiling is a bar measuring
 * nothing, and drawing one at 100% because logged equals logged would be a
 * confident lie. `percent` is capped at 100 so the bar cannot overflow its
 * track, while `overBy` reports the excess honestly: the cap is a drawing
 * concern and must not become the number people read.
 */
export function estimateProgress(
  loggedSeconds: number,
  estimateHours: number | null | undefined,
): { percent: number; over: boolean; overBy: number } | null {
  if (estimateHours === null || estimateHours === undefined) return null;
  if (!Number.isFinite(estimateHours) || estimateHours <= 0) return null;

  const logged = secondsToHours(loggedSeconds);
  const ratio = logged / estimateHours;

  return {
    percent: Math.min(100, Math.round(ratio * 100)),
    over: logged > estimateHours,
    overBy: Math.max(0, logged - estimateHours),
  };
}

/** The one running entry belonging to this person, if any. */
export function runningEntry<T extends TimeEntryLike & { userId: string }>(
  entries: T[],
  userId: string,
): T | null {
  return entries.find((e) => e.userId === userId && isRunning(e)) ?? null;
}
