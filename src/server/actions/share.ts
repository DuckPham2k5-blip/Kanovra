"use server";

import { ActivityType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ForbiddenError, getProjectContext, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/events";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  expiryFromChoice,
  randomShareToken,
  SHARE_EXPIRY_CHOICES,
  type ShareExpiryChoice,
} from "@/lib/share-link";
import {
  fail,
  NOT_FOUND,
  ok,
  parse,
  withErrorHandling,
  type ActionResult,
} from "@/server/action-result";

/**
 * Turning a board public, and turning it off again.
 *
 * Both are `project:share`, which is ADMIN — see the note beside it in
 * `permissions.ts`. Everything else in this application is a decision about who
 * inside the workspace may do what; this is a decision about people outside it,
 * and there is no undoing an address once somebody has copied it.
 *
 * Neither action ever returns an existing token to somebody who did not just
 * ask for one: the page loads it through `getShareLink` under the same check.
 */

const expiryValues = SHARE_EXPIRY_CHOICES.map((c) => c.value) as [
  ShareExpiryChoice,
  ...ShareExpiryChoice[],
];

const createSchema = z.object({
  projectId: z.string().min(1),
  expiry: z.enum(expiryValues).default("30d"),
});

/**
 * Publishes the board, or replaces the link that is already there.
 *
 * `upsert` rather than "create, and fail if one exists". Two people pressing
 * the button at the same moment must not leave a second live secret for one
 * board, and the unique index on `projectId` is what actually decides that —
 * the loser of the race updates rather than inserting.
 *
 * Asking again with a different expiry **mints a new token**, which is the
 * conservative reading of the request: somebody re-opening this dialog to
 * change how long the link lasts is doing something to the link's lifetime, and
 * silently extending the life of an address that has been forwarded twice is
 * the outcome nobody would have chosen. The old address stops working, which is
 * visible; the alternative failure is not.
 */
export async function createShareLink(
  input: unknown,
): Promise<ActionResult<{ token: string; expiresAt: string | null }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(createSchema, input);

    const context = await getProjectContext(user.id, data.projectId);
    if (!context) return fail(NOT_FOUND);
    if (!can(context.role, "project:share")) throw new ForbiddenError();

    const token = randomShareToken();
    const expiresAt = expiryFromChoice(data.expiry);

    const link = await prisma.shareLink.upsert({
      where: { projectId: data.projectId },
      create: {
        projectId: data.projectId,
        token,
        expiresAt,
        createdById: user.id,
      },
      update: {
        token,
        expiresAt,
        createdById: user.id,
        // A fresh link has never been opened. Carrying the old count forward
        // would say the new address is in use before anybody has seen it.
        lastViewedAt: null,
      },
      select: { token: true, expiresAt: true },
    });

    /*
     * Logged, and deliberately so. The workspace should be able to see that one
     * of its boards was published — this is the activity feed's whole purpose,
     * and a change of this size happening silently is the version of the
     * feature nobody would agree to. It also reaches every open browser,
     * because `logActivity` is what publishes to the bus.
     *
     * The token is not in the message. An activity row is read by everyone in
     * the workspace including viewers, and a secret written into a feed is a
     * secret with a much wider audience than the person who was given the link.
     */
    await logActivity({
      workspaceId: context.workspace.id,
      actorId: user.id,
      projectId: data.projectId,
      type: ActivityType.PROJECT_UPDATED,
      message: `made the ${context.project.name} board public with a read-only link`,
    });

    revalidateProject(context.workspace.slug, data.projectId);

    return ok({
      token: link.token,
      expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
    });
  });
}

const revokeSchema = z.object({ projectId: z.string().min(1) });

/**
 * Takes the board off the internet.
 *
 * The row is deleted rather than flagged. A `revokedAt` column would leave the
 * token sitting in the database next to a boolean, and the only thing that can
 * happen to a boolean is that somebody flips it back — by hand, by a restore,
 * by a migration written months later that does not know what the column meant.
 * A link that is gone cannot be un-revoked by accident.
 *
 * `deleteMany` rather than `delete`: pressing the button twice, or two people
 * pressing it at once, must not turn "already off" into an error. The end state
 * is the same either way and it is the end state the person asked for.
 */
export async function revokeShareLink(input: unknown): Promise<ActionResult<{ removed: boolean }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(revokeSchema, input);

    const context = await getProjectContext(user.id, data.projectId);
    if (!context) return fail(NOT_FOUND);
    if (!can(context.role, "project:share")) throw new ForbiddenError();

    const { count } = await prisma.shareLink.deleteMany({
      where: { projectId: data.projectId },
    });

    if (count > 0) {
      await logActivity({
        workspaceId: context.workspace.id,
        actorId: user.id,
        projectId: data.projectId,
        type: ActivityType.PROJECT_UPDATED,
        message: `turned off the public link for the ${context.project.name} board`,
      });
    }

    revalidateProject(context.workspace.slug, data.projectId);

    return ok({ removed: count > 0 });
  });
}

function revalidateProject(slug: string, projectId: string) {
  revalidatePath(`/w/${slug}/projects/${projectId}`);
  revalidatePath(`/w/${slug}/projects/${projectId}/board`);
}
