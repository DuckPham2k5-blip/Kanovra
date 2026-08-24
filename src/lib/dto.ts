import "server-only";

import type { getBoardData, getTaskDetail } from "@/lib/queries";
import { blockerResolved } from "@/lib/task-dependencies";
import type { TaskCardDTO, TaskDetailDTO } from "@/types";

/**
 * Prisma rows → client-safe DTOs. Dates become ISO strings so they survive the
 * server/client boundary without React complaining about non-plain objects.
 */

type BoardTask = Awaited<ReturnType<typeof getBoardData>>["tasks"][number];
type DetailTask = NonNullable<Awaited<ReturnType<typeof getTaskDetail>>>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toTaskCardDTO(task: BoardTask): TaskCardDTO {
  return {
    id: task.id,
    number: task.number,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    order: task.order,
    columnId: task.columnId,
    dueDate: iso(task.dueDate),
    startDate: iso(task.startDate),
    estimate: task.estimate,
    completedAt: iso(task.completedAt),
    assignee: task.assignee
      ? {
          id: task.assignee.id,
          name: task.assignee.name,
          email: task.assignee.email,
          imageUrl: task.assignee.imageUrl,
        }
      : null,
    labels: task.labels.map((l) => ({
      id: l.label.id,
      name: l.label.name,
      color: l.label.color,
    })),
    parentId: task.parentId,
    checklistTotal: task.checklistItems.length,
    checklistDone: task.checklistItems.filter((c) => c.done).length,
    subtaskCount: task._count.subtasks,
    commentCount: task._count.comments,
    attachmentCount: task._count.attachments,
    openBlockers: task.blockedBy.filter((edge) => !blockerResolved(edge.blockingTask.status))
      .length,
    recurrence: task.recurrence,
  };
}

export function toTaskDetailDTO(task: DetailTask): TaskDetailDTO {
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
    dueDate: iso(task.dueDate),
    startDate: iso(task.startDate),
    estimate: task.estimate,
    completedAt: iso(task.completedAt),
    assignee: task.assignee
      ? {
          id: task.assignee.id,
          name: task.assignee.name,
          email: task.assignee.email,
          imageUrl: task.assignee.imageUrl,
        }
      : null,
    labels: task.labels.map((l) => ({
      id: l.label.id,
      name: l.label.name,
      color: l.label.color,
    })),
    checklistTotal: task.checklistItems.length,
    checklistDone: task.checklistItems.filter((c) => c.done).length,
    subtaskCount: task.subtasks.length,
    commentCount: task.comments.length,
    attachmentCount: task.attachments.length,
    openBlockers: task.blockedBy.filter((edge) => !blockerResolved(edge.blockingTask.status))
      .length,
    recurrence: task.recurrence,
    blockedBy: task.blockedBy.map((edge) => ({
      id: edge.blockingTask.id,
      number: edge.blockingTask.number,
      title: edge.blockingTask.title,
      status: edge.blockingTask.status,
    })),
    blocks: task.blocks.map((edge) => ({
      id: edge.blockedTask.id,
      number: edge.blockedTask.number,
      title: edge.blockedTask.title,
      status: edge.blockedTask.status,
    })),

    projectId: task.projectId,
    projectKey: task.project.key,
    projectName: task.project.name,
    createdBy: {
      id: task.createdBy.id,
      name: task.createdBy.name,
      email: task.createdBy.email,
      imageUrl: task.createdBy.imageUrl,
    },
    parent: task.parent
      ? { id: task.parent.id, title: task.parent.title, number: task.parent.number }
      : null,
    checklist: task.checklistItems.map((c) => ({ id: c.id, title: c.title, done: c.done })),
    subtasks: task.subtasks.map((s) => ({
      id: s.id,
      number: s.number,
      title: s.title,
      status: s.status,
      dueDate: iso(s.dueDate),
      assignee: s.assignee
        ? { id: s.assignee.id, name: s.assignee.name, imageUrl: s.assignee.imageUrl }
        : null,
    })),
    comments: task.comments.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt.toISOString(),
      author: {
        id: c.author.id,
        name: c.author.name,
        imageUrl: c.author.imageUrl,
      },
    })),
    attachments: task.attachments.map((a) => ({
      id: a.id,
      name: a.name,
      url: a.url,
      size: a.size,
    })),
  };
}
