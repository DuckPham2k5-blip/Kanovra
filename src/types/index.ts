import type { Priority, Role, TaskStatus } from "@prisma/client";

/**
 * Serializable view models passed from server components into client
 * components. Declared explicitly (rather than inferred from Prisma queries)
 * so client bundles never reach into `server-only` modules.
 */

export type UserDTO = {
  id: string;
  name: string;
  email?: string | null;
  imageUrl: string | null;
};

export type MemberDTO = UserDTO & {
  role: Role;
  memberId: string;
};

export type LabelDTO = {
  id: string;
  name: string;
  color: string;
};

export type ColumnDTO = {
  id: string;
  name: string;
  color: string;
  order: number;
  wipLimit: number;
  status: TaskStatus;
};

export type TaskCardDTO = {
  id: string;
  number: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  order: number;
  columnId: string | null;
  /**
   * Which task this one belongs to, or null.
   *
   * Carried so a list can fold a subtask under its parent rather than showing it
   * as a task standing beside it. The board never nests — a column shows only
   * top-level cards — but "My tasks" collects whatever is assigned to you, and
   * that mixes the two levels together.
   */
  parentId: string | null;
  dueDate: string | null;
  startDate: string | null;
  estimate: number | null;
  completedAt: string | null;
  assignee: UserDTO | null;
  labels: LabelDTO[];
  checklistTotal: number;
  checklistDone: number;
  subtaskCount: number;
  commentCount: number;
  attachmentCount: number;
  /**
   * How many things this task is still waiting on.
   *
   * A number rather than the list, because the card shows a count and fetching
   * the titles for every card on a board to render one badge is a lot of rows
   * for a word nobody reads until they open the task. The list is on
   * `TaskDetailDTO`, where it is what somebody came to look at.
   */
  openBlockers: number;
  /** `WEEKLY:2`, or null. Read through `parseRecurrence`, never by hand. */
  recurrence: string | null;
};

export type TaskDetailDTO = TaskCardDTO & {
  projectId: string;
  projectKey: string;
  projectName: string;
  createdBy: UserDTO;
  parent: { id: string; title: string; number: number } | null;
  checklist: { id: string; title: string; done: boolean }[];
  subtasks: {
    id: string;
    number: number;
    title: string;
    status: TaskStatus;
    assignee: UserDTO | null;
    dueDate: string | null;
  }[];
  comments: {
    id: string;
    content: string;
    createdAt: string;
    author: UserDTO;
  }[];
  attachments: { id: string; name: string; url: string; size: number }[];
  /** What this task is waiting on. */
  blockedBy: DependencyLinkDTO[];
  /** What is waiting on this task. */
  blocks: DependencyLinkDTO[];
  /** Time actually spent, newest first. */
  timeEntries: TimeEntryDTO[];
};

/**
 * One stretch of work, as the panel draws it.
 *
 * `endedAt` is null while the timer runs, and the length is worked out in the
 * browser from the two timestamps — the same rule `time-tracking.ts` applies on
 * either side, so a running entry can tick without asking the server what it
 * already knows.
 */
export type TimeEntryDTO = {
  id: string;
  user: UserDTO;
  startedAt: string;
  endedAt: string | null;
  note: string | null;
};

/**
 * The other end of a dependency, as a row somebody can read and click.
 *
 * `status` travels with it because the panel greys out a blocker that is out of
 * the way, and deciding that in the browser from a status is the same rule the
 * server used to count the badge — one rule, `blockerResolved`, in both places.
 */
export type DependencyLinkDTO = {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
};

export type ProjectSummaryDTO = {
  id: string;
  name: string;
  key: string;
  color: string;
  icon: string;
  description: string | null;
  status: string;
  archived: boolean;
  dueDate: string | null;
  taskCount: number;
  doneCount: number;
  overdueCount: number;
  progress: number;
  members: UserDTO[];
};
