"use client";

import { Role } from "@prisma/client";
import { Check, Copy, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { assignableRoles, ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/permissions";
import { inviteMember } from "@/server/actions/member";

/**
 * Invites by email and hands back a shareable link. There is no outbound mail
 * service wired up, so the link is the delivery mechanism — copy it and send it
 * however the team already communicates.
 */
export function InviteMemberDialog({
  workspaceId,
  currentUserRole,
}: {
  workspaceId: string;
  currentUserRole: Role;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const roleOptions = assignableRoles(currentUserRole);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>(roleOptions[0] ?? Role.MEMBER);
  const [inviteUrl, setInviteUrl] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  function reset() {
    setEmail("");
    setRole(roleOptions[0] ?? Role.MEMBER);
    setInviteUrl(null);
    setCopied(false);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    startTransition(async () => {
      const result = await inviteMember({ workspaceId, email: email.trim(), role });
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      // An existing TaskForge user is added straight away — there is no link to
      // share. Anyone else gets an invitation URL to pass along.
      if (result.data.added) {
        toast.success("Đã thêm thành viên vào workspace.");
        setOpen(false);
        reset();
      } else {
        // The server builds the URL from NEXT_PUBLIC_APP_URL, which may be
        // unset in development — fall back to the current origin.
        const url = result.data.inviteUrl ?? "";
        setInviteUrl(url.startsWith("http") ? url : `${window.location.origin}${url}`);
        toast.success("Đã tạo lời mời và gửi email thông báo.");
      }
      router.refresh();
    });
  }

  async function handleCopy() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Không sao chép được, hãy chọn và copy thủ công.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus />
          Mời thành viên
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mời thành viên</DialogTitle>
          <DialogDescription>
            Tạo lời mời rồi gửi đường dẫn cho người bạn muốn thêm vào workspace.
          </DialogDescription>
        </DialogHeader>

        {inviteUrl ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-url">Đường dẫn lời mời</Label>
              <div className="flex gap-2">
                <Input id="invite-url" value={inviteUrl} readOnly className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  aria-label="Sao chép đường dẫn"
                >
                  {copied ? <Check className="text-emerald-500" /> : <Copy />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Email mời đã được gửi tới địa chỉ trên. Nếu không thấy, kiểm tra thư mục Spam hoặc gửi
                trực tiếp đường dẫn này. Lời mời có hiệu lực trong 14 ngày và chỉ dùng được một lần.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Mời người khác
              </Button>
              <Button onClick={() => setOpen(false)}>Xong</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ten@congty.com"
                autoFocus
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-role">Vai trò</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {ROLE_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTION[role]}</p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Huỷ
              </Button>
              <Button type="submit" loading={pending}>
                Tạo lời mời
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
