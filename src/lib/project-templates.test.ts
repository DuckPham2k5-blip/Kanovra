import { TaskStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { DEFAULT_COLUMNS } from "@/lib/constants";
import {
  BLANK_TEMPLATE_ID,
  PROJECT_TEMPLATES,
  columnIndexForStatus,
  templateById,
} from "@/lib/project-templates";

describe("the template list", () => {
  it("has unique ids", () => {
    const ids = PROJECT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names and describes every one", () => {
    for (const t of PROJECT_TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.columns.length).toBeGreaterThan(0);
    }
  });

  /**
   * The invariant that matters most.
   *
   * Completing a task moves its card to the column whose status matches. A
   * template with no DONE column makes a board where finishing something sends
   * the card nowhere — and the failure shows up days later, on somebody else's
   * board, as a card that vanished.
   */
  it("gives every template somewhere for a finished task to go", () => {
    for (const t of PROJECT_TEMPLATES) {
      expect(
        t.columns.some((c) => c.status === TaskStatus.DONE),
        `${t.id} has no DONE column`,
      ).toBe(true);
    }
  });

  it("gives every starter task a column that can hold it", () => {
    for (const t of PROJECT_TEMPLATES) {
      for (const task of t.tasks) {
        expect(
          t.columns.some((c) => c.status === task.status),
          `${t.id}: "${task.title}" has status ${task.status} and no column takes it`,
        ).toBe(true);
      }
    }
  });

  /** A starter task carrying a label the template never creates would silently
   *  lose the label, since the action can only attach what it made. */
  it("only puts labels on tasks that the template itself defines", () => {
    for (const t of PROJECT_TEMPLATES) {
      const known = new Set(t.labels.map((l) => l.name));
      for (const task of t.tasks) {
        for (const label of task.labels ?? []) {
          expect(known.has(label), `${t.id}: "${task.title}" wants unknown label ${label}`).toBe(
            true,
          );
        }
      }
    }
  });

  it("has no duplicate label names or column names inside one template", () => {
    for (const t of PROJECT_TEMPLATES) {
      const labels = t.labels.map((l) => l.name);
      expect(new Set(labels).size, `${t.id} repeats a label`).toBe(labels.length);
      const columns = t.columns.map((c) => c.name);
      expect(new Set(columns).size, `${t.id} repeats a column name`).toBe(columns.length);
    }
  });

  it("writes every colour as a plain hex triple", () => {
    for (const t of PROJECT_TEMPLATES) {
      for (const c of [...t.columns.map((x) => x.color), ...t.labels.map((x) => x.color)]) {
        expect(c).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it("keeps WIP limits inside the range the column form accepts", () => {
    for (const t of PROJECT_TEMPLATES) {
      for (const c of t.columns) {
        expect(Number.isInteger(c.wipLimit)).toBe(true);
        expect(c.wipLimit).toBeGreaterThanOrEqual(0);
        expect(c.wipLimit).toBeLessThanOrEqual(99);
      }
    }
  });
});

describe("the blank template", () => {
  /**
   * Choosing nothing has to produce exactly what creating a project produced
   * before templates existed, or this feature quietly changed every project.
   */
  it("is the board every project has always been created with", () => {
    const blank = templateById(BLANK_TEMPLATE_ID);
    expect(blank.columns).toEqual([...DEFAULT_COLUMNS]);
    expect(blank.labels).toEqual([]);
    expect(blank.tasks).toEqual([]);
  });
});

describe("templateById", () => {
  it("finds a template by id", () => {
    expect(templateById("bugs").id).toBe("bugs");
  });

  /** The id comes from a browser; an unknown one should cost the preset, not
   *  the project somebody was creating. */
  it("falls back to blank rather than throwing", () => {
    for (const bad of ["nope", "", null, undefined, "../../etc"]) {
      expect(templateById(bad).id).toBe(BLANK_TEMPLATE_ID);
    }
  });
});

describe("columnIndexForStatus", () => {
  it("matches on status rather than position", () => {
    const bugs = templateById("bugs");
    expect(bugs.columns[columnIndexForStatus(bugs, TaskStatus.DONE)].name).toBe("Closed");
    expect(bugs.columns[columnIndexForStatus(bugs, TaskStatus.CANCELLED)].name).toBe("Not a bug");
  });

  it("falls back to the first column for a status nothing covers", () => {
    const content = templateById("content");
    // `content` has no CANCELLED column, and the fallback must be a real index
    // rather than -1, which would put the task in no column at all.
    expect(columnIndexForStatus(content, TaskStatus.CANCELLED)).toBe(0);
  });
});
