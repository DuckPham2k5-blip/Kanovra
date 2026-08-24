import { TaskStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  blockedByThis,
  blockerResolved,
  RESOLVED_BLOCKER_STATUSES,
  blockersOf,
  chainOf,
  hasEdge,
  openBlockerCount,
  wouldCycle,
  type DependencyEdge,
} from "@/lib/task-dependencies";

/**
 * The direction is the whole risk here.
 *
 * "A is blocked by B" and "A blocks B" are the same row with its ends swapped,
 * both type-check, both save, and both draw — so a mistake shows up as a board
 * that quietly says the opposite of what somebody meant. Every test below names
 * the relation in words first and then asserts it, so a future edit that flips a
 * field has to flip the English too.
 */

/** A waits on B; B waits on C. So C is the only one that can start. */
const chain: DependencyEdge[] = [
  { blockedId: "A", blockingId: "B" },
  { blockedId: "B", blockingId: "C" },
];

describe("reading the relation", () => {
  it("says A is waiting on B, and not the other way round", () => {
    expect(blockersOf(chain, "A")).toEqual(["B"]);
    expect(blockersOf(chain, "B")).toEqual(["C"]);
    expect(blockersOf(chain, "C")).toEqual([]);
  });

  it("says B is what A is waiting on, from the other end", () => {
    expect(blockedByThis(chain, "B")).toEqual(["A"]);
    expect(blockedByThis(chain, "C")).toEqual(["B"]);
    expect(blockedByThis(chain, "A")).toEqual([]);
  });

  it("reports only the direct blockers, not the whole chain", () => {
    // A waits on B, and B waits on C — but what somebody can go and look at is B.
    expect(blockersOf(chain, "A")).toEqual(["B"]);
    expect(chainOf(chain, "A")).toEqual(new Set(["B", "C"]));
  });
});

describe("wouldCycle", () => {
  it("refuses a task that waits on itself", () => {
    expect(wouldCycle([], "A", "A")).toBe(true);
  });

  it("refuses the link that closes a loop", () => {
    // A waits on B, B waits on C. Making C wait on A closes it.
    expect(wouldCycle(chain, "C", "A")).toBe(true);
  });

  it("refuses a two-task loop", () => {
    expect(wouldCycle([{ blockedId: "A", blockingId: "B" }], "B", "A")).toBe(true);
  });

  it("allows a second task to wait on the same blocker", () => {
    // Two things can wait on one thing. That is a fan, not a loop.
    expect(wouldCycle(chain, "D", "C")).toBe(false);
  });

  it("allows a diamond", () => {
    // D waits on B and on C, both of which wait on E. Nothing waits on D.
    const diamond: DependencyEdge[] = [
      { blockedId: "B", blockingId: "E" },
      { blockedId: "C", blockingId: "E" },
      { blockedId: "D", blockingId: "B" },
    ];
    expect(wouldCycle(diamond, "D", "C")).toBe(false);
  });

  /*
   * This build refuses to create a loop; it cannot promise never to meet one.
   * Rows can arrive from an older build, from a restore, or from somebody's SQL.
   * A walk that trusts the absence of loops hangs the request that finds one.
   */
  it("terminates on a loop that is already in the data", () => {
    const looped: DependencyEdge[] = [
      { blockedId: "A", blockingId: "B" },
      { blockedId: "B", blockingId: "A" },
    ];
    expect(chainOf(looped, "A")).toEqual(new Set(["A", "B"]));
    expect(wouldCycle(looped, "A", "B")).toBe(true);
  });
});

describe("hasEdge", () => {
  it("knows the pair it was given, and not its mirror", () => {
    expect(hasEdge(chain, "A", "B")).toBe(true);
    expect(hasEdge(chain, "B", "A")).toBe(false);
  });
});

describe("openBlockerCount", () => {
  it("counts only the blockers still unfinished", () => {
    const edges: DependencyEdge[] = [
      { blockedId: "A", blockingId: "B" },
      { blockedId: "A", blockingId: "C" },
    ];

    expect(openBlockerCount(edges, "A", new Set())).toBe(2);
    expect(openBlockerCount(edges, "A", new Set(["B"]))).toBe(1);
    expect(openBlockerCount(edges, "A", new Set(["B", "C"]))).toBe(0);
  });

  it("does not count a blocker further back down the chain", () => {
    // B is done, so A is free to move — even though C, which B waited on, is not.
    expect(openBlockerCount(chain, "A", new Set(["B"]))).toBe(0);
  });
});

describe("blockerResolved", () => {
  it("treats a finished blocker as out of the way", () => {
    expect(blockerResolved(TaskStatus.DONE)).toBe(true);
  });

  /*
   * The one worth pinning. A cancelled task is never going to finish, so
   * counting it leaves whatever waits on it marked blocked forever by something
   * nobody intends to do — and makes people delete the link to get moving, which
   * loses the record of why it was there.
   */
  it("treats a cancelled blocker as out of the way too", () => {
    expect(blockerResolved(TaskStatus.CANCELLED)).toBe(true);
  });

  it("counts every other state as still in the way", () => {
    for (const status of [
      TaskStatus.BACKLOG,
      TaskStatus.TODO,
      TaskStatus.IN_PROGRESS,
      TaskStatus.IN_REVIEW,
    ]) {
      expect(blockerResolved(status)).toBe(false);
    }
  });
});

/*
 * The predicate is read by the browser; the list is read by a `notIn` in a
 * query. Written out separately they drift, and the drift looks like a badge
 * that disagrees with the panel it opens — so this walks every status the enum
 * has and asserts the two answer alike, rather than checking the two entries
 * anybody can already see.
 */
describe("the two shapes of the same rule", () => {
  it("agree on every status the enum has", () => {
    for (const status of Object.values(TaskStatus)) {
      expect(blockerResolved(status)).toBe(RESOLVED_BLOCKER_STATUSES.includes(status));
    }
  });

  it("covers every status, so a new one cannot be forgotten silently", () => {
    // Not an assertion about the count: it fails loudly when somebody adds a
    // status, which is the moment to decide whether it blocks or not.
    expect(Object.values(TaskStatus)).toHaveLength(6);
  });
});
