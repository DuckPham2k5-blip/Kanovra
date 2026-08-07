"use client";

import { Priority, TaskStatus } from "@prisma/client";
import { Check, Copy, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { DueBadge, LabelChip, StatusBadge } from "@/components/shared/badges";
import { DatePicker } from "@/components/shared/date-picker";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ChecklistSection } from "@/components/task/checklist-section";
import { CommentSection } from "@/components/task/comment-section";
import { TaskDialog } from "@/components/task/task-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { PRIORITY_META, PRIORITY_ORDER, TASK_STATUS_META, TASK_STATUS_ORDER } from "@/lib/constants";
import { fromNow } from "@/lib/date";
import { cn } from "@/lib/utils";
import { deleteTask, duplicateTask, toggleTaskDone, updateTask } from "@/server/actions/task";
import type { LabelDTO, MemberDTO, TaskDetailDTO } from "@/types";

const UNASSIGNED = "__none__";

/**
 * Task detail panel. Opened by putting `?task=<id>` in the URL, so it is
 * shareable, survives a refresh and always renders server-fetched data.
 */
export function TaskDetailSheet({
  task,
  members,
  labels,
  currentUserId,
  canEdit,
  canDeleteAny,
  workspaceSlug,
}: {
  task: TaskDetailDTO;
  members: MemberDTO[];
  labels: LabelDTO[];
  currentUserId: string;
  canEdit: boolean;
  canDeleteAny: boolean;
  workspaceSlug: string;
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState(task.title);
  const [description, setDescription] = React.useState(task.description ?? "");
  const [savingField, setSavingField] = React.useState<string | null>(null);
  const [subtaskDialog, setSubtaskDialog] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  React.useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? "");
  }, [task.id, task.title, task.description]);

  function close() {
    // Drop only the `task` param, keeping any filters the user had applied.
    const params = new URLSearchParams(window.location.search);
    params.delete("task");
    const qs = params.toString();
    router.push(`${window.location.pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  async function patch(field: string, payload: Record<string, unknown>) {
    setSavingField(field);
    try {
      const result = await updateTask({ taskId: task.id, ...payload });
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setSavingField(null);
    }
  }

  async function handleDuplicate() {
    const result = await duplicateTask(task.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Đã nhân bản công việc.");
    router.refresh();
  }

  async function handleDelete() {
    const result = await deleteTask({ taskId: task.id });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Đã xoá công việc.");
    close();
    router.refresh();
  }

  const done = task.status === TaskStatus.DONE;
  const labelIds = task.labels.map((l) => l.id);

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && close()}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl">
          <SheetTitle className="sr-only">{task.title}</SheetTitle>

          {/* Header */}
          <div className="flex items-center gap-2 border-b px-5 py-3">
            <span className="font-mono text-xs text-muted-foreground">
              {task.projectKey}-{task.number}
            </span>
            <StatusBadge status={task.status} />
            {task.parent ? (
              <span className="truncate text-xs text-muted-foreground">
                thuộc {task.projectKey}-{task.parent.number}
              </span>
            ) : null}

            <div className="ml-auto flex items-center gap-1">
              {canEdit ? (
                <DropdownMenu>
                  {/* Explicit id — see the comment in sidebar.tsx's workspace switcher. */}
                  <DropdownMenuTrigger asChild id={`task-options-trigger-${task.id}`}>
                    <Button variant="ghost" size="icon-sm" aria-label="Tuỳ chọn">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => void handleDuplicate()}>
                      <Copy /> Nhân bản
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          `${window.location.origin}/w/${workspaceSlug}/projects/${task.projectId}/board?task=${task.id}`,
                        );
                        toast.success("Đã sao chép liên kết.");
                      }}
                    >
                      <Check /> Sao chép liên kết
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                      <Trash2 /> Xoá công việc
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
            {/* Title */}
            <div className="flex items-start gap-3">
              <Checkbox
                className="mt-1.5 size-5"
                checked={done}
                disabled={!canEdit}
                onCheckedChange={async () => {
                  const result = await toggleTaskDone(task.id);
                  if (!result.success) toast.error(result.error);
                  else router.refresh();
                }}
                aria-label="Đánh dấu hoàn thành"
              />
              <Textarea
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  if (title.trim() && title !== task.title) void patch("title", { title });
                }}
                disabled={!canEdit}
                rows={1}
                className={cn(
                  "min-h-0 resize-none border-0 px-0 py-0 text-lg font-semibold shadow-none focus-visible:ring-0",
                  done && "text-muted-foreground line-through",
                )}
              />
            </div>

            {/* Properties */}
            <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
              <PropertyRow label="Trạng thái">
                <Select
                  value={task.status}
                  disabled={!canEdit || savingField === "status"}
                  onValueChange={(v) => void patch("status", { status: v as TaskStatus })}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUS_ORDER.map((s) => (
                      <SelectItem key={s} value={s}>
                        <span className="flex items-center gap-2">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: TASK_STATUS_META[s].color }}
                          />
                          {TASK_STATUS_META[s].label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PropertyRow>

              <PropertyRow label="Người phụ trách">
                <Select
                  value={task.assignee?.id ?? UNASSIGNED}
                  disabled={!canEdit || savingField === "assignee"}
                  onValueChange={(v) =>
                    void patch("assignee", { assigneeId: v === UNASSIGNED ? null : v })
                  }
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Chưa giao" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Chưa giao</SelectItem>
                    {members.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        <span className="flex items-center gap-2">
                          <UserAvatar user={member} className="size-5" showTooltip={false} />
                          {member.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PropertyRow>

              <PropertyRow label="Độ ưu tiên">
                <Select
                  value={task.priority}
                  disabled={!canEdit || savingField === "priority"}
                  onValueChange={(v) => void patch("priority", { priority: v as Priority })}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_ORDER.map((p) => (
                      <SelectItem key={p} value={p}>
                        <span className="flex items-center gap-2">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: PRIORITY_META[p].color }}
                          />
                          {PRIORITY_META[p].label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PropertyRow>

              <PropertyRow label="Hạn hoàn thành">
                <div className="space-y-1">
                  <DatePicker
                    value={task.dueDate ? new Date(task.dueDate) : null}
                    disabled={!canEdit}
                    onChange={(date) => void patch("dueDate", { dueDate: date })}
                    className="h-8"
                  />
                  <DueBadge date={task.dueDate} done={done} />
                </div>
              </PropertyRow>

              <PropertyRow label="Bắt đầu">
                <DatePicker
                  value={task.startDate ? new Date(task.startDate) : null}
                  disabled={!canEdit}
                  onChange={(date) => void patch("startDate", { startDate: date })}
                  className="h-8"
                />
              </PropertyRow>

              <PropertyRow label="Ước lượng (giờ)">
                <Input
                  type="number"
                  min={0}
                  step="0.5"
                  className="h-8"
                  disabled={!canEdit}
                  defaultValue={task.estimate ?? ""}
                  onBlur={(e) => {
                    const value = e.target.value ? Number(e.target.value) : null;
                    if (value !== task.estimate) void patch("estimate", { estimate: value });
                  }}
                />
              </PropertyRow>
            </div>

            {/* Labels */}
            <section className="space-y-2">
              <Label className="text-sm font-semibold">Nhãn</Label>
              <div className="flex flex-wrap gap-2">
                {labels.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Chưa có nhãn nào trong không gian làm việc.
                  </p>
                ) : (
                  labels.map((label) => {
                    const selected = labelIds.includes(label.id);
                    return (
                      <button
                        key={label.id}
                        type="button"
                        disabled={!canEdit}
                        onClick={() =>
                          void patch("labels", {
                            labelIds: selected
                              ? labelIds.filter((id) => id !== label.id)
                              : [...labelIds, label.id],
                          })
                        }
                        className={cn(
                          "rounded-full ring-offset-2 ring-offset-background transition-all disabled:cursor-not-allowed",
                          selected ? "ring-2 ring-foreground" : "opacity-50 hover:opacity-100",
                        )}
                      >
                        <LabelChip label={label} />
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            <Separator />

            {/* Description */}
            <section className="space-y-2">
              <Label htmlFor="task-desc" className="text-sm font-semibold">
                Mô tả
              </Label>
              <Textarea
                id="task-desc"
                rows={5}
                value={description}
                disabled={!canEdit}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => {
                  if (description !== (task.description ?? "")) {
                    void patch("description", { description });
                  }
                }}
                placeholder="Thêm mô tả chi tiết…"
              />
            </section>

            <Separator />

            {/* Subtasks */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Công việc con ({task.subtasks.length})</h3>
                {canEdit ? (
                  <Button variant="ghost" size="sm" onClick={() => setSubtaskDialog(true)}>
                    <Plus className="size-4" /> Thêm
                  </Button>
                ) : null}
              </div>

              <ul className="space-y-1">
                {task.subtasks.map((subtask) => (
                  <li
                    key={subtask.id}
                    className="flex items-center gap-2.5 rounded-md border px-3 py-2"
                  >
                    <Checkbox
                      checked={subtask.status === TaskStatus.DONE}
                      disabled={!canEdit}
                      onCheckedChange={async () => {
                        const result = await toggleTaskDone(subtask.id);
                        if (!result.success) toast.error(result.error);
                        else router.refresh();
                      }}
                      aria-label={`Hoàn thành ${subtask.title}`}
                    />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm",
                        subtask.status === TaskStatus.DONE && "text-muted-foreground line-through",
                      )}
                    >
                      {subtask.title}
                    </span>
                    <DueBadge date={subtask.dueDate} done={subtask.status === TaskStatus.DONE} />
                    <UserAvatar user={subtask.assignee} className="size-6" />
                  </li>
                ))}

                {task.subtasks.length === 0 ? (
                  <li className="text-sm text-muted-foreground">Chưa có công việc con.</li>
                ) : null}
              </ul>
            </section>

            <Separator />

            <ChecklistSection taskId={task.id} items={task.checklist} canEdit={canEdit} />

            <Separator />

            <CommentSection
              taskId={task.id}
              comments={task.comments}
              members={members}
              currentUserId={currentUserId}
              canComment={canEdit}
              canDeleteAny={canDeleteAny}
            />

            <p className="pt-2 text-xs text-muted-foreground">
              Tạo bởi {task.createdBy.name}
              {task.completedAt ? ` · Hoàn thành ${fromNow(task.completedAt)}` : ""}
            </p>
          </div>
        </SheetContent>
      </Sheet>

      <TaskDialog
        open={subtaskDialog}
        onOpenChange={setSubtaskDialog}
        projectId={task.projectId}
        parentId={task.id}
        columnId={task.columnId}
        members={members}
        labels={labels}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Xoá công việc này?"
        description={`"${task.title}" cùng toàn bộ công việc con, checklist và bình luận sẽ bị xoá vĩnh viễn.`}
        confirmLabel="Xoá"
        destructive
        onConfirm={handleDelete}
      />
    </>
  );
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
