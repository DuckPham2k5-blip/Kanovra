import { describe, expect, it } from "vitest";

import {
  CSV_BOM,
  csvCell,
  csvFilename,
  taskCsv,
  taskCsvRows,
  type ExportRow,
  type ExportTask,
} from "@/lib/task-csv";

/**
 * A real parser, not a string match.
 *
 * Asserting `csv.includes('"a,b"')` passes on a file no spreadsheet can read —
 * it only proves the substring is somewhere. Parsing the document back and
 * comparing the cell to what went in is the only check that means anything about
 * a format, and it is what caught the quoting rule being applied to the escaped
 * value rather than the raw one.
 */
function parseCsv(text: string): string[][] {
  const body = text.startsWith(CSV_BOM) ? text.slice(CSV_BOM.length) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];

    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && body[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function task(over: Partial<ExportTask> = {}): ExportTask {
  return {
    number: 20,
    title: "Thêm chế độ xem dòng thời gian",
    description: null,
    status: "IN_PROGRESS",
    priority: "HIGH",
    dueDate: "2026-09-21T00:00:00.000Z",
    startDate: null,
    estimate: null,
    completedAt: null,
    assignee: { name: "Duck Pham", email: "duck@example.com" },
    labels: [{ name: "tech-debt" }],
    checklistDone: 1,
    checklistTotal: 4,
    subtaskCount: 0,
    commentCount: 0,
    attachmentCount: 0,
    openBlockers: 0,
    recurrence: null,
    ...over,
  };
}

const row = (over: Partial<ExportTask> = {}, parentTitle: string | null = null): ExportRow => ({
  task: task(over),
  parentTitle,
});

describe("csvCell", () => {
  it("leaves an ordinary value alone", () => {
    expect(csvCell("Thêm chế độ xem")).toBe("Thêm chế độ xem");
  });

  it("quotes a value holding the separator", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
  });

  it("doubles an embedded quote", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes a value holding a newline", () => {
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("quotes edge whitespace, which a reader would otherwise trim", () => {
    expect(csvCell(" padded ")).toBe('" padded "');
  });
});

/**
 * The half that is a security control rather than a formatting rule.
 *
 * A title is typed by anybody with edit rights on the board, and a spreadsheet
 * runs a cell beginning `=`, `+`, `-` or `@` as a formula on the machine of
 * whoever opens the file.
 */
describe("csvCell defuses spreadsheet formulas", () => {
  for (const dangerous of [
    "=1+1",
    '=HYPERLINK("http://evil.test","Click")',
    "+1",
    "-1",
    "@SUM(A1)",
    "\tstarts with a tab",
    "\rstarts with a return",
  ]) {
    it(`neutralises ${JSON.stringify(dangerous.slice(0, 24))}`, () => {
      const out = csvCell(dangerous);
      // Quoted, and the first character inside the quotes is the apostrophe
      // that makes a spreadsheet treat the rest as text.
      expect(out.startsWith(`"'`)).toBe(true);
      // And it still round-trips to the original with the apostrophe in front,
      // rather than losing characters to the escaping.
      expect(parseCsv(out)[0][0]).toBe(`'${dangerous}`);
    });
  }

  it("leaves an equals sign that is not leading", () => {
    expect(csvCell("a = b")).toBe("a = b");
  });
});

describe("taskCsv", () => {
  it("starts with a byte order mark, so Excel reads it as UTF-8", () => {
    expect(taskCsv([row()])).toMatch(/^﻿/);
  });

  it("separates lines with CRLF", () => {
    const csv = taskCsv([row()]);
    expect(csv.slice(CSV_BOM.length)).toContain("\r\n");
    expect(csv).not.toMatch(/[^\r]\n/);
  });

  /**
   * The invariant, not the contents. A column added to the header and forgotten
   * in the body shifts every value one to the left from that point on, and every
   * cell after it is then quietly wrong rather than missing.
   */
  it("gives every row exactly as many cells as the header", () => {
    for (const includeProject of [false, true]) {
      const rows = parseCsv(
        taskCsv(
          [
            row(),
            row({ number: 4, title: "a,b" }, "Parent task"),
            row({ number: 9, description: "two\nlines", estimate: 3 }),
          ],
          { projectKey: "WEB", includeProject },
        ),
      );
      const width = rows[0].length;
      expect(rows).toHaveLength(4);
      for (const r of rows) expect(r).toHaveLength(width);
    }
  });

  it("round-trips a title holding a comma, a quote and a newline", () => {
    const nasty = 'a,b "quoted"\nsecond line';
    const rows = parseCsv(taskCsv([row({ title: nasty })], { projectKey: "WEB" }));
    const title = rows[0].indexOf("Title");
    expect(rows[1][title]).toBe(nasty);
  });

  it("writes the key as project key plus number", () => {
    const rows = parseCsv(taskCsv([row()], { projectKey: "WEB" }));
    expect(rows[1][0]).toBe("WEB-20");
  });

  it("falls back to the bare number when there is no project key", () => {
    const rows = parseCsv(taskCsv([row()]));
    expect(rows[1][0]).toBe("20");
  });

  it("names the parent on a subtask row", () => {
    const rows = parseCsv(taskCsv([row({}, )], { projectKey: "WEB" }));
    const parent = rows[0].indexOf("Parent");
    expect(rows[1][parent]).toBe("");

    const sub = parseCsv(taskCsv([row({ number: 4 }, "Thêm chế độ xem")], { projectKey: "WEB" }));
    expect(sub[1][parent]).toBe("Thêm chế độ xem");
  });

  /**
   * On screen an absence is an em dash. In a column it has to be nothing at all:
   * `—` sorts, it defeats a filter on blanks, and it breaks a sum.
   */
  it("writes an absent value as an empty cell, never an em dash", () => {
    const rows = parseCsv(
      taskCsv([row({ dueDate: null, estimate: null, completedAt: null, assignee: null })], {
        projectKey: "WEB",
      }),
    );
    const header = rows[0];
    for (const column of ["Due date", "Estimate (h)", "Completed", "Assignee"]) {
      expect(rows[1][header.indexOf(column)]).toBe("");
    }
    expect(rows[1]).not.toContain("—");
  });

  it("formats a date as yyyy-MM-dd", () => {
    const rows = parseCsv(taskCsv([row({ dueDate: "2026-09-21T00:00:00.000Z" })]));
    expect(rows[1][rows[0].indexOf("Due date")]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("survives an unparseable date instead of throwing", () => {
    const rows = parseCsv(taskCsv([row({ dueDate: "not a date" })]));
    expect(rows[1][rows[0].indexOf("Due date")]).toBe("");
  });

  it("joins labels with a comma inside one quoted cell", () => {
    const rows = parseCsv(
      taskCsv([row({ labels: [{ name: "tech-debt" }, { name: "feature" }] })]),
    );
    expect(rows[1][rows[0].indexOf("Labels")]).toBe("tech-debt, feature");
  });

  it("adds the project column only when asked", () => {
    expect(taskCsvRows([row()])[0]).not.toContain("Project");
    expect(taskCsvRows([row()], { includeProject: true })[0]).toContain("Project");
  });

  it("writes a header even when nothing matched the filters", () => {
    const rows = parseCsv(taskCsv([]));
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe("Key");
  });
});

describe("csvFilename", () => {
  const day = new Date("2026-09-03T10:00:00");

  it("slugs the label and stamps the date", () => {
    expect(csvFilename("Web Platform", day)).toBe("web-platform-2026-09-03.csv");
  });

  it("strips Vietnamese diacritics rather than dropping the words", () => {
    expect(csvFilename("Ứng dụng web", day)).toBe("ung-dung-web-2026-09-03.csv");
  });

  it("cannot be talked into a path", () => {
    const name = csvFilename("../../etc/passwd", day);
    expect(name).not.toContain("/");
    expect(name).not.toContain("..");
  });

  it("falls back when the label is empty or all punctuation", () => {
    expect(csvFilename(null, day)).toBe("tasks-2026-09-03.csv");
    expect(csvFilename("!!!", day)).toBe("tasks-2026-09-03.csv");
  });
});
