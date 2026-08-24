/**
 * A saved view is a query string, and this is what may be in it.
 *
 * Two reasons it is filtered rather than stored as given.
 *
 * The first is that the address bar carries more than filters. `?task=<id>` opens
 * the detail panel, and saving the URL wholesale would put somebody's open task
 * into a view the whole workspace then shares — every use of it reopening a
 * stranger's panel, with no way to tell where that came from.
 *
 * The second is that a view outlives the screen that made it. Keys are copied by
 * name from a fixed list, so a param that is added, renamed or dropped later
 * cannot leave a saved view carrying something no longer read; the list clamps
 * unknown *values* on the way back in, and this clamps unknown keys on the way
 * out.
 */
export const VIEW_PARAMS = ["q", "status", "priority", "assignee", "label", "sort"] as const;

/**
 * The storable form of a filter query.
 *
 * Emitted in the order above rather than the order they were typed, so the same
 * set of filters is the same string however somebody arrived at it. Without that,
 * "you already saved this one" is unanswerable and two identical views sit in the
 * menu looking like a bug.
 *
 * An empty value is dropped, not kept as `key=`: the list treats absent as "all",
 * and a stored empty would be a filter that exists in the string and does nothing.
 */
export function viewQuery(raw: string): string {
  const input = new URLSearchParams(raw);
  const out = new URLSearchParams();

  for (const key of VIEW_PARAMS) {
    const value = input.get(key);
    if (value !== null && value.trim() !== "") out.set(key, value);
  }

  return out.toString();
}

/** How many filters a view actually applies — for a count beside its name. */
export function viewFilterCount(query: string): number {
  const params = new URLSearchParams(query);
  // `sort` is an ordering, not a narrowing. Counting it would tell somebody a
  // view hides things when all it does is put them in a different order.
  return VIEW_PARAMS.filter((key) => key !== "sort" && params.get(key)).length;
}
