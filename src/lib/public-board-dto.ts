import type { ColumnDTO, TaskCardDTO } from "@/types";

/**
 * What a stranger is allowed to see.
 *
 * Everything else in this application answers a request from somebody with an
 * account and a role. This is the one path that answers a request from nobody
 * at all, so the narrowing is written out here as its own step rather than left
 * implicit in a `select` — a `select` is edited by whoever is adding a field to
 * the board, and this is not.
 *
 * ## It is an allowlist, and that is the whole point
 *
 * The obvious version deletes the fields that should not travel — strip the
 * email, ship the rest. That fails *open*: the next field added to
 * `TaskCardDTO` reaches the public page the day it is added, silently, and
 * nobody reviewing that change is thinking about a board on the open internet.
 *
 * Naming what may travel fails the other way. A new field is simply absent from
 * the public board until somebody decides it belongs there, and an absence is
 * visible on screen. A leak is not.
 */

export type PublicProjectDTO = {
  name: string;
  key: string;
  description: string | null;
  color: string;
  icon: string;
};

export type PublicBoardDTO = {
  project: PublicProjectDTO;
  columns: ColumnDTO[];
  tasks: TaskCardDTO[];
  /** ISO, or null when the link has no end. Shown so a visitor knows. */
  expiresAt: string | null;
};

/**
 * One card, narrowed.
 *
 * The return type is still `TaskCardDTO` so the public board can render the
 * very same card component members see — the alternative is a second card,
 * which would drift into looking like a different product within a month.
 *
 * `assignee.email` is the field this function exists for. A board shows who is
 * working on what, and a name is what that means; an address book of everyone
 * in the workspace is a different thing to hand out, and it is the sort of
 * thing that ends up in a scraper long before anybody notices.
 *
 * `assignee.id` does travel, because the avatar takes its colour from it and a
 * board where four people share a grey circle is unreadable. It is a cuid that
 * unlocks nothing: every route that would accept a user id asks for a session
 * first.
 */
export function publicTaskCard(task: TaskCardDTO): TaskCardDTO {
  return {
    id: task.id,
    number: task.number,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    order: task.order,
    columnId: task.columnId,
    parentId: task.parentId,
    dueDate: task.dueDate,
    startDate: task.startDate,
    estimate: task.estimate,
    completedAt: task.completedAt,
    assignee: task.assignee
      ? {
          id: task.assignee.id,
          name: task.assignee.name,
          imageUrl: task.assignee.imageUrl,
        }
      : null,
    labels: task.labels.map((l) => ({ id: l.id, name: l.name, color: l.color })),
    checklistTotal: task.checklistTotal,
    checklistDone: task.checklistDone,
    subtaskCount: task.subtaskCount,
    commentCount: task.commentCount,
    attachmentCount: task.attachmentCount,
    openBlockers: task.openBlockers,
    recurrence: task.recurrence,
  };
}

export function publicColumn(column: ColumnDTO): ColumnDTO {
  return {
    id: column.id,
    name: column.name,
    color: column.color,
    order: column.order,
    wipLimit: column.wipLimit,
    status: column.status,
  };
}

export function publicProject(project: {
  name: string;
  key: string;
  description: string | null;
  color: string;
  icon: string;
}): PublicProjectDTO {
  return {
    name: project.name,
    key: project.key,
    description: project.description,
    color: project.color,
    icon: project.icon,
  };
}
