"use client";

import type { Role } from "@prisma/client";
import { Check, Clock, Copy, Mail, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/date";
import { ROLE_LABEL } from "@/lib/permissions";
import { revokeInvitation } from "@/server/actions/member";

type Invitation = {
  id: string;
  email: string;
  role: Role;
  token: string;
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
};

export function PendingInvitations({ invitations }: { invitations: Invitation[] }) {
  const router = useRouter();
  const [revoking, setRevoking] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  async function handleRevoke(invitation: Invitation) {
    setRevoking(invitation.id);
    try {
      const result = await revokeInvitation(invitation.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Đã thu hồi lời mời gửi tới ${invitation.email}.`);
      router.refresh();
    } finally {
      setRevoking(null);
    }
  }

  async function handleCopyLink(invitation: Invitation) {
    const url = `${window.location.origin}/invite/${invitation.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(invitation.id);
      toast.success("Đã sao chép đường dẫn mời.");
      setTimeout(() => setCopiedId((id) => (id === invitation.id ? null : id)), 2000);
    } catch {
      toast.error("Không sao chép được, hãy thử lại.");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Lời mời đang chờ</CardTitle>
        <CardDescription>
          {invitations.length} lời mời chưa được chấp nhận. Nếu email mời không tới nơi (có thể bị
          chặn spam), dùng nút sao chép để tự gửi đường dẫn.
        </CardDescription>
      </CardHeader>

      <ul className="divide-y border-t">
        {invitations.map((invitation) => {
          const expired = new Date(invitation.expiresAt) < new Date();
          const copied = copiedId === invitation.id;
          return (
            <li key={invitation.id} className="flex items-center gap-3 px-5 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Mail className="size-4" />
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{invitation.email}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {invitation.invitedBy} đã mời · {formatDate(invitation.createdAt)}
                </p>
              </div>

              <Badge variant="soft" className="hidden sm:inline-flex">
                {ROLE_LABEL[invitation.role]}
              </Badge>

              <span
                className={
                  expired
                    ? "hidden items-center gap-1 text-xs text-destructive sm:inline-flex"
                    : "hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex"
                }
              >
                <Clock className="size-3" />
                {expired ? "Đã hết hạn" : `Hết hạn ${formatDate(invitation.expiresAt)}`}
              </span>

              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Sao chép đường dẫn mời ${invitation.email}`}
                onClick={() => void handleCopyLink(invitation)}
              >
                {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
              </Button>

              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Thu hồi lời mời tới ${invitation.email}`}
                loading={revoking === invitation.id}
                onClick={() => void handleRevoke(invitation)}
              >
                {revoking === invitation.id ? null : <X className="size-4" />}
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
