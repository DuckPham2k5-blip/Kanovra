/**
 * An undo stack, as arithmetic rather than as a hook.
 *
 * Kept pure and separate because the interesting part is not the storing — it is
 * *when two changes count as one*. Typing a word into a node fires a change per
 * keystroke and dragging a box fires one per frame; recorded naively, undo walks
 * back one letter and one pixel at a time, which is not undo, it is a replay.
 *
 * So a change carries a label, and a change whose label matches the one already
 * on top of the stack within `COALESCE_MS` does not push a new entry. The first
 * push in a run has already captured the state before the run began, which is
 * exactly what one press of undo should restore.
 *
 * The state is snapshotted whole rather than stored as a diff. A map is a few
 * dozen nodes; a diff would be smaller and would have to be correct, and the one
 * that is wrong is the one that silently restores a map into a shape nobody drew.
 */

export type Entry<T> = { state: T; label: string; at: number };
export type History<T> = { past: Entry<T>[]; future: Entry<T>[] };

/**
 * How long a run of same-labelled changes stays one undo step.
 *
 * Long enough to cover a continuous gesture, which reports every frame, and
 * short enough that stopping to think starts a new step. A drag paused longer
 * than this splits in two, which is a defensible place to break a step anyway.
 */
export const COALESCE_MS = 700;

/**
 * How many steps are kept. A map's snapshot is small, but "unbounded" is how a
 * long editing session turns into a tab that has to be reloaded.
 */
export const HISTORY_LIMIT = 100;

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [] };
}

/**
 * Records the state *before* a change.
 *
 * Called with what is on screen now, just before replacing it. Recording after
 * the fact would make the first undo a no-op — the top of the stack would be the
 * state you are already looking at.
 *
 * Any new change clears the redo stack. Anything else means undoing three steps,
 * making an edit, then redoing into a future that never followed from the
 * present — a shape people find their way into by accident and cannot reason
 * about afterwards.
 */
export function record<T>(history: History<T>, state: T, label: string, at: number): History<T> {
  const top = history.past[history.past.length - 1];
  if (top && top.label === label && at - top.at < COALESCE_MS) {
    // Same run: the entry already there is the state before it started. Only the
    // clock moves, so a continuous gesture keeps extending the same step.
    const past = history.past.slice(0, -1).concat({ ...top, at });
    return { past, future: [] };
  }

  const past = history.past.concat({ state, label, at });
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    future: [],
  };
}

/** Steps back, handing the current state to the redo stack. Null when there is nothing to undo. */
export function undo<T>(
  history: History<T>,
  current: T,
  at: number,
): { history: History<T>; state: T } | null {
  const top = history.past[history.past.length - 1];
  if (!top) return null;

  return {
    state: top.state,
    history: {
      past: history.past.slice(0, -1),
      future: history.future.concat({ state: current, label: top.label, at }),
    },
  };
}

/** Steps forward again. Null when nothing has been undone. */
export function redo<T>(
  history: History<T>,
  current: T,
  at: number,
): { history: History<T>; state: T } | null {
  const top = history.future[history.future.length - 1];
  if (!top) return null;

  return {
    state: top.state,
    history: {
      past: history.past.concat({ state: current, label: top.label, at }),
      future: history.future.slice(0, -1),
    },
  };
}
