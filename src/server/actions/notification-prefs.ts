"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import {
  NOTIFICATION_CATEGORY_KEYS,
  type NotificationCategory,
} from "@/lib/notification-prefs";
import { prisma } from "@/lib/prisma";
import { ok, parse, withErrorHandling, type ActionResult } from "@/server/action-result";

/**
 * A person's notification preferences as a full map, defaulting every category
 * to on. Reads only the rows that exist — a category with no row is enabled —
 * so a new account needs no seeding and the map is always complete.
 */
export async function getNotificationPreferences(
  userId: string,
): Promise<Record<NotificationCategory, boolean>> {
  const rows = await prisma.notificationPreference.findMany({
    where: { userId },
    select: { category: true, enabled: true },
  });
  const map = Object.fromEntries(
    NOTIFICATION_CATEGORY_KEYS.map((key) => [key, true]),
  ) as Record<NotificationCategory, boolean>;
  for (const row of rows) {
    if (row.category in map) map[row.category as NotificationCategory] = row.enabled;
  }
  return map;
}

const setSchema = z.object({
  category: z.enum(NOTIFICATION_CATEGORY_KEYS as [NotificationCategory, ...NotificationCategory[]]),
  enabled: z.boolean(),
});

/** Turns one category on or off for the signed-in person. Scoped by their own
 *  id, so nobody can flip another person's preferences. */
export async function setNotificationPreference(input: {
  category: string;
  enabled: boolean;
}): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const { category, enabled } = parse(setSchema, input);

    await prisma.notificationPreference.upsert({
      where: { userId_category: { userId: user.id, category } },
      update: { enabled },
      create: { userId: user.id, category, enabled },
    });

    revalidatePath("/", "layout");
    return ok(undefined);
  });
}
