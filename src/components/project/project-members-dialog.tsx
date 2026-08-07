"use client";

import type { Role } from "@prisma/client";
import { Check, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ROLE_LABEL } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { toggleProjectMember } from "@/server/actions/project";
import type { MemberDTO } from "@/types";

/** Picks which workspace members are attached to this project. */
export function ProjectMembersDialog({
  open,
  onOpenChange,
  projectId,
  projectMemberIds,
  workspaceMembers,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectMemberIds: string[];
  workspaceMembers: MemberDTO[];
  canEdit: boolean;
  role: Role;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  async function handleToggle(userId: string) {
    setPendingId(userId);
    try {
      const result = await toggleProjectMember(projectId, userId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.data.added ? "Đã thêm vào dự án." : "Đã gỡ khỏi dự án.");
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Thành viên dự án</DialogTitle>
          <DialogDescription>
            Chọn những người trong không gian làm việc tham gia dự án này.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {workspaceMembers.map((member) => {
            const active = projectMemberIds.includes(member.id);
            return (
              <li key={member.id}>
                <button
                  type="button"
                  disabled={!canEdit || pendingId === member.id}
                  onClick={() => void handleToggle(member.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors",
                    active ? "border-primary/50 bg-primary/5" : "hover:bg-accent",
                    !canEdit && "cursor-default",
                  )}
                >
                  <UserAvatar user={member} className="size-8" showTooltip={false} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{member.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {ROLE_LABEL[member.role]} · {member.email}
                    </span>
                  </span>
                  {active ? (
                    <Check className="size-4 shrink-0 text-primary" />
                  ) : canEdit ? (
                    <Plus className="size-4 shrink-0 text-muted-foreground" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Đóng
        </Button>
      </DialogContent>
    </Dialog>
  );
}
