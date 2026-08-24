/**
 * One task waiting on another.
 *
 * An edge reads in one direction only: `{ blockedId: A, blockingId: B }` means
 * **A is blocked by B** — B has to finish before A sensibly can. Every function
 * here takes the edges as a plain list rather than reaching for the database, so
 * the rules can be tested without one; the server passes in the rows it already
 * fetched.
 *
 * The two names are deliberately not "from" and "to". A dependency is the one
 * relation where getting the direction backwards produces something that still
 * type-checks, still saves, still draws — and means the opposite. Reading
 * `blockedId` and `blockingId` at a call site says which end is which without
 * anybody having to remember a convention.
 */

export type DependencyEdge = {
  /** The task that has to wait. */
  blockedId: string;
  /** The task it is waiting on. */
  blockingId: string;
};

/**
 * What this task is waiting on, directly.
 *
 * One hop, not the whole chain: a card says "blocked by 2", and those two are
 * the ones somebody can go and look at. The transitive set is usually larger and
 * mostly not actionable — knowing that a task four links back is unfinished does
 * not tell anybody what to do next.
 */
export function blockersOf(edges: DependencyEdge[], taskId: string): string[] {
  return edges.filter((edge) => edge.blockedId === taskId).map((edge) => edge.blockingId);
}

/** What is waiting on this task, directly — the other side of the same list. */
export function blockedByThis(edges: DependencyEdge[], taskId: string): string[] {
  return edges.filter((edge) => edge.blockingId === taskId).map((edge) => edge.blockedId);
}

/**
 * Everything this task is waiting on, however far back.
 *
 * Used for the cycle check rather than for display. Carries its own `seen` set,
 * so a cycle already in the data — which this refuses to create but cannot
 * promise never to meet, since rows can be written by an older build or by hand
 * — is walked once and left, instead of hanging the request that found it.
 */
export function chainOf(edges: DependencyEdge[], taskId: string): Set<string> {
  const seen = new Set<string>();
  const queue = blockersOf(edges, taskId);

  while (queue.length) {
    const next = queue.pop() as string;
    if (seen.has(next)) continue;
    seen.add(next);
    queue.push(...blockersOf(edges, next));
  }

  return seen;
}

/**
 * Would adding this edge make a loop?
 *
 * A loop is not a wrong answer, it is an unanswerable question: every task in it
 * waits for another task in it, so none of them may start and nothing says so.
 * Refusing at the moment somebody draws the last link is the only place the
 * refusal can name what it is refusing.
 *
 * Adding "A is blocked by B" closes a loop exactly when B is already waiting on
 * A, directly or through any chain. A task blocking itself is the same statement
 * with no hops in it, and is caught by the first line rather than by the walk.
 */
export function wouldCycle(
  edges: DependencyEdge[],
  blockedId: string,
  blockingId: string,
): boolean {
  if (blockedId === blockingId) return true;
  return chainOf(edges, blockingId).has(blockedId);
}

/** Is this edge already recorded? Adding it twice is a no-op, not an error. */
export function hasEdge(
  edges: DependencyEdge[],
  blockedId: string,
  blockingId: string,
): boolean {
  return edges.some(
    (edge) => edge.blockedId === blockedId && edge.blockingId === blockingId,
  );
}

/**
 * How many of a task's blockers are still unfinished.
 *
 * `done` is passed in as a set rather than read off each task, because the
 * caller has already fetched the statuses it needs and this stays a function of
 * its arguments — which is what makes the count testable at all.
 */
export function openBlockerCount(
  edges: DependencyEdge[],
  taskId: string,
  done: ReadonlySet<string>,
): number {
  return blockersOf(edges, taskId).filter((id) => !done.has(id)).length;
}
