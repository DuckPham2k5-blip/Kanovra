"use client";

import { LogOut, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteWorkspace, leaveWorkspace } from "@/server/actions/workspace";

/**
 * Irreversible workspace operations. Deleting requires retyping the workspace
 * name, which is the only thing standing between a stray click and losing every
 * project in it.
 */
export function WorkspaceDangerZone({
  workspaceId,
  workspaceName,
  isOwner,
  canDelete,
}: {
  workspaceId: string;
  workspaceName: string;
  isOwner: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [confirmName, setConfirmName] = React.useState("");
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [leaveOpen, setLeaveOpen] = React.useState(false);

  async function handleDelete() {
    const result = await deleteWorkspace(workspaceId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Đã xoá không gian làm việc.");
    router.push("/onboarding");
    router.refresh();
  }

  async function handleLeave() {
    const result = await leaveWorkspace(workspaceId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Bạn đã rời khỏi không gian làm việc.");
    router.push("/onboarding");
    router.refresh();
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Vùng nguy hiểm</CardTitle>
        <CardDescription>Các thao tác dưới đây không thể hoàn tác.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {!isOwner ? (
          <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">Rời khỏi không gian làm việc</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Bạn sẽ mất quyền truy cập cho đến khi được mời lại.
              </p>
            </div>
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => setLeaveOpen(true)}
            >
              <LogOut />
              Rời đi
            </Button>
          </div>
        ) : null}

        {canDelete ? (
          <div className="space-y-3 rounded-lg border border-destructive/40 p-4">
            <div>
              <p className="text-sm font-medium">Xoá không gian làm việc</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Toàn bộ dự án, công việc, bình luận và lịch sử hoạt động sẽ bị xoá vĩnh viễn.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-name">
                Nhập <span className="font-semibold">{workspaceName}</span> để xác nhận
              </Label>
              <Input
                id="confirm-name"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={workspaceName}
                autoComplete="off"
              />
            </div>

            <Button
              variant="destructive"
              disabled={confirmName !== workspaceName}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 />
              Xoá vĩnh viễn
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Chỉ chủ sở hữu mới xoá được không gian làm việc này.
          </p>
        )}
      </CardContent>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Xoá "${workspaceName}"?`}
        description="Mọi dữ liệu sẽ bị xoá vĩnh viễn và không thể khôi phục."
        confirmLabel="Tôi hiểu, xoá ngay"
        destructive
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title={`Rời khỏi "${workspaceName}"?`}
        description="Bạn sẽ không còn thấy các dự án và công việc trong không gian này."
        confirmLabel="Rời đi"
        destructive
        onConfirm={handleLeave}
      />
    </Card>
  );
}
