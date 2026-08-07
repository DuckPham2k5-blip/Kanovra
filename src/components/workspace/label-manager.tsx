"use client";

import { Plus, Tag, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { ColorPicker } from "@/components/color-picker";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { createLabel, deleteLabel } from "@/server/actions/label";

type LabelRow = {
  id: string;
  name: string;
  color: string;
  taskCount: number;
};

export function LabelManager({
  workspaceId,
  labels,
  canManage,
}: {
  workspaceId: string;
  labels: LabelRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState("#6366f1");
  const [pendingDelete, setPendingDelete] = React.useState<LabelRow | null>(null);

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Nhập tên nhãn.");
      return;
    }

    startTransition(async () => {
      const result = await createLabel({ workspaceId, name: trimmed, color });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setName("");
      toast.success("Đã thêm nhãn.");
      router.refresh();
    });
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    const result = await deleteLabel({ labelId: pendingDelete.id });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Đã xoá nhãn.");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {labels.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Chưa có nhãn nào. Thêm nhãn đầu tiên bên dưới.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {labels.map((label) => (
            <li key={label.id} className="flex items-center gap-3 px-3 py-2.5">
              <span
                className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: `${label.color}1f`, color: label.color }}
              >
                <Tag className="size-3" />
                {label.name}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {label.taskCount} công việc
              </span>
              {canManage ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Xoá nhãn ${label.name}`}
                  onClick={() => setPendingDelete(label)}
                >
                  <Trash2 className="size-4 text-muted-foreground" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form onSubmit={handleCreate} className="space-y-3 rounded-lg border p-3">
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tên nhãn mới"
              maxLength={30}
              disabled={pending}
            />
            <Button type="submit" loading={pending} className="shrink-0">
              {pending ? null : <Plus />}
              Thêm
            </Button>
          </div>
          <ColorPicker value={color} onChange={setColor} />
        </form>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => (open ? null : setPendingDelete(null))}
        title={`Xoá nhãn "${pendingDelete?.name}"?`}
        description={
          pendingDelete && pendingDelete.taskCount > 0
            ? `Nhãn này đang được gắn cho ${pendingDelete.taskCount} công việc. Xoá nhãn sẽ gỡ nó khỏi tất cả các công việc đó.`
            : "Thao tác này không thể hoàn tác."
        }
        confirmLabel="Xoá nhãn"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
