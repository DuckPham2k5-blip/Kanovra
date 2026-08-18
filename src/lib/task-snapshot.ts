import { Priority, TaskStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

/**
 * A deleted task, as enough JSON to put it back.
 *
 * Deleting a task cascades to its subtasks, labels, checklist items, comments
 * and attachments. Undo therefore means recreating all of them, with their
 * original ids — a comment that comes back under a new id is a comment whose
 * links and mentions no longer point at it.
 *
 * Activities are deliberately not captured. A log records that something
 * happened, and it did; the delete writes its own line and the restore writes
 * another. Rewriting history to match a later decision is the one thing a log
 * must not do.
 *
 * Attachment *files* are never touched by a task delete — only the rows are —
 * so a restored attachment finds its bytes still on disk under the same
 * generated name.
 *
 * The shape is validated on the way back in as strictly as anything arriving
 * from a client would be, even though the server wrote it. It has been sitting
 * in a JSON column across however many deploys, and a field that has since
 * changed shape should fail loudly here rather than half-restore a task.
 */

const isoDate = z.union([z.string(), z.date()]).transform((value) => new Date(value));
const nullableDate = isoDate.nullable();

const checklistSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  done: z.boolean(),
  order: z.number(),
  createdAt: isoDate,
});

const commentSchema = z.object({
  id: z.string().min(1),
  authorId: z.string().min(1),
  content: z.string(),
  mentions: z.array(z.string()),
  createdAt: isoDate,
});

const attachmentSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  url: z.string(),
  mimeType: z.string().nullable(),
  size: z.number(),
  createdAt: isoDate,
});

const taskSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  columnId: z.string().nullable(),
  parentId: z.string().nullable(),
  number: z.number().int(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.nativeEnum(TaskStatus),
  priority: z.nativeEnum(Priority),
  order: z.number(),
  startDate: nullableDate,
  dueDate: nullableDate,
  completedAt: nullableDate,
  estimate: z.number().nullable(),
  assigneeId: z.string().nullable(),
  createdById: z.string().min(1),
  createdAt: isoDate,
  labelIds: z.array(z.string().min(1)),
  checklist: z.array(checklistSchema),
  comments: z.array(commentSchema),
  attachments: z.array(attachmentSchema),
});

/**
 * One payload holds a whole selection, so a bulk delete is one row and one undo.
 * A single delete is a batch of one — there is no second code path.
 */
export const snapshotSchema = z.object({ tasks: z.array(taskSchema).min(1) });

export type TaskSnapshot = z.infer<typeof taskSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;

/**
 * Reads a task and everything beneath it, ready to be stored.
 *
 * Descendants are gathered breadth-first and returned parents-first, which is
 * the order they have to be written back in: a subtask whose parent does not
 * exist yet violates the foreign key.
 */
export async function snapshotTasks(rootIds: string[]): Promise<Snapshot> {
  const collected: string[] = [];
  let frontier = rootIds;

  // A depth guard rather than a recursion: `parentId` is a tree in practice, and
  // a cycle in it would otherwise be an infinite read rather than a bad map.
  for (let depth = 0; depth < 50 && frontier.length; depth += 1) {
    collected.push(...frontier);
    const children = await prisma.task.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((child) => child.id).filter((id) => !collected.includes(id));
  }

  const rows = await prisma.task.findMany({
    where: { id: { in: collected } },
    include: {
      labels: { select: { labelId: true } },
      checklistItems: true,
      comments: true,
      attachments: true,
    },
  });

  // Back into the order they were collected, so parents precede their children.
  const byId = new Map(rows.map((row) => [row.id, row]));
  const tasks = collected
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => !!row)
    .map((row) => ({
      id: row.id,
      projectId: row.projectId,
      columnId: row.columnId,
      parentId: row.parentId,
      number: row.number,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      order: row.order,
      startDate: row.startDate,
      dueDate: row.dueDate,
      completedAt: row.completedAt,
      estimate: row.estimate,
      assigneeId: row.assigneeId,
      createdById: row.createdById,
      createdAt: row.createdAt,
      labelIds: row.labels.map((link) => link.labelId),
      checklist: row.checklistItems.map((item) => ({
        id: item.id,
        title: item.title,
        done: item.done,
        order: item.order,
        createdAt: item.createdAt,
      })),
      comments: row.comments.map((comment) => ({
        id: comment.id,
        authorId: comment.authorId,
        content: comment.content,
        mentions: comment.mentions,
        createdAt: comment.createdAt,
      })),
      attachments: row.attachments.map((file) => ({
        id: file.id,
        name: file.name,
        url: file.url,
        mimeType: file.mimeType,
        size: file.size,
        createdAt: file.createdAt,
      })),
    }));

  return { tasks };
}

