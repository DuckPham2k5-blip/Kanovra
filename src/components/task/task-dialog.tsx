"use client";

import { Priority } from "@prisma/client";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { AiDraftButton } from "@/components/ai/ai-draft-button";
import { LabelChip } from "@/components/shared/badges";
import { DatePicker } from "@/components/shared/date-picker";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PRIORITY_META, PRIORITY_ORDER } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { createTask } from "@/server/actions/task";
import type { LabelDTO, MemberDTO } from "@/types";

const UNASSIGNED = "__none__";

/** Quick-create dialog for a task (or a subtask when `parentId` is given). */
export function TaskDialog({
  open,
  onOpenChange,
  projectId,
  columnId,
  parentId,
  members,
  labels,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  columnId?: string | null;
  parentId?: string | null;
  members: MemberDTO[];
  labels: LabelDTO[];
  onCreated?: (taskId: string) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [assigneeId, setAssigneeId] = React.useState<string>(UNASSIGNED);
  const [priority, setPriority] = React.useState<Priority>(Priority.NONE);
  const [dueDate, setDueDate] = React.useState<Date | null>(null);
  const [estimate, setEstimate] = React.useState("");
  const [labelIds, setLabelIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (open) return;
    setTitle("");
    setDescription("");
    setAssigneeId(UNASSIGNED);
    setPriority(Priority.NONE);
    setDueDate(null);
    setEstimate("");
    setLabelIds([]);
  }, [open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;

    setPending(true);
    try {
      const result = await createTask({
        projectId,
        columnId: columnId ?? null,
        parentId: parentId ?? null,
        title,
        description,
        priority,
        assigneeId: assigneeId === UNASSIGNED ? null : assigneeId,
        dueDate,
        estimate: estimate ? Number(estimate) : null,
        labelIds,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(parentId ? "Subtask added." : "Task created.");
      onOpenChange(false);
      onCreated?.(result.data.id);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{parentId ? "Add subtask" : "New task"}</DialogTitle>
          <DialogDescription>
            Only the title is required — everything else can come later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="t-title">Title</Label>
            <Input
              id="t-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="t-desc">Description</Label>
              <AiDraftButton
                projectId={projectId}
                title={title}
                existing={description}
                onDrafted={setDescription}
              />
            </div>
            <Textarea
              id="t-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Context, acceptance criteria…"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Assignee</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
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
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger>
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
            </div>

            <div className="space-y-2">
              <Label>Due date</Label>
              <DatePicker value={dueDate} onChange={setDueDate} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="t-est">Estimate (h)</Label>
              <Input
                id="t-est"
                type="number"
                min={0}
                step="0.5"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                placeholder="VD: 4"
              />
            </div>
          </div>

          {labels.length > 0 ? (
            <div className="space-y-2">
              <Label>Labels</Label>
              <div className="flex flex-wrap gap-2">
                {labels.map((label) => {
                  const selected = labelIds.includes(label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      onClick={() =>
                        setLabelIds((ids) =>
                          selected ? ids.filter((id) => id !== label.id) : [...ids, label.id],
                        )
                      }
                      className={cn(
                        "rounded-full ring-offset-2 ring-offset-background transition-shadow",
                        selected && "ring-2 ring-foreground",
                      )}
                    >
                      <LabelChip label={label} />
                      {selected ? <Check className="sr-only" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} disabled={!title.trim()}>
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
