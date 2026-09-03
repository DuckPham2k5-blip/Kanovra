import { Priority, TaskStatus } from "@prisma/client";

import { DEFAULT_COLUMNS } from "@/lib/constants";

/**
 * What a new project can be pre-filled with.
 *
 * ## Why the shape is columns, labels and tasks — and nothing else
 *
 * A project also carries a colour, an icon, a banner and dates, and none of
 * those belong in a template: they are what makes one project distinguishable
 * from the next in a sidebar of twelve. A template answers "how does this kind
 * of work move", which is the board, and "what do we mark it with", which is the
 * labels. Copying the decoration too would produce a workspace where every
 * project looks the same, which is the opposite of useful.
 *
 * ## Labels belong to the workspace, not the project
 *
 * `Label` is keyed `@@unique([workspaceId, name])`. A template that created its
 * labels outright would work once and then fail on the second project that used
 * it, with a unique-constraint error at the end of a create that had already
 * written the project. They are upserted by name instead, so a second project
 * adopts the label the first one made rather than colliding with it — and a
 * template never renames or recolours a label that already exists, because the
 * workspace's own choice outranks a preset's.
 *
 * ## Every template must be able to finish a task
 *
 * Completing a task moves its card to the column whose status matches, so a
 * template with no `DONE` column produces a board where finishing something
 * sends the card nowhere. That is an invariant with a test rather than a
 * convention, because the failure appears days later, on somebody else's board,
 * as a card that simply vanished from view.
 */

export type TemplateColumn = {
  name: string;
  color: string;
  status: TaskStatus;
  wipLimit: number;
};

export type TemplateTask = {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  /** Names, which must appear in the template's own `labels`. */
  labels?: string[];
};

export type ProjectTemplate = {
  id: string;
  name: string;
  /** One line, shown under the name in the picker. */
  description: string;
  columns: TemplateColumn[];
  labels: { name: string; color: string }[];
  tasks: TemplateTask[];
};

