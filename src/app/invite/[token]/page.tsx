import { auth } from "@clerk/nextjs/server";
import { InvitationStatus } from "@prisma/client";
import { Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Logo, Wordmark } from "@/components/brand";
import { AcceptInviteButton } from "@/components/workspace/accept-invite-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABEL } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Lời mời tham gia" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { userId } = await auth();

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: {
      workspace: { select: { name: true, color: true, slug: true } },
      invitedBy: { select: { name: true } },
    },
  });

  const invalid =
    !invitation ||
    invitation.status !== InvitationStatus.PENDING ||
    invitation.expiresAt < new Date();

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="tf-dots absolute inset-0 opacity-50" aria-hidden="true" />
      <div className="relative w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <Logo className="size-10" />
          <Wordmark className="text-lg" />
        </div>

        <Card>
          {invalid ? (
            <>
              <CardHeader>
                <CardTitle>Lời mời không còn hiệu lực</CardTitle>
                <CardDescription>
                  Lời mời này đã được sử dụng, bị thu hồi hoặc đã hết hạn. Hãy liên hệ người quản trị
                  để nhận lời mời mới.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/">Về trang chủ</Link>
                </Button>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="items-center text-center">
                <span
                  className="mb-2 flex size-12 items-center justify-center rounded-xl text-lg font-semibold text-white"
                  style={{ backgroundColor: invitation.workspace.color }}
                >
                  {invitation.workspace.name.slice(0, 1).toUpperCase()}
                </span>
                <CardTitle>Tham gia {invitation.workspace.name}</CardTitle>
                <CardDescription>
                  {invitation.invitedBy.name} đã mời bạn với vai trò{" "}
                  <strong>{ROLE_LABEL[invitation.role]}</strong>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="flex items-center justify-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  <Mail className="size-4" />
                  {invitation.email}
                </p>

                {userId ? (
                  <AcceptInviteButton token={token} />
                ) : (
                  <div className="space-y-2">
                    <Button className="w-full" asChild>
                      <Link href={`/sign-up?redirect_url=/invite/${token}`}>
                        Đăng ký để tham gia
                      </Link>
                    </Button>
                    <Button variant="outline" className="w-full" asChild>
                      <Link href={`/sign-in?redirect_url=/invite/${token}`}>
                        Tôi đã có tài khoản
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
