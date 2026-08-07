"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { acceptInvitation } from "@/server/actions/member";

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function handleAccept() {
    setPending(true);
    try {
      const result = await acceptInvitation(token);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Chào mừng bạn đến với nhóm!");
      router.push(`/w/${result.data.slug}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button className="w-full" onClick={handleAccept} loading={pending}>
      Chấp nhận lời mời
    </Button>
  );
}
