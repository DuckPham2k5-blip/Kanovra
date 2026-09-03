import { format } from "date-fns";

import { PRIORITY_META, TASK_STATUS_META } from "@/lib/constants";
import { formatRecurrence, parseRecurrence } from "@/lib/recurrence";
import type { Priority, TaskStatus } from "@prisma/client";

/**
 * Turning the list somebody is looking at into a CSV file.
 *
 * ## Why this is built in the browser
 *
 * The filter, the sort and the fold all live in `task-list.tsx` as client state
 * over a payload the page already holds. A server route taking the same query
 * string would be a *second* implementation of that logic, and the two would
 * drift the first time a filter was added — which is the whole reason
 * `applyTaskUpdate` exists rather than a parallel bulk path.
 *
 * It also settles the security question by removing it. The file is made from
 * rows already rendered on the page, so there is no new read path, nothing new
 * to authorise, and no way for the export to contain a task its reader could not
 * already see. A `/api/export` handler would have had to re-check membership,
 * project access and `task:view`, and would have been one forgotten check away
 * from handing over somebody else's board.
 *
 * ## What ends up in the file
 *
 * The drawn rows, in the drawn order — but subtasks are included *even when
 * their parent's fold is shut*. A fold is a convenience for a screen of fixed
 * height and a file has no height; a row silently missing from an exported file
 * is the worst kind of wrong, because nobody notices. They carry a `Parent`
 * column so they can never be read as tasks standing beside their parent.
 *
 * This is why the caller reports two numbers rather than one. The toolbar's
 * fraction deliberately counts top-level rows only — a subtask is part of its
 * parent, not another item beside it — so "13 tasks and 7 subtasks" agrees both
 * with the screen and with the number of lines in the file. One number could not
 * do both, and a count that disagrees with the interface tells a different story
 * from it.
 */

/** Only the fields the file names. Structural, so `ListTask` satisfies it. */
export type ExportTask = {
  number: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  startDate: string | null;
  estimate: number | null;
  completedAt: string | null;
  /** `email` is optional on `UserDTO` and may be null; the column tolerates both. */
  assignee: { name: string; email?: string | null } | null;
  labels: { name: string }[];
  checklistDone: number;
  checklistTotal: number;
  subtaskCount: number;
  commentCount: number;
  attachmentCount: number;
  openBlockers: number;
  recurrence: string | null;
  project?: { key: string; name: string } | null;
};

export type ExportRow = {
  task: ExportTask;
  /** The parent's title when this row is a subtask, else null. */
  parentTitle: string | null;
};

/**
 * Excel on Windows reads a UTF-8 file without a byte order mark as the system
 * ANSI codepage. This project's tasks are written in Vietnamese, so that is not
 * a stray accent — it is every title turned to mojibake, in the one column
 * anybody reads.
 */
export const CSV_BOM = String.fromCharCode(0xfeff);

/** RFC 4180 says CRLF, and Excel is happiest with it. */
const EOL = "\r\n";

/**
 * A cell, escaped for CSV and defused for spreadsheets.
 *
 * The quoting half is ordinary. The other half is that Excel, LibreOffice and
 * Google Sheets all treat a cell beginning `=`, `+`, `-` or `@` as a *formula* —
 * so a task titled `=HYPERLINK("http://…","Click")` becomes a live link in
 * whoever opens the file, and `@` can reach DDE on older Excel. Task titles are
 * typed by anybody with edit rights on the board, which makes this an injection
 * with a very short path: they type it, a teammate exports, the teammate's
 * machine runs it.
 *
 * The fix is the standard one — a leading apostrophe, which spreadsheets eat and
 * treat the rest as text. Tab and carriage return are on the list because they
 * can carry the cursor into a neighbouring cell before the parse settles.
 */
export function csvCell(value: string): string {
  let out = value;

  if (/^[=+\-@\t\r]/.test(out)) out = `'${out}`;

  // Quote when the value could not survive bare: separators, quotes, newlines,
  // or edge whitespace a reader would otherwise trim.
  if (/[",\r\n]/.test(out) || out !== out.trim() || out.startsWith("'")) {
    out = `"${out.replace(/"/g, '""')}"`;
  }
  return out;
}

/** Rows of already-stringified values into one CSV document. */
export function csvDocument(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join(EOL) + EOL;
}

/** `yyyy-MM-dd`, sortable and locale-free; empty for absent. */
function day(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : format(date, "yyyy-MM-dd");
}

function minute(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : format(date, "yyyy-MM-dd HH:mm");
}

/**
 * An absent value is an empty cell, never the em dash the screen draws.
 *
 * On screen `—` means "nothing here". In a spreadsheet column it is a *value*:
 * it sorts, it breaks a filter on blanks, and `=SUM` over it fails. The screen
 * and the file want opposite things from the same absence.
 */
export function taskCsvRows(
  rows: ExportRow[],
  options: { projectKey?: string | null; includeProject?: boolean } = {},
): string[][] {
  const { projectKey, includeProject } = options;

  const header = [
    "Key",
    ...(includeProject ? ["Project"] : []),
    "Title",
    "Parent",
    "Status",
    "Priority",
    "Assignee",
    "Assignee email",
    "Labels",
    "Due date",
    "Start date",
    "Estimate (h)",
    "Checklist",
    "Subtasks",
    "Comments",
    "Attachments",
    "Blocked by",
    "Repeats",
    "Completed",
    "Description",
  ];

  const body = rows.map(({ task, parentTitle }) => {
    const key = task.project?.key ?? projectKey;
    const rule = parseRecurrence(task.recurrence);

    return [
      key ? `${key}-${task.number}` : String(task.number),
      ...(includeProject ? [task.project?.name ?? ""] : []),
      task.title,
      parentTitle ?? "",
      TASK_STATUS_META[task.status].label,
      PRIORITY_META[task.priority].label,
      task.assignee?.name ?? "",
      task.assignee?.email ?? "",
      task.labels.map((l) => l.name).join(", "),
      day(task.dueDate),
      day(task.startDate),
      task.estimate === null ? "" : String(task.estimate),
      task.checklistTotal === 0 ? "" : `${task.checklistDone}/${task.checklistTotal}`,
      task.subtaskCount === 0 ? "" : String(task.subtaskCount),
      task.commentCount === 0 ? "" : String(task.commentCount),
      task.attachmentCount === 0 ? "" : String(task.attachmentCount),
      task.openBlockers === 0 ? "" : String(task.openBlockers),
      rule ? formatRecurrence(rule) : "",
      minute(task.completedAt),
      task.description ?? "",
    ];
  });

  return [header, ...body];
}

/** The whole file, byte order mark included. */
export function taskCsv(
  rows: ExportRow[],
  options: { projectKey?: string | null; includeProject?: boolean } = {},
): string {
  return CSV_BOM + csvDocument(taskCsvRows(rows, options));
}

/**
 * `web-platform-2026-09-03.csv`.
 *
 * Sanitised rather than trusted: a project can be named anything, and the name
 * reaches a filesystem. Anything outside a-z, 0-9 and a dash collapses to a
 * dash, so a project called `../../etc` cannot say where the file goes.
 */
export function csvFilename(label: string | null | undefined, today: Date): string {
  const slug = (label ?? "tasks")
    .toLowerCase()
    .normalize("NFD")
    // `\p{M}` is every combining mark, written as ASCII on purpose: the literal
    // range U+0300-U+036F is invisible in an editor and does not survive being
    // copied through tools that normalise text.
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${slug || "tasks"}-${format(today, "yyyy-MM-dd")}.csv`;
}
