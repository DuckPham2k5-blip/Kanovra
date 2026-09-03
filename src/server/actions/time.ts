"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ForbiddenError, getTaskContext, requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fail, NOT_FOUND, ok, parse, withErrorHandling, type ActionResult } from "@/server/action-result";

/**
 * Recording time actually spent, against `estimate`, which was a guess.
 *
 * ## Who may write, and to whose row
 *
 * Writing needs `task:update`, so a VIEWER cannot add rows to a project they can
 * only read. Beyond that the rule is narrower than the role matrix: **you may
 * stop and delete only your own entries.** A time sheet is a statement about a
 * person's own day, and an admin quietly rewriting somebody's hours is a
 * different feature with different consequences — payroll, disputes, trust — and
 * should be built deliberately if it is ever wanted, not fall out of a role
 * check written for editing task titles.
 *
 * ## Starting stops whatever else was running
 *
 * Rather than refusing. Somebody who left a timer on yesterday's task wants that
 * one closed, not an error telling them to go and find it — and the alternative
 * leaves an entry running for days, which poisons the total far worse than an
 * early stop does.
 */

const taskSchema = z.object({ taskId: z.string().min(1) });
const entrySchema = z.object({ entryId: z.string().min(1) });

/**
 * A day, in minutes, is the ceiling on one manual entry.
 *
 * Not a policy about working hours — it is a typo guard. `480` typed as `4800`
 * is eighty hours against one task, and a total that wrong is worse than no
 * total at all because it looks like data.
 */
const MAX_MANUAL_MINUTES = 24 * 60;

const logSchema = z.object({
  taskId: z.string().min(1),
  minutes: z.coerce.number().int().min(1).max(MAX_MANUAL_MINUTES),
  note: z.string().trim().max(200).optional().or(z.literal("")),
});

function revalidateTask(slug: string, projectId: string) {
  revalidatePath(`/w/${slug}/projects/${projectId}`, "layout");
  revalidatePath(`/w/${slug}/my-tasks`);
}

export async function startTimer(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const { taskId } = parse(taskSchema, input);

    const ctx = await getTaskContext(user.id, taskId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "task:update")) throw new ForbiddenError();

    const now = new Date();

    /*
     * Both writes share a transaction so there is never a moment with two
     * running entries. Without it, two tabs pressing start at once can both
     * pass the stop and both insert, and the person then has two timers running
     * on different tasks with no way to notice.
     */
    await prisma.$transaction(async (tx) => {
      await tx.timeEntry.updateMany({
        where: { userId: user.id, endedAt: null },
        data: { endedAt: now },
      });
      await tx.timeEntry.create({
        data: { taskId, userId: user.id, startedAt: now },
      });
    });

    /*
     * Deliberately not logged to the activity feed.
     *
     * `logActivity` is what publishes a change to every open browser in the
     * workspace, and a timer starting is not news to anybody but the person who
     * pressed it. Announcing it would put a line in the feed every few minutes
     * and, worse, tell a team when each of them started and stopped working.
     */
    revalidateTask(ctx.workspace.slug, ctx.task.projectId);
    return ok(undefined);
  });
}

export async function stopTimer(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const { entryId } = parse(entrySchema, input);

    const entry = await prisma.timeEntry.findUnique({
      where: { id: entryId },
      select: { id: true, userId: true, endedAt: true, taskId: true },
    });
    // Somebody else's entry answers the same as one that does not exist, so the
    // reply cannot be used to find out who is working on what.
    if (!entry || entry.userId !== user.id) return fail(NOT_FOUND);

    const ctx = await getTaskContext(user.id, entry.taskId);
    if (!ctx) return fail(NOT_FOUND);

    // Already stopped is a no-op rather than an error: two tabs, one intention.
    if (entry.endedAt === null) {
      await prisma.timeEntry.update({
        where: { id: entry.id },
        data: { endedAt: new Date() },
      });
    }

    revalidateTask(ctx.workspace.slug, ctx.task.projectId);
    return ok(undefined);
  });
}

/**
 * A stretch of work that was not timed.
 *
 * The interval is placed ending *now*, so "I spent two hours" records the two
 * hours that just finished. Letting people choose the day would be more faithful
 * and needs a date field, a timezone decision and a rule about how far back is
 * allowed; this is the half that removes the loud failure — work that happened
 * and is recorded nowhere.
 */
export async function logTime(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const { taskId, minutes, note } = parse(logSchema, input);

    const ctx = await getTaskContext(user.id, taskId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "task:update")) throw new ForbiddenError();

    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - minutes * 60_000);

    await prisma.timeEntry.create({
      data: { taskId, userId: user.id, startedAt, endedAt, note: note || null },
    });

    revalidateTask(ctx.workspace.slug, ctx.task.projectId);
    return ok(undefined);
  });
}

export async function deleteTimeEntry(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const { entryId } = parse(entrySchema, input);

    const entry = await prisma.timeEntry.findUnique({
      where: { id: entryId },
      select: { id: true, userId: true, taskId: true },
    });
    if (!entry || entry.userId !== user.id) return fail(NOT_FOUND);

    const ctx = await getTaskContext(user.id, entry.taskId);
    if (!ctx) return fail(NOT_FOUND);

    await prisma.timeEntry.delete({ where: { id: entry.id } });

    revalidateTask(ctx.workspace.slug, ctx.task.projectId);
    return ok(undefined);
  });
}
