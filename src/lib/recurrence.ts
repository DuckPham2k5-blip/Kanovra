/**
 * How often a task comes back.
 *
 * ### Why the next one is made when the last is finished
 *
 * The alternative is generating occurrences ahead of time, which needs something
 * running on a timer. PM2 runs this app in cluster mode with two workers, so a
 * `setInterval` inside it fires twice and creates every task twice — the same
 * shape as the in-process event emitter this project already replaced for that
 * reason. Making the next one at the moment the last is completed needs no
 * scheduler, cannot double-fire, and keeps exactly one occurrence open at a time.
 *
 * What it costs, said plainly: a task nobody ever completes never comes back. A
 * standup skipped for a week does not pile up seven copies — which is the right
 * answer for a task list and the wrong one for a calendar, and this is a task
 * list.
 *
 * ### Why the rule moves rather than being copied
 *
 * The finished task hands its rule to the new one. That is what stops a second
 * completion — reopen a task, tick it again — from spawning a duplicate: the old
 * row no longer carries a rule, so there is nothing to fire. It also leaves the
 * historical row reading as what it is, a finished piece of work rather than a
 * template.
 */

export const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export type Recurrence = { freq: Frequency; interval: number };

/** Beyond this a rule is a mistake rather than a plan. */
const MAX_INTERVAL = 365;

/**
 * `WEEKLY:2` — a text column rather than JSON or a pair of columns.
 *
 * Legible in a database client, one value to read and write, and a shape that
 * can grow a third part later without a migration. `parseRecurrence` is the only
 * thing that reads it, so the format never leaks into a query.
 */
export function formatRecurrence(rule: Recurrence): string {
  return `${rule.freq}:${rule.interval}`;
}

/** Never throws: an unreadable rule is a task that does not repeat. */
export function parseRecurrence(raw: string | null | undefined): Recurrence | null {
  if (!raw) return null;

  const [freq, rest] = raw.split(":");
  if (!FREQUENCIES.includes(freq as Frequency)) return null;

  const interval = Number(rest);
  if (!Number.isInteger(interval) || interval < 1 || interval > MAX_INTERVAL) return null;

  return { freq: freq as Frequency, interval };
}

/**
 * Calendar months, not thirty-day steps.
 *
 * The trap is the end of the month: 31 January plus one month has no answer, and
 * `setUTCMonth` answers 3 March — a monthly task on the 31st would walk forward
 * through the year, landing on the 3rd, then the 3rd, and never being monthly
 * again. Clamped to the last day of the target month instead, so it lands on 28
 * February and is back on the 31st in March.
 */
function addMonths(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const target = new Date(date.getTime());

  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);

  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));

  return target;
}

/** One step of the rule. Days and weeks are exact; months and years are not. */
export function advance(date: Date, rule: Recurrence): Date {
  switch (rule.freq) {
    case "DAILY":
      return new Date(date.getTime() + rule.interval * 86_400_000);
    case "WEEKLY":
      return new Date(date.getTime() + rule.interval * 7 * 86_400_000);
    case "MONTHLY":
      return addMonths(date, rule.interval);
    case "YEARLY":
      return addMonths(date, rule.interval * 12);
  }
}

/**
 * When the next occurrence is due.
 *
 * Counted from the previous **due date**, not from the moment somebody ticked the
 * box: a weekly report due each Monday stays due on Mondays even when it is
 * finished on the Wednesday. Anchoring to the completion instead would let a task
 * drift a few days later every cycle until it means nothing.
 *
 * It then keeps stepping until it lands in the future. A task three weeks
 * overdue produces *one* next occurrence, not three: catching up on a list means
 * doing the thing once, and three identical overdue rows is a mess somebody has
 * to clear by hand. The counterpart is that skipped cycles leave no trace, which
 * is the same trade as the paragraph at the top of this file.
 *
 * With no due date there is nothing to count from, so the completion is the
 * anchor — a task that repeats "every week" from whenever it was last done.
 */
export function nextDueDate(rule: Recurrence, previousDue: Date | null, completedAt: Date): Date {
  let next = advance(previousDue ?? completedAt, rule);

  // A bound rather than `while (true)`: `advance` is total and the interval is
  // capped, so this cannot spin — but a date far enough in the past would step
  // thousands of times, and answering late beats reading the database from a
  // loop nobody can see the end of.
  for (let step = 0; step < 500 && next.getTime() <= completedAt.getTime(); step += 1) {
    next = advance(next, rule);
  }

  return next;
}

/** For a badge: "Every week", "Every 3 days". */
export function describeRecurrence(rule: Recurrence): string {
  const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[rule.freq];
  return rule.interval === 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}s`;
}
