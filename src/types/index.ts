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
