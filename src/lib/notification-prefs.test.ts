import { NotificationType } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { notify, notifyMany } from "@/lib/events";
import { categoryForType } from "@/lib/notification-prefs";
import { prisma } from "@/lib/prisma";

/**
 * Notification preferences gate whether a notification is *created*, in
 * `events.ts`, so muting a category genuinely stops the notification rather than
 * hiding it after the fact.
 *
 * Two things are pinned. First, the cover: every `NotificationType` must map to
 * a category or to `null` (never gated), so adding a type goes red here instead
 * of silently defaulting to a switch it does not belong to — the same shape as
 * the product-guide and icon-registry cover tests. Second, the gate itself,
 * against a real database: a muted category is skipped, an unmuted one and an
 * ungated invitation both go through, and the fan-out filters per recipient.
 *
 * Configured-but-unreachable is a failure, not a skip.
 */

describe("notification category mapping", () => {
  it("maps every notification type to a category or explicit null", () => {
    for (const type of Object.values(NotificationType)) {
      // `undefined` would mean a type nobody decided on; `null` is the decision
      // "never gate this one". Only the second is allowed.
      const category = categoryForType(type);
      expect(category === null || typeof category === "string").toBe(true);
    }
  });

  it("never gates an invitation", () => {
    expect(categoryForType(NotificationType.INVITATION)).toBeNull();
  });

  it("groups the two due types under one category", () => {
    expect(categoryForType(NotificationType.TASK_DUE_SOON)).toBe("task_due");
    expect(categoryForType(NotificationType.TASK_OVERDUE)).toBe("task_due");
  });
});

const CONFIGURED = !!process.env.DATABASE_URL;
const TAG = `notif-pref-test-${Date.now().toString(36)}`;

let actorId = "";
let recipientId = "";
let otherId = "";
let workspaceId = "";

async function countFor(userId: string, type: NotificationType) {
  return prisma.notification.count({ where: { userId, type } });
}

describe.skipIf(!CONFIGURED)("notification gating against the database", () => {
  beforeAll(async () => {
    const [actor, recipient, other] = await Promise.all([
      prisma.user.create({
        data: { clerkId: `${TAG}-actor`, email: `${TAG}-actor@example.test`, name: "Actor" },
      }),
      prisma.user.create({
        data: { clerkId: `${TAG}-rcpt`, email: `${TAG}-rcpt@example.test`, name: "Recipient" },
      }),
      prisma.user.create({
        data: { clerkId: `${TAG}-other`, email: `${TAG}-other@example.test`, name: "Other" },
      }),
    ]);
    actorId = actor.id;
    recipientId = recipient.id;
    otherId = other.id;

    const workspace = await prisma.workspace.create({
      data: { name: "Notif Fixture", slug: TAG, ownerId: actor.id },
    });
    workspaceId = workspace.id;
  }, 30_000);

  afterAll(async () => {
    if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    for (const id of [actorId, recipientId, otherId]) {
      if (id) await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    await prisma.$disconnect().catch(() => {});
  });

  it("sends a notification when the category is not muted (default on)", async () => {
    const before = await countFor(recipientId, NotificationType.TASK_ASSIGNED);
    await notify({
      userId: recipientId,
      workspaceId,
      actorId,
      type: NotificationType.TASK_ASSIGNED,
      title: "Assigned",
    });
    expect(await countFor(recipientId, NotificationType.TASK_ASSIGNED)).toBe(before + 1);
  });

  it("skips a notification whose category the recipient has muted", async () => {
    await prisma.notificationPreference.upsert({
      where: { userId_category: { userId: recipientId, category: "task_assigned" } },
      update: { enabled: false },
      create: { userId: recipientId, category: "task_assigned", enabled: false },
    });

    const before = await countFor(recipientId, NotificationType.TASK_ASSIGNED);
    await notify({
      userId: recipientId,
      workspaceId,
      actorId,
      type: NotificationType.TASK_ASSIGNED,
      title: "Assigned again",
    });
    expect(await countFor(recipientId, NotificationType.TASK_ASSIGNED)).toBe(before);
  });

  it("still sends an ungated invitation even when other categories are muted", async () => {
    const before = await countFor(recipientId, NotificationType.INVITATION);
    await notify({
      userId: recipientId,
      workspaceId,
      actorId,
      type: NotificationType.INVITATION,
      title: "You're invited",
    });
    expect(await countFor(recipientId, NotificationType.INVITATION)).toBe(before + 1);
  });

  it("filters the fan-out per recipient", async () => {
    // recipient has task_assigned muted (from above); other does not.
    const rBefore = await countFor(recipientId, NotificationType.TASK_ASSIGNED);
    const oBefore = await countFor(otherId, NotificationType.TASK_ASSIGNED);

    await notifyMany([recipientId, otherId], {
      workspaceId,
      actorId,
      type: NotificationType.TASK_ASSIGNED,
      title: "Bulk assign",
    });

    expect(await countFor(recipientId, NotificationType.TASK_ASSIGNED)).toBe(rBefore);
    expect(await countFor(otherId, NotificationType.TASK_ASSIGNED)).toBe(oBefore + 1);
  });
});
