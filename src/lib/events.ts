import "server-only";

import type { ActivityType, NotificationType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { publishChange, type ChangeEvent } from "@/lib/realtime";

/**
 * Activity + notification writes. Both are fire-and-forget from the caller's
 * point of view: a failure here must never roll back the user's actual change,
 * so errors are logged and swallowed.
 */

type ActivityInput = {
  workspaceId: string;
  actorId: string;
  type: ActivityType;
  message: string;
  projectId?: string | null;
  taskId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Maps an activity type onto the coarse scope sent to connected clients, so a
 * browser can ignore a change it does not currently render.
 */
function scopeForActivity(type: ActivityType): ChangeEvent["scope"] {
  const name = String(type);
  if (name.startsWith("TASK_") || name.startsWith("SUBTASK_") || name.startsWith("CHECKLIST_")) {
    return "task";
  }
  if (name.startsWith("PROJECT_")) return "project";
  if (name.startsWith("COMMENT_")) return "comment";
  if (name.startsWith("MEMBER_")) return "member";
  return "workspace";
}

export async function logActivity(input: ActivityInput) {
  try {
    await prisma.activity.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        type: input.type,
        message: input.message,
        projectId: input.projectId ?? null,
        taskId: input.taskId ?? null,
        metadata: input.metadata,
      },
    });
  } catch (error) {
    logError("activity", error, { workspaceId: input.workspaceId, type: input.type });
  }

  // Every meaningful mutation already records an activity, which makes this
  // the one place that has to know about live updates — the alternative was
  // adding a publish call to all 26 mutation sites and missing some.
  publishChange({
    workspaceId: input.workspaceId,
    scope: scopeForActivity(input.type),
    actorId: input.actorId,
  });
}

type NotifyInput = {
  userId: string;
  workspaceId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  actorId?: string | null;
};

/** Sends one notification, skipping the case where the actor is the recipient. */
export async function notify(input: NotifyInput) {
  if (input.actorId && input.actorId === input.userId) return;
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        actorId: input.actorId ?? null,
      },
    });
  } catch (error) {
    logError("notification", error, { userId: input.userId, type: input.type });
  }
}

/** Fan-out helper — de-duplicates recipients and drops the actor. */
export async function notifyMany(userIds: string[], input: Omit<NotifyInput, "userId">) {
  const unique = Array.from(new Set(userIds)).filter((id) => id !== input.actorId);
  if (unique.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: unique.map((userId) => ({
        userId,
        workspaceId: input.workspaceId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        actorId: input.actorId ?? null,
      })),
    });
  } catch (error) {
    logError("notification.fanout", error, { recipients: userIds.length });
  }
}

/**
 * Everyone who should hear about a change to a task: its assignee, its author
 * and everyone who has commented on it.
 */
export async function taskWatchers(taskId: string): Promise<string[]> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      assigneeId: true,
      createdById: true,
      comments: { select: { authorId: true }, distinct: ["authorId"] },
    },
  });
  if (!task) return [];
  return [
    ...(task.assigneeId ? [task.assigneeId] : []),
    task.createdById,
    ...task.comments.map((c) => c.authorId),
  ];
}

/** Builds the in-app deep link for a task. */
export function taskLink(workspaceSlug: string, projectId: string, taskId: string) {
  return `/w/${workspaceSlug}/projects/${projectId}/board?task=${taskId}`;
}