/**
 * Writes a snapshot back, and answers with how much of it landed.
 *
 * Everything is skipped rather than failed when the thing it hangs off has gone
 * in the meantime: a label somebody deleted, a column that was removed, an
 * assignee who left the workspace. A restore is a rescue, and refusing to bring
 * a task back because one of its four labels no longer exists is the wrong
 * trade — the task is what somebody is trying to recover.
 *
 * `createMany` with `skipDuplicates` covers the case that matters most in
 * practice: pressing undo twice. The second press finds the rows already there
 * and changes nothing, rather than failing on a primary key.
 */
export async function restoreTasks(
  snapshot: Snapshot,
  projectId: string,
): Promise<{ restored: number; skipped: number }> {
  const tasks = snapshot.tasks.filter((task) => task.projectId === projectId);
  if (!tasks.length) return { restored: 0, skipped: snapshot.tasks.length };

  const [columns, labels, members] = await Promise.all([
    prisma.boardColumn.findMany({ where: { projectId }, select: { id: true } }),
    prisma.label.findMany({ select: { id: true } }),
    prisma.user.findMany({ select: { id: true } }),
  ]);
  const columnIds = new Set(columns.map((column) => column.id));
  const labelIds = new Set(labels.map((label) => label.id));
  const userIds = new Set(members.map((member) => member.id));

  const ids = new Set(tasks.map((task) => task.id));

  /*
   * Anything already back is left alone.
   *
   * Pressing undo twice is the ordinary way this happens — the toast is still on
   * screen after the first press. `createMany` takes `skipDuplicates`; a plain
   * `create` does not, so without this the second press raises a primary-key
   * violation and surfaces as "something went wrong" on an action that in fact
   * has nothing left to do.
   */
  const present = await prisma.task.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true },
  });
  const already = new Set(present.map((row) => row.id));
  const pending = tasks.filter((task) => !already.has(task.id));
  if (!pending.length) return { restored: 0, skipped: snapshot.tasks.length - tasks.length };

  await prisma.$transaction(async (tx) => {
    for (const task of pending) {
      await tx.task.create({
        data: {
          id: task.id,
          projectId: task.projectId,
          // A column that has been deleted since leaves the task off the board
          // rather than blocking the restore; the board's own fallback picks it
          // up as an unplaced card.
          columnId: task.columnId && columnIds.has(task.columnId) ? task.columnId : null,
          // Only if the parent is part of this same restore. A subtask whose
          // parent is gone comes back as a top-level task, which is visible and
          // fixable, rather than not coming back at all.
          parentId: task.parentId && ids.has(task.parentId) ? task.parentId : null,
          number: task.number,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          order: task.order,
          startDate: task.startDate,
          dueDate: task.dueDate,
          completedAt: task.completedAt,
          estimate: task.estimate,
          assigneeId: task.assigneeId && userIds.has(task.assigneeId) ? task.assigneeId : null,
          createdById: task.createdById,
          createdAt: task.createdAt,
        },
      });

      if (task.labelIds.length) {
        await tx.taskLabel.createMany({
          data: task.labelIds
            .filter((id) => labelIds.has(id))
            .map((labelId) => ({ taskId: task.id, labelId })),
          skipDuplicates: true,
        });
      }

      if (task.checklist.length) {
        await tx.checklistItem.createMany({
          data: task.checklist.map((item) => ({ ...item, taskId: task.id })),
          skipDuplicates: true,
        });
      }

      if (task.comments.length) {
        await tx.comment.createMany({
          data: task.comments
            .filter((comment) => userIds.has(comment.authorId))
            .map((comment) => ({ ...comment, taskId: task.id })),
          skipDuplicates: true,
        });
      }

      if (task.attachments.length) {
        await tx.attachment.createMany({
          data: task.attachments.map((file) => ({ ...file, taskId: task.id })),
          skipDuplicates: true,
        });
      }
    }
  });

  return { restored: pending.length, skipped: snapshot.tasks.length - tasks.length };
}
