"use client";

import { TaskStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { ColorPicker } from "@/components/color-picker";
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
import { TASK_STATUS_META, TASK_STATUS_ORDER } from "@/lib/constants";
import { createColumn, updateColumn } from "@/server/actions/column";
import type { ColumnDTO } from "@/types";

export function ColumnDialog({
  open,
  onOpenChange,
  projectId,
  column,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  column?: ColumnDTO | null;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState("#94a3b8");
  const [status, setStatus] = React.useState<TaskStatus>(TaskStatus.TODO);
  const [wipLimit, setWipLimit] = React.useState("0");

  React.useEffect(() => {
    if (!open) return;
    setName(column?.name ?? "");
    setColor(column?.color ?? "#94a3b8");
    setStatus(column?.status ?? TaskStatus.TODO);
    setWipLimit(String(column?.wipLimit ?? 0));
  }, [open, column]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const payload = { name, color, status, wipLimit: Number(wipLimit) || 0 };
      const result = column
        ? await updateColumn({ ...payload, columnId: column.id })
        : await createColumn({ ...payload, projectId });

      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(column ? "Column updated." : "Column added.");
      onOpenChange(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{column ? "Edit column" : "New column"}</DialogTitle>
          <DialogDescription>
            Cards dropped into this column pick up the matching status automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="col-name">Column name</Label>
            <Input
              id="col-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. In testing"
              required
              autoFocus
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Mapped status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {TASK_STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="col-wip">WIP limit</Label>
              <Input
                id="col-wip"
                type="number"
                min={0}
                max={99}
                value={wipLimit}
                onChange={(e) => setWipLimit(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">0 = no limit</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Colour</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {column ? "Save" : "Add column"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
