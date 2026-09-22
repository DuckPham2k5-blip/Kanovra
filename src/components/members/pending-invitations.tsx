"use client";

import type { Role } from "@prisma/client";
import { Check, Clock, Copy, Mail, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRegion } from "@/components/settings/region-provider";
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
  const { formatDate } = useRegion();
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
      toast.success(`Revoked the invitation to ${invitation.email}.`);
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
      toast.success("Invite link copied.");
      setTimeout(() => setCopiedId((id) => (id === invitation.id ? null : id)), 2000);
    } catch {
      toast.error("Couldn't copy — try again.");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pending invitations</CardTitle>
        <CardDescription>
          {invitations.length} invitations not yet accepted. If the invite email doesn&apos;t arrive (it may be
          caught by spam), use the copy button to share the link yourself.
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
                  {invitation.invitedBy} invited · {formatDate(invitation.createdAt)}
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
                {expired ? "Expired" : `Expires ${formatDate(invitation.expiresAt)}`}
              </span>

              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Copy invite link for ${invitation.email}`}
                onClick={() => void handleCopyLink(invitation)}
              >
                {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
              </Button>

              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Revoke the invitation to ${invitation.email}`}
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
