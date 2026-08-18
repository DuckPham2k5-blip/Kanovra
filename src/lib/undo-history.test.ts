import { describe, expect, it } from "vitest";

import {
  COALESCE_MS,
  HISTORY_LIMIT,
  emptyHistory,
  record,
  redo,
  undo,
  type History,
} from "@/lib/undo-history";

/**
 * The undo stack.
 *
 * What these assert is the *shape of a step*, not the storage. Storing snapshots
 * is trivial; deciding that forty keystrokes are one step and that a drag is one
 * step is the whole of what makes undo feel like undo rather than like a replay
 * of every frame the pointer produced.
 */

function build(...entries: [string, string, number][]): History<string> {
  return entries.reduce(
    (history, [state, label, at]) => record(history, state, label, at),
    emptyHistory<string>(),
  );
}

describe("record", () => {
  it("keeps the state as it was before the change, not after", () => {
    // Called with what is on screen, just before it is replaced. Recorded after
    // the fact, the first undo would restore what you are already looking at.
    const history = record(emptyHistory<string>(), "before", "text:a", 0);
    expect(undo(history, "after", 10)?.state).toBe("before");
  });

  it("folds a run of same-labelled changes into one step", () => {
    // Forty keystrokes in one node: one entry, holding the text as it was when
    // the typing started.
    let history = emptyHistory<string>();
    for (let i = 0; i < 40; i += 1) {
      history = record(history, `word-${i}`, "text:a", i * 30);
    }

    expect(history.past).toHaveLength(1);
    expect(history.past[0].state).toBe("word-0");
  });

  it("starts a new step once the run has paused", () => {
    const history = build(["one", "text:a", 0], ["two", "text:a", COALESCE_MS + 1]);
    expect(history.past).toHaveLength(2);
  });

  it("starts a new step when the change is a different kind", () => {
    // Typing then dragging the same node is two steps, however fast.
    const history = build(["one", "text:a", 0], ["two", "move:a", 5]);
    expect(history.past).toHaveLength(2);
  });

  it("treats the same gesture on two different nodes as two steps", () => {
    const history = build(["one", "move:a", 0], ["two", "move:b", 5]);
    expect(history.past).toHaveLength(2);
  });

  /*
   * A continuous gesture reports every frame for as long as it lasts. Coalescing
   * on the *first* timestamp would cut a long drag into steps at 700ms; the
   * window has to move with the run, so a drag is one step however long it is.
   */
  it("keeps a long gesture as one step, however long it runs", () => {
    let history = emptyHistory<string>();
    for (let frame = 0; frame < 300; frame += 1) {
      history = record(history, `at-${frame}`, "move:a", frame * 16);
    }

    expect(history.past).toHaveLength(1);
    expect(history.past[0].state).toBe("at-0");
  });

  it("forgets the oldest steps rather than growing without end", () => {
    let history = emptyHistory<string>();
    for (let i = 0; i < HISTORY_LIMIT + 25; i += 1) {
      history = record(history, `step-${i}`, `edit-${i}`, i * 1000);
    }

    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0].state).toBe("step-25");
  });
});

describe("undo and redo", () => {
  it("walks back and forward over the same states", () => {
    const history = build(["one", "a", 0], ["two", "b", 5000]);

    const back = undo(history, "three", 6000);
    expect(back?.state).toBe("two");

    const further = undo(back!.history, back!.state, 6100);
    expect(further?.state).toBe("one");

    const forward = redo(further!.history, further!.state, 6200);
    expect(forward?.state).toBe("two");
  });

  it("answers with nothing at either end rather than throwing", () => {
    expect(undo(emptyHistory<string>(), "only", 0)).toBeNull();
    expect(redo(emptyHistory<string>(), "only", 0)).toBeNull();
  });

  /*
   * Editing after an undo drops the redo stack. Keeping it would let somebody
   * undo three steps, type, then redo into a future that no longer follows from
   * what is on screen — a state people reach by accident and cannot reason about
   * once they are in it.
   */
  it("drops the redo stack once you edit again", () => {
    const history = build(["one", "a", 0], ["two", "b", 5000]);
    const back = undo(history, "three", 6000)!;
    expect(back.history.future).toHaveLength(1);

    const edited = record(back.history, back.state, "c", 7000);
    expect(edited.future).toHaveLength(0);
    expect(redo(edited, "anything", 8000)).toBeNull();
  });

  it("returns to exactly where it started after undoing and redoing everything", () => {
    const history = build(["one", "a", 0], ["two", "b", 5000], ["three", "c", 10_000]);

    const a = undo(history, "now", 11_000)!;
    const b = undo(a.history, a.state, 11_100)!;
    const c = undo(b.history, b.state, 11_200)!;
    expect(c.state).toBe("one");

    const x = redo(c.history, c.state, 11_300)!;
    const y = redo(x.history, x.state, 11_400)!;
    const z = redo(y.history, y.state, 11_500)!;
    expect(z.state).toBe("now");
    expect(z.history.future).toHaveLength(0);
  });
});
