"use client";

import { Role } from "@prisma/client";
import { Crown, MoreHorizontal, ShieldCheck, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/date";
import { assignableRoles, ROLE_LABEL } from "@/lib/permissions";
import { removeMember, transferOwnership, updateMemberRole } from "@/server/actions/member";

type MemberRow = {
  id: string;
  memberId: string;
  name: string;
  email: string;
  imageUrl: string | null;
  role: Role;
  joinedAt: string;
  openTasks: number;
};

const ROLE_BADGE: Record<Role, string> = {
  OWNER: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  ADMIN: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
  MEMBER: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  VIEWER: "bg-muted text-muted-foreground",
};

export function MembersTable({
  workspaceId,
  ownerId,
  currentUserId,
  canManage,
  members,
}: {
  workspaceId: string;
  ownerId: string;
  currentUserId: string;
  canManage: boolean;
  members: MemberRow[];
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [pendingRemove, setPendingRemove] = React.useState<MemberRow | null>(null);
  const [pendingTransfer, setPendingTransfer] = React.useState<MemberRow | null>(null);

  const currentRole = members.find((m) => m.id === currentUserId)?.role ?? Role.MEMBER;
  const roleOptions = assignableRoles(currentRole);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [members, query]);

  async function handleRoleChange(member: MemberRow, role: Role) {
    const result = await updateMemberRole({ workspaceId, memberId: member.memberId, role });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(`${member.name} is now ${ROLE_LABEL[role]}.`);
    router.refresh();
  }

  async function handleRemove() {
    if (!pendingRemove) return;
    const result = await removeMember(pendingRemove.memberId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(`Removed ${pendingRemove.name} from the workspace.`);
    router.refresh();
  }

  async function handleTransfer() {
    if (!pendingTransfer) return;
    const result = await transferOwnership(workspaceId, pendingTransfer.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(`${pendingTransfer.name} is now the owner.`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or email…"
        className="max-w-sm"
      />

      <div className="overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Members</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Open tasks</th>
                <th className="px-4 py-2.5 font-medium">Tham gia</th>
                <th className="w-12 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No members found.
                  </td>
                </tr>
              ) : (
                filtered.map((member) => {
                  const isOwner = member.id === ownerId;
                  const isSelf = member.id === currentUserId;
                  // Owners are untouchable, and nobody edits their own row.
                  const editable = canManage && !isOwner && !isSelf && roleOptions.length > 0;

                  return (
                    <tr key={member.memberId} className="transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <UserAvatar user={member} className="size-8" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {member.name}
                              {isSelf ? (
                                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                  (you)
                                </span>
                              ) : null}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {member.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <Badge variant="soft" className={ROLE_BADGE[member.role]}>
                          {isOwner ? <Crown className="size-3" /> : null}
                          {ROLE_LABEL[member.role]}
                        </Badge>
                      </td>

                      <td className="px-4 py-3 text-muted-foreground">{member.openTasks}</td>

                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(member.joinedAt)}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {editable ? (
                          <DropdownMenu>
                            {/* Explicit id — see the comment in sidebar.tsx's workspace switcher. */}
                            <DropdownMenuTrigger asChild id={`member-options-trigger-${member.memberId}`}>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Options for ${member.name}`}
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuLabel>Change role</DropdownMenuLabel>
                              {roleOptions.map((role) => (
                                <DropdownMenuItem
                                  key={role}
                                  disabled={role === member.role}
                                  onSelect={() => void handleRoleChange(member, role)}
                                >
                                  <ShieldCheck />
                                  {ROLE_LABEL[role]}
                                </DropdownMenuItem>
                              ))}

                              {currentRole === Role.OWNER ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onSelect={() => setPendingTransfer(member)}
                                  >
                                    <Crown />
                                    Transfer ownership
                                  </DropdownMenuItem>
                                </>
                              ) : null}

                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => setPendingRemove(member)}
                              >
                                <UserMinus />
                                Remove from workspace
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        onOpenChange={(open) => (open ? null : setPendingRemove(null))}
        title={`Delete ${pendingRemove?.name}?`}
        description="They lose access immediately. Tasks assigned to them stay, but become unassigned."
        confirmLabel="Remove member"
        destructive
        onConfirm={handleRemove}
      />

      <ConfirmDialog
        open={Boolean(pendingTransfer)}
        onOpenChange={(open) => (open ? null : setPendingTransfer(null))}
        title={`Transfer ownership to ${pendingTransfer?.name}?`}
        description="You become an Admin and lose the right to delete this workspace."
        confirmLabel="Transfer"
        destructive
        onConfirm={handleTransfer}
      />
    </div>
  );
}