/** The id used when nobody chooses, and the one that changes nothing. */
export const BLANK_TEMPLATE_ID = "blank";

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: BLANK_TEMPLATE_ID,
    name: "Blank project",
    description: "The five standard columns, nothing else.",
    // Spread rather than restated: this is what every project has always been
    // created with, and a second copy would drift the day one of them changed.
    columns: [...DEFAULT_COLUMNS],
    labels: [],
    tasks: [],
  },
  {
    id: "software",
    name: "Software delivery",
    description: "Standard board, engineering labels, and the first few chores.",
    columns: [...DEFAULT_COLUMNS],
    labels: [
      { name: "bug", color: "#ef4444" },
      { name: "feature", color: "#6366f1" },
      { name: "tech-debt", color: "#a855f7" },
      { name: "docs", color: "#0ea5e9" },
    ],
    tasks: [
      {
        title: "Set up the repository and CI",
        description: "Branch protection, the test command, and a green first run.",
        status: TaskStatus.TODO,
        priority: Priority.HIGH,
        labels: ["tech-debt"],
      },
      {
        title: "Write the README",
        description: "How to run it, how to test it, and what breaks if you skip a step.",
        status: TaskStatus.TODO,
        priority: Priority.MEDIUM,
        labels: ["docs"],
      },
      {
        title: "Agree the definition of done",
        status: TaskStatus.BACKLOG,
        priority: Priority.MEDIUM,
      },
    ],
  },
  {
    id: "content",
    name: "Content calendar",
    description: "Ideas through to published, with a slot for scheduling.",
    columns: [
      { name: "Ideas", color: "#94a3b8", status: TaskStatus.BACKLOG, wipLimit: 0 },
      { name: "Drafting", color: "#6366f1", status: TaskStatus.IN_PROGRESS, wipLimit: 3 },
      { name: "Editing", color: "#f59e0b", status: TaskStatus.IN_REVIEW, wipLimit: 3 },
      { name: "Scheduled", color: "#0ea5e9", status: TaskStatus.TODO, wipLimit: 0 },
      { name: "Published", color: "#10b981", status: TaskStatus.DONE, wipLimit: 0 },
    ],
    labels: [
      { name: "blog", color: "#6366f1" },
      { name: "social", color: "#ec4899" },
      { name: "newsletter", color: "#f59e0b" },
    ],
    tasks: [
      {
        title: "Plan next month's themes",
        status: TaskStatus.BACKLOG,
        priority: Priority.MEDIUM,
      },
    ],
  },
  {
    id: "bugs",
    name: "Bug tracker",
    description: "Reported to closed, with verification kept separate from fixing.",
    columns: [
      { name: "Reported", color: "#94a3b8", status: TaskStatus.BACKLOG, wipLimit: 0 },
      { name: "Triaged", color: "#64748b", status: TaskStatus.TODO, wipLimit: 0 },
      { name: "Fixing", color: "#6366f1", status: TaskStatus.IN_PROGRESS, wipLimit: 4 },
      { name: "Verifying", color: "#f59e0b", status: TaskStatus.IN_REVIEW, wipLimit: 4 },
      { name: "Closed", color: "#10b981", status: TaskStatus.DONE, wipLimit: 0 },
      // A bug that turns out not to be one has somewhere to go, or it sits in
      // Reported for ever and the column stops meaning anything.
      { name: "Not a bug", color: "#78716c", status: TaskStatus.CANCELLED, wipLimit: 0 },
    ],
    labels: [
      { name: "crash", color: "#ef4444" },
      { name: "regression", color: "#f97316" },
      { name: "cosmetic", color: "#a855f7" },
    ],
    tasks: [],
  },
  {
    id: "launch",
    name: "Launch plan",
    description: "One board from planning to shipped, for a dated piece of work.",
    columns: [
      { name: "Planning", color: "#94a3b8", status: TaskStatus.BACKLOG, wipLimit: 0 },
      { name: "Ready", color: "#64748b", status: TaskStatus.TODO, wipLimit: 0 },
      { name: "Building", color: "#6366f1", status: TaskStatus.IN_PROGRESS, wipLimit: 5 },
      { name: "Sign-off", color: "#f59e0b", status: TaskStatus.IN_REVIEW, wipLimit: 3 },
      { name: "Launched", color: "#10b981", status: TaskStatus.DONE, wipLimit: 0 },
    ],
    labels: [
      { name: "must-have", color: "#ef4444" },
      { name: "nice-to-have", color: "#0ea5e9" },
    ],
    tasks: [
      {
        title: "Write the launch checklist",
        status: TaskStatus.TODO,
        priority: Priority.HIGH,
        labels: ["must-have"],
      },
      {
        title: "Decide what is not shipping",
        description: "The list of things explicitly left out, so nobody re-opens it later.",
        status: TaskStatus.BACKLOG,
        priority: Priority.MEDIUM,
        labels: ["nice-to-have"],
      },
    ],
  },
];

/**
 * The template with this id, or the blank one.
 *
 * Never throws: the id arrives from a browser, and an unknown value should cost
 * the preset rather than the project somebody was in the middle of creating.
 */
export function templateById(id: string | null | undefined): ProjectTemplate {
  return (
    PROJECT_TEMPLATES.find((t) => t.id === id) ??
    PROJECT_TEMPLATES.find((t) => t.id === BLANK_TEMPLATE_ID)!
  );
}

/**
 * Which column a starter task belongs in.
 *
 * By status rather than by position, so reordering a template's columns cannot
 * silently move its tasks somewhere else.
 */
export function columnIndexForStatus(template: ProjectTemplate, status: TaskStatus): number {
  const index = template.columns.findIndex((c) => c.status === status);
  // Guarded by a test, so this fallback should be unreachable; it exists so a
  // template edited in a hurry cannot leave a task with no column at all.
  return index === -1 ? 0 : index;
}
