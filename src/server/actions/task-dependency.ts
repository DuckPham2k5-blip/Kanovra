"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ForbiddenError, getTaskContext, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/events";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { hasEdge, wouldCycle, type DependencyEdge } from "@/lib/task-dependencies";
import { fail, NOT_FOUND, ok, parse, withErrorHandling, type ActionResult } from "@/server/action-result";
import type { DependencyLinkDTO } from "@/types";

/**
 * Recording that one task is waiting on another.
 *
 * Permission is asked of the **blocked** task, not the blocking one. The edge is
 * a statement about the waiting task — "this cannot proceed yet" — and it is
 * that task's board it changes. Requiring rights over the blocking task as well
 * would mean nobody could record that their own work waits on somebody else's,
 * which is the ordinary case and the reason to have the feature.
 *
 * Both ends must be in the same project. That is narrower than the truth —
 * design really does block build, across projects — and it is where this starts,
 * because the board, the list and the permission context are all per project: an
 * edge reaching outside would draw as a reference to something the reader may not
 * be able to open. Widening it later is a change to this rule and nothing else;
 * the table does not care.
 */

const edgeSchema = z.object({
  blockedTaskId: z.string().min(1),
  blockingTaskId: z.string().min(1),
});

const SAME_PROJECT = "Both tasks have to be in the same project.";
const WOULD_LOOP =
  "That would make a loop — the other task is already waiting on this one, directly or further back.";

export async function addTaskDependency(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const { blockedTaskId, blockingTaskId } = parse(edgeSchema, input);

    const ctx = await getTaskContext(user.id, blockedTaskId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "task:update")) throw new ForbiddenError();

    const blocking = await prisma.task.findUnique({
      where: { id: blockingTaskId },
      select: { id: true, projectId: true, number: true, title: true },
    });
    if (!blocking) return fail(NOT_FOUND);
    if (blocking.projectId !== ctx.task.projectId) return fail(SAME_PROJECT);

    /*
     * The walk and the insert share a transaction.
     *
     * That narrows the window rather than closing it: under this isolation level
     * two people adding the last link of a loop from opposite ends can both read
     * a graph without one and both write. It is why `chainOf` carries its own
     * `seen` set — this refuses to *create* a loop and cannot promise never to
     * meet one, and a walk that assumes otherwise hangs the request that finds it.
     * Serialising every dependency write on a shared board to close a two-press
     * race is the more expensive mistake.
     */
    const outcome = await prisma.$transaction(async (tx) => {
      const rows = await tx.taskDependency.findMany({
        where: { blockedTask: { projectId: ctx.task.projectId } },
        select: { blockedTaskId: true, blockingTaskId: true },
      });
      const edges: DependencyEdge[] = rows.map((row) => ({
        blockedId: row.blockedTaskId,
        blockingId: row.blockingTaskId,
      }));

      // Already recorded is a no-op, not a failure: two people pressing the same
      // button want the same thing, and both should be told it is true now.
      if (hasEdge(edges, blockedTaskId, blockingTaskId)) return "already" as const;
      if (wouldCycle(edges, blockedTaskId, blockingTaskId)) return "loop" as const;

      await tx.taskDependency.create({ data: { blockedTaskId, blockingTaskId } });
      return "created" as const;
    });

    // Answered by returning rather than by throwing. An exception would be caught
    // by `withErrorHandling` and reported as "something went wrong (ref: …)",
    // which is the right answer for a bug and the wrong one for a rule somebody
    // has just been told about. Returning early writes nothing, so there is
    // nothing to roll back either.
    if (outcome === "loop") return fail(WOULD_LOOP);

    if (outcome === "created") {
      const ref = `${ctx.project.key}-${ctx.task.number}`;
      await logActivity({
        workspaceId: ctx.workspace.id,
        projectId: ctx.task.projectId,
        taskId: ctx.task.id,
        actorId: user.id,
        type: "TASK_UPDATED",
        message: `${user.name} marked ${ref} as waiting on ${ctx.project.key}-${blocking.number}`,
      });
    }

    revalidateTask(ctx.workspace.slug, ctx.task.projectId);
    return ok(undefined);
  });
}

/**
 * Tasks this one could be made to wait on.
 *
 * The loop check runs *here* as well as on the write. Offering a choice that is
 * then refused teaches people the feature is unreliable; the refusal on the
 * write stays because this list is a suggestion made a moment earlier and the
 * graph can move underneath it.
 *
 * Already-linked tasks are left out for the same reason — picking one would do
 * nothing and look broken.
 */
export async function findDependencyCandidates(
  input: unknown,
): Promise<ActionResult<DependencyLinkDTO[]>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const { taskId, query } = parse(
      z.object({ taskId: z.string().min(1), query: z.string().max(120).default("") }),
      input,
    );

    const ctx = await getTaskContext(user.id, taskId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "task:view")) throw new ForbiddenError();

    const rows = await prisma.taskDependency.findMany({
      where: { blockedTask: { projectId: ctx.task.projectId } },
      select: { blockedTaskId: true, blockingTaskId: true },
    });
    const edges: DependencyEdge[] = rows.map((row) => ({
      blockedId: row.blockedTaskId,
      blockingId: row.blockingTaskId,
    }));

    const trimmed = query.trim();
    const found = await prisma.task.findMany({
      where: {
        projectId: ctx.task.projectId,
        id: { not: taskId },
        ...(trimmed
          ? {
              OR: [
                { title: { contains: trimmed, mode: "insensitive" as const } },
                // A bare number is how people refer to a task out loud, and it is
                // what the card shows next to the title.
                ...(Number.isFinite(Number(trimmed)) ? [{ number: Number(trimmed) }] : []),
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      // Enough to choose from without turning a picker into a second task list.
      take: 40,
      select: { id: true, number: true, title: true, status: true },
    });

    return ok(
      found
        .filter(
          (candidate) =>
            !hasEdge(edges, taskId, candidate.id) &&
            !wouldCycle(edges, taskId, candidate.id),
        )
        .slice(0, 12),
    );
  });
}

export async function removeTaskDependency(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const { blockedTaskId, blockingTaskId } = parse(edgeSchema, input);

    const ctx = await getTaskContext(user.id, blockedTaskId);
    if (!ctx) return fail(NOT_FOUND);
    if (!can(ctx.role, "task:update")) throw new ForbiddenError();

    // `deleteMany` rather than `delete`: removing a link that is already gone is
    // the outcome the person wanted, not an error to show them.
    await prisma.taskDependency.deleteMany({ where: { blockedTaskId, blockingTaskId } });

    revalidateTask(ctx.workspace.slug, ctx.task.projectId);
    return ok(undefined);
  });
}

/** Both views draw the badge, and both are cached separately. */
function revalidateTask(slug: string, projectId: string) {
  revalidatePath(`/w/${slug}/projects/${projectId}/board`);
  revalidatePath(`/w/${slug}/projects/${projectId}/list`);
}
