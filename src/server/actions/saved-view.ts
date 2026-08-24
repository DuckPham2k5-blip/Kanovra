"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ForbiddenError, getMembership, requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { viewQuery } from "@/lib/saved-views";
import { fail, NOT_FOUND, ok, parse, withErrorHandling, type ActionResult } from "@/server/action-result";

/**
 * Saving a set of filters under a name.
 *
 * A view is *not* a permission boundary and must never be read as one. It
 * narrows a list somebody could already see in full; the rows themselves are
 * fetched by the page under the usual membership checks, and a shared view hands
 * over a query string, not access. That is why creating one asks only for
 * `task:view` — the weakest thing anybody in a workspace has.
 */

const nameSchema = z.string().trim().min(1, "Give the view a name").max(60);

const createSchema = z.object({
  workspaceId: z.string().min(1),
  /** Null means the workspace-wide list, which is "My tasks". */
  projectId: z.string().min(1).nullish(),
  name: nameSchema,
  /** The address bar as it stands; filtered down to the filters on the way in. */
  query: z.string().max(2048),
  shared: z.boolean().default(false),
});

export async function createSavedView(input: unknown): Promise<ActionResult<{ id: string }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(createSchema, input);

    const membership = await getMembership(user.id, data.workspaceId);
    if (!membership) return fail(NOT_FOUND);
    if (!can(membership.role, "task:view")) throw new ForbiddenError();

    const workspace = await prisma.workspace.findUnique({
      where: { id: data.workspaceId },
      select: { slug: true },
    });
    if (!workspace) return fail(NOT_FOUND);

    // A project from another workspace would put a view on a list its owner
    // cannot open. Checked rather than trusted: it arrives from the browser.
    if (data.projectId) {
      const project = await prisma.project.findUnique({
        where: { id: data.projectId },
        select: { workspaceId: true },
      });
      if (!project || project.workspaceId !== data.workspaceId) return fail(NOT_FOUND);
    }

    const query = viewQuery(data.query);
    if (!query) return fail("There are no filters to save yet.");

    const view = await prisma.savedView.create({
      data: {
        workspaceId: data.workspaceId,
        projectId: data.projectId ?? null,
        createdById: user.id,
        name: data.name,
        query,
        shared: data.shared,
      },
      select: { id: true },
    });

    revalidateViews(workspace.slug, data.projectId ?? null);
    return ok({ id: view.id });
  });
}

const updateSchema = z.object({
  viewId: z.string().min(1),
  name: nameSchema.optional(),
  shared: z.boolean().optional(),
});

/**
 * Renaming a view, or sharing it.
 *
 * The owner of the view only, whatever their role. An admin can *delete* one —
 * tidying a shared list is housekeeping — but rewriting somebody's saved filters
 * under their name, or publishing them to the workspace on their behalf, is not.
 */
export async function updateSavedView(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(updateSchema, input);

    const view = await prisma.savedView.findUnique({
      where: { id: data.viewId },
      select: {
        createdById: true,
        projectId: true,
        workspaceId: true,
        workspace: { select: { slug: true } },
      },
    });
    if (!view) return fail(NOT_FOUND);

    const membership = await getMembership(user.id, view.workspaceId);
    if (!membership) return fail(NOT_FOUND);
    if (view.createdById !== user.id) throw new ForbiddenError();

    await prisma.savedView.update({
      where: { id: data.viewId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.shared !== undefined ? { shared: data.shared } : {}),
      },
    });

    revalidateViews(view.workspace.slug, view.projectId);
    return ok(undefined);
  });
}

export async function deleteSavedView(viewId: string): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();

    const view = await prisma.savedView.findUnique({
      where: { id: viewId },
      select: {
        createdById: true,
        projectId: true,
        workspaceId: true,
        workspace: { select: { slug: true } },
      },
    });
    if (!view) return fail(NOT_FOUND);

    const membership = await getMembership(user.id, view.workspaceId);
    if (!membership) return fail(NOT_FOUND);

    // Yours, or you are senior enough to tidy a shared list. `project:update`
    // rather than a role name, so this follows the matrix like everything else.
    const mine = view.createdById === user.id;
    if (!mine && !can(membership.role, "project:update")) throw new ForbiddenError();

    await prisma.savedView.delete({ where: { id: viewId } });

    revalidateViews(view.workspace.slug, view.projectId);
    return ok(undefined);
  });
}

/** Both lists that can carry views, because a view belongs to exactly one. */
function revalidateViews(slug: string, projectId: string | null) {
  if (projectId) revalidatePath(`/w/${slug}/projects/${projectId}/list`);
  else revalidatePath(`/w/${slug}/my-tasks`);
}
