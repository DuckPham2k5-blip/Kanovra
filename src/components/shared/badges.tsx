import type { Priority, ProjectStatus, TaskStatus } from "@prisma/client";
import { AlertCircle, ArrowDown, ArrowUp, CalendarClock, Minus, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { PRIORITY_META, PROJECT_STATUS_META, TASK_STATUS_META } from "@/lib/constants";
import { dueLabel } from "@/lib/date";
import { cn } from "@/lib/utils";

const PRIORITY_ICON: Record<Priority, React.ComponentType<{ className?: string }>> = {
  URGENT: Zap,
  HIGH: ArrowUp,
  MEDIUM: Minus,
  LOW: ArrowDown,
  NONE: Minus,
};

export function PriorityBadge({
  priority,
  className,
  iconOnly,
}: {
  priority: Priority;
  className?: string;
  iconOnly?: boolean;
}) {
  const meta = PRIORITY_META[priority];
  const Icon = PRIORITY_ICON[priority];

  if (iconOnly) {
    return (
      <span
        className={cn("flex size-5 items-center justify-center rounded", meta.className, className)}
        title={`Priority: ${meta.label}`}
      >
        <Icon className="size-3" />
      </span>
    );
  }

  return (
    <Badge variant="secondary" className={cn(meta.className, className)}>
      <Icon className="size-3" />
      {meta.label}
    </Badge>
  );
}

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const meta = TASK_STATUS_META[status];
  return (
    <Badge variant="secondary" className={cn(meta.className, className)}>
      <span className="size-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </Badge>
  );
}

export function ProjectStatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}) {
  const meta = PROJECT_STATUS_META[status];
  return (
    <Badge variant="secondary" className={cn(meta.className, className)}>
      {meta.label}
    </Badge>
  );
}

export function LabelChip({
  label,
  className,
}: {
  label: { name: string; color: string };
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        className,
      )}
      style={{ backgroundColor: `${label.color}1f`, color: label.color }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: label.color }} />
      {label.name}
    </span>
  );
}

/** Due date pill that turns amber when close and red once overdue. */
export function DueBadge({
  date,
  done,
  className,
}: {
  date: Date | string | null | undefined;
  done?: boolean;
  className?: string;
}) {
  const info = dueLabel(date);
  if (!info) return null;

  const tone = done
    ? "text-muted-foreground"
    : info.overdue
      ? "text-destructive"
      : info.soon
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground";

  const Icon = info.overdue && !done ? AlertCircle : CalendarClock;

  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium", tone, className)}>
      <Icon className="size-3" />
      {info.text}
    </span>
  );
}
