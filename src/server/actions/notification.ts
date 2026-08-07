"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, withErrorHandling, type ActionResult } from "@/server/action-result";

export async function markNotificationRead(id: string): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    // `updateMany` scopes by userId, so one user can never flip another's rows.
    await prisma.notification.updateMany({
      where: { id, userId: user.id },
      data: { read: true },
    });
    revalidatePath("/", "layout");
    return ok(undefined);
  });
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    await prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });
    revalidatePath("/", "layout");
    return ok(undefined);
  });
}

export async function deleteNotification(id: string): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    await prisma.notification.deleteMany({ where: { id, userId: user.id } });
    revalidatePath("/", "layout");
    return ok(undefined);
  });
}

export async function clearReadNotifications(): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    await prisma.notification.deleteMany({ where: { userId: user.id, read: true } });
    revalidatePath("/", "layout");
    return ok(undefined);
  });
}
