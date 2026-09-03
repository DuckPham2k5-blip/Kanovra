import { Priority, ProjectStatus, Role, TaskStatus } from "@prisma/client";
import { z } from "zod";

import { parseRecurrence } from "@/lib/recurrence";

/**
 * Every server action validates its input with one of these schemas, so the
 * client and the server agree on the shape without duplicating rules.
 */

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Invalid colour")
  .default("#6366f1");

const optionalDate = z.coerce.date().nullish();

// --- Workspace -------------------------------------------------------------

export const workspaceCreateSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  description: z.string().trim().max(280).optional().or(z.literal("")),
  color: hexColor,
});

export const workspaceUpdateSchema = workspaceCreateSchema.partial().extend({
  workspaceId: z.string().min(1),
});

export const inviteMemberSchema = z.object({
  workspaceId: z.string().min(1),
  email: z.string().trim().email("Invalid email address"),
  role: z.nativeEnum(Role).default(Role.MEMBER),
});

export const updateMemberRoleSchema = z.object({
  workspaceId: z.string().min(1),
  memberId: z.string().min(1),
  role: z.nativeEnum(Role),
});

// --- Project ---------------------------------------------------------------

export const projectCreateSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,6}$/, "Project key must be 2–6 uppercase letters or digits")
    .optional()
    .or(z.literal("")),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  color: hexColor,
  icon: z.string().min(1).default("Rocket"),
  status: z.nativeEnum(ProjectStatus).default(ProjectStatus.ACTIVE),
  startDate: optionalDate,
  dueDate: optionalDate,
  /**
   * Which preset to pre-fill the board with.
   *
   * A plain string rather than an enum of the ids: an unknown value falls back
   * to the blank template in `templateById`, and refusing the whole create over
   * a stale id would throw away everything else somebody had typed.
   */
  templateId: z.string().trim().max(40).optional(),
});

export const projectUpdateSchema = projectCreateSchema
  .omit({ workspaceId: true, key: true })
  .partial()
  .extend({ projectId: z.string().min(1) });

// --- Board columns ---------------------------------------------------------

export const columnCreateSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1, "Enter a column name").max(40),
  color: hexColor.default("#94a3b8"),
  status: z.nativeEnum(TaskStatus).default(TaskStatus.TODO),
  wipLimit: z.coerce.number().int().min(0).max(99).default(0),
});

export const columnUpdateSchema = columnCreateSchema
  .omit({ projectId: true })
  .partial()
  .extend({ columnId: z.string().min(1) });

export const columnReorderSchema = z.object({
  projectId: z.string().min(1),
  /** Column ids in their new left-to-right order. */
  orderedIds: z.array(z.string().min(1)).min(1),
});

// --- Task ------------------------------------------------------------------

export const taskCreateSchema = z.object({
  projectId: z.string().min(1),
  columnId: z.string().min(1).nullish(),
  parentId: z.string().min(1).nullish(),
  title: z.string().trim().min(1, "Enter a task title").max(200),
  description: z.string().trim().max(10_000).optional().or(z.literal("")),
  priority: z.nativeEnum(Priority).default(Priority.NONE),
  assigneeId: z.string().min(1).nullish(),
  startDate: optionalDate,
  dueDate: optionalDate,
  estimate: z.coerce.number().min(0).max(999).nullish(),
  labelIds: z.array(z.string().min(1)).default([]),
});

export const taskUpdateSchema = z.object({
  taskId: z.string().min(1),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(10_000).nullish(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(Priority).optional(),
  assigneeId: z.string().min(1).nullish(),
  startDate: optionalDate,
  dueDate: optionalDate,
  estimate: z.coerce.number().min(0).max(999).nullish(),
  labelIds: z.array(z.string().min(1)).optional(),
  /**
   * How often the task comes back, as `WEEKLY:2`, or null to stop repeating.
   *
   * Checked against the parser rather than accepted as text: the value is read
   * back on every completion, and a rule nothing can read is a task that silently
   * stops repeating — which looks like the feature failing rather than like a bad
   * value being refused at the moment somebody set it.
   */
  recurrence: z
    .string()
    .max(32)
    .refine((value) => parseRecurrence(value) !== null, "That is not a repeat rule")
    .nullish(),
});

/**
 * The same edit applied to many tasks at once.
 *
 * A subset of `taskUpdateSchema`, deliberately: title, description and estimate
 * are per-task facts and setting them across a selection is a mistake somebody
 * makes once. What is left is the four things a bulk selection is actually for.
 *
 * The cap is not arithmetic hygiene — each task is a separate permission check,
 * transaction, activity row and notification fan-out, so a selection of a
 * thousand is a thousand of each, arriving as one click with no progress and no
 * way to stop it.
 */
export const bulkTaskUpdateSchema = z.object({
  taskIds: z.array(z.string().min(1)).min(1).max(100),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(Priority).optional(),
  assigneeId: z.string().min(1).nullish(),
  dueDate: optionalDate,
});

/** The tasks to remove, from a selection. Same cap and the same reason. */
export const bulkTaskDeleteSchema = z.object({
  taskIds: z.array(z.string().min(1)).min(1).max(100),
});

/** Payload emitted by the Kanban board after a drag ends. */
export const taskMoveSchema = z.object({
  taskId: z.string().min(1),
  toColumnId: z.string().min(1),
  /** Index the card was dropped at, within the destination column. */
  toIndex: z.coerce.number().int().min(0),
});

export const taskDeleteSchema = z.object({ taskId: z.string().min(1) });

// --- Checklist / comments / labels ----------------------------------------

export const checklistCreateSchema = z.object({
  taskId: z.string().min(1),
  title: z.string().trim().min(1, "Enter some content").max(200),
});

export const checklistToggleSchema = z.object({
  itemId: z.string().min(1),
  done: z.boolean(),
});

export const checklistDeleteSchema = z.object({ itemId: z.string().min(1) });

export const commentCreateSchema = z.object({
  taskId: z.string().min(1),
  content: z.string().trim().min(1, "Enter a comment").max(5_000),
});

export const commentDeleteSchema = z.object({ commentId: z.string().min(1) });

export const labelCreateSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1, "Enter a label name").max(30),
  color: hexColor,
});

export const labelDeleteSchema = z.object({ labelId: z.string().min(1) });

export type WorkspaceCreateInput = z.infer<typeof workspaceCreateSchema>;
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
