import type { NotificationType } from "@prisma/client";

/**
 * Per-person notification preferences: which *kinds* of notification a person
 * wants to receive. This module is deliberately pure — the category list and
 * the type→category map, no database — so the settings UI (a client component)
 * can import it while the gating in `events.ts` (server-only) does the reads.
 *
 * A category groups several notification types under one switch the way the
 * settings screen presents them. The default for every category is **on**: an
 * absent preference row means "not chosen yet", which is opt-out, never opt-in
 * — nobody silently stops hearing about a task assigned to them.
 */

export const NOTIFICATION_CATEGORIES = [
  {
    key: "task_assigned",
    label: "Task assignments",
    description: "When a task is assigned to you.",
  },
  {
    key: "task_updates",
    label: "Task updates",
    description: "When a task you follow is completed.",
  },
  {
    key: "task_due",
    label: "Task due dates",
    description: "Reminders when a task is due soon or overdue.",
  },
  {
    key: "mentions",
    label: "Mentions & comments",
    description: "When someone @-mentions you or comments on your task.",
  },
  {
    key: "project_updates",
    label: "Project updates",
    description: "When a project you're in changes.",
  },
  {
    key: "members",
    label: "Members joining",
    description: "When someone joins a workspace you're in.",
  },
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]["key"];

/**
 * Which category gates each notification type. `null` means the type is never
 * gated — an invitation has to reach the person it invites, whatever else they
 * have muted, or they can be added to a workspace and never know.
 */
const TYPE_TO_CATEGORY: Record<NotificationType, NotificationCategory | null> = {
  TASK_ASSIGNED: "task_assigned",
  TASK_COMPLETED: "task_updates",
  TASK_DUE_SOON: "task_due",
  TASK_OVERDUE: "task_due",
  COMMENT_MENTION: "mentions",
  COMMENT_CREATED: "mentions",
  PROJECT_UPDATED: "project_updates",
  MEMBER_JOINED: "members",
  INVITATION: null,
};

export function categoryForType(type: NotificationType): NotificationCategory | null {
  return TYPE_TO_CATEGORY[type];
}

/** The set of valid category keys, for validating input from the browser. */
export const NOTIFICATION_CATEGORY_KEYS: readonly NotificationCategory[] =
  NOTIFICATION_CATEGORIES.map((c) => c.key);

export function isNotificationCategory(value: string): value is NotificationCategory {
  return (NOTIFICATION_CATEGORY_KEYS as readonly string[]).includes(value);
}
