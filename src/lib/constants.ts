import { NotificationType, Priority, ProjectStatus, TaskStatus } from "@prisma/client";

export const APP_NAME = "Kanovra";
export const APP_TAGLINE = "Plan · Track · Collaborate · Deliver";
export const APP_DESCRIPTION =
  "Team task management built for focus: drag-and-drop Kanban, dashboards, analytics and calendar — in one place.";

/** Statuses that count a task as finished for reporting and progress bars. */
export const DONE_STATUSES: TaskStatus[] = [TaskStatus.DONE];

/**
 * Presentation metadata for the domain enums. Kept in one place so the board,
 * list, calendar, analytics and notification surfaces stay visually consistent.
 * `color` values are raw hex (used for dots/charts); `className` carries the
 * Tailwind pair used for badges in both themes.
 */

export const TASK_STATUS_META: Record<
  TaskStatus,
  { label: string; color: string; className: string }
> = {
  BACKLOG: {
    label: "Backlog",
    color: "#94a3b8",
    className: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  },
  TODO: {
    label: "To do",
    color: "#64748b",
    className: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  },
  IN_PROGRESS: {
    label: "In progress",
    color: "#6366f1",
    className: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
  },
  IN_REVIEW: {
    label: "In review",
    color: "#f59e0b",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  },
  DONE: {
    label: "Done",
    color: "#10b981",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  },
  CANCELLED: {
    label: "Cancelled",
    color: "#ef4444",
    className: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
  },
};

export const TASK_STATUS_ORDER: TaskStatus[] = [
  TaskStatus.BACKLOG,
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.IN_REVIEW,
  TaskStatus.DONE,
  TaskStatus.CANCELLED,
];

export const PRIORITY_META: Record<
  Priority,
  { label: string; color: string; className: string; rank: number }
> = {
  URGENT: {
    label: "Urgent",
    color: "#ef4444",
    className: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
    rank: 4,
  },
  HIGH: {
    label: "High",
    color: "#f97316",
    className: "bg-orange-500/10 text-orange-600 dark:text-orange-300",
    rank: 3,
  },
  MEDIUM: {
    label: "Medium",
    color: "#f59e0b",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
    rank: 2,
  },
  LOW: {
    label: "Low",
    color: "#0ea5e9",
    className: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
    rank: 1,
  },
  NONE: {
    label: "None",
    color: "#94a3b8",
    className: "bg-muted text-muted-foreground",
    rank: 0,
  },
};

export const PRIORITY_ORDER: Priority[] = [
  Priority.URGENT,
  Priority.HIGH,
  Priority.MEDIUM,
  Priority.LOW,
  Priority.NONE,
];

export const PROJECT_STATUS_META: Record<
  ProjectStatus,
  { label: string; className: string; color: string }
> = {
  PLANNING: {
    label: "Planning",
    className: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
    color: "#8b5cf6",
  },
  ACTIVE: {
    label: "Active",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    color: "#10b981",
  },
  ON_HOLD: {
    label: "On hold",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
    color: "#f59e0b",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
    color: "#0ea5e9",
  },
  ARCHIVED: {
    label: "Archived",
    className: "bg-muted text-muted-foreground",
    color: "#94a3b8",
  },
};

export const NOTIFICATION_META: Record<NotificationType, { label: string; icon: string }> = {
  TASK_ASSIGNED: { label: "Assigned to you", icon: "UserPlus" },
  TASK_DUE_SOON: { label: "Due soon", icon: "Clock" },
  TASK_OVERDUE: { label: "Overdue", icon: "AlertTriangle" },
  TASK_COMPLETED: { label: "Completed", icon: "CheckCircle2" },
  COMMENT_MENTION: { label: "Mentioned you", icon: "AtSign" },
  COMMENT_CREATED: { label: "New comment", icon: "MessageSquare" },
  INVITATION: { label: "Invitation", icon: "Mail" },
  MEMBER_JOINED: { label: "New member", icon: "Users" },
  PROJECT_UPDATED: { label: "Project update", icon: "FolderKanban" },
};

/** Palette offered when creating a workspace, project, column or label. */
export const COLOR_PALETTE = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#10b981",
  "#14b8a6",
  "#0ea5e9",
  "#64748b",
];

/**
 * Icons offered for projects. Names map 1:1 to `lucide-react` exports and are
 * resolved at render time by `<ProjectIcon />`.
 */
export const PROJECT_ICONS = [
  "Rocket",
  "Globe",
  "Smartphone",
  "Megaphone",
  "Palette",
  "Code2",
  "Database",
  "ShoppingCart",
  "LineChart",
  "Cpu",
  "Boxes",
  "Sparkles",
] as const;

/** Board columns created with every new project. */
export const DEFAULT_COLUMNS: {
  name: string;
  color: string;
  status: TaskStatus;
  wipLimit: number;
}[] = [
  { name: "Backlog", color: "#94a3b8", status: TaskStatus.BACKLOG, wipLimit: 0 },
  { name: "To do", color: "#64748b", status: TaskStatus.TODO, wipLimit: 0 },
  { name: "In progress", color: "#6366f1", status: TaskStatus.IN_PROGRESS, wipLimit: 5 },
  { name: "Review", color: "#f59e0b", status: TaskStatus.IN_REVIEW, wipLimit: 4 },
  { name: "Done", color: "#10b981", status: TaskStatus.DONE, wipLimit: 0 },
];

/** Gap between fractional order indices when appending. */
export const ORDER_STEP = 1000;
