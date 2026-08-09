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
    toast.success("Workspace deleted.");
    router.push("/onboarding");
    router.refresh();
  }

  async function handleLeave() {
    const result = await leaveWorkspace(workspaceId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("You left the workspace.");
    router.push("/onboarding");
    router.refresh();
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
        <CardDescription>The actions below cannot be undone.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {!isOwner ? (
          <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">Leave workspace</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                You lose access until someone invites you back.
              </p>
            </div>
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => setLeaveOpen(true)}
            >
              <LogOut />
              Leave
            </Button>
          </div>
        ) : null}

        {canDelete ? (
          <div className="space-y-3 rounded-lg border border-destructive/40 p-4">
            <div>
              <p className="text-sm font-medium">Delete workspace</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Every project, task, comment and activity record is deleted permanently.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-name">
                Type <span className="font-semibold">{workspaceName}</span> to confirm
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
              Delete permanently
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Only the owner can delete this workspace.
          </p>
        )}
      </CardContent>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete "${workspaceName}"?`}
        description="All data is permanently deleted and cannot be recovered."
        confirmLabel="I understand, delete it"
        destructive
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title={`Leave "${workspaceName}"?`}
        description="You will no longer see the projects and tasks in this workspace."
        confirmLabel="Leave"
        destructive
        onConfirm={handleLeave}
      />
    </Card>
  );
}
