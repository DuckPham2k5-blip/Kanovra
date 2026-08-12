"use server";

import { MindMapType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ForbiddenError, getMembership, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/events";
import { canvasSchema } from "@/lib/mind-map-canvas";
import { MIND_MAP_META } from "@/lib/mind-maps";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fail, NOT_FOUND, ok, parse, withErrorHandling, type ActionResult } from "@/server/action-result";

/**
 * Mind maps are workspace content, so they reuse the project permissions
 * rather than inventing an axis of their own: anyone who may create a project
 * may create a map, and a viewer may read but not write. Adding a parallel set
 * would mean two matrices to keep in step and one of them going stale.
 */

const createSchema = z.object({
  workspaceId: z.string().min(1),
  type: z.nativeEnum(MindMapType),
  title: z.string().trim().min(1, "Give the map a title").max(120),
  projectId: z.string().min(1).nullish(),
});

export async function createMindMap(input: unknown): Promise<ActionResult<{ id: string }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(createSchema, input);

    const membership = await getMembership(user.id, data.workspaceId);
    if (!can(membership?.role, "project:create")) throw new ForbiddenError();

    const workspace = await prisma.workspace.findUnique({
      where: { id: data.workspaceId },
      select: { slug: true },
    });
    if (!workspace) return fail(NOT_FOUND);

    const map = await prisma.mindMap.create({
      data: {
        workspaceId: data.workspaceId,
        projectId: data.projectId ?? null,
        type: data.type,
        title: data.title,
        // Empty rather than pre-filled with examples: a map that arrives with
        // somebody else's content is one more thing to delete before starting.
        data: {},
        createdById: user.id,
      },
    });

    await logActivity({
      workspaceId: data.workspaceId,
      actorId: user.id,
      type: "PROJECT_UPDATED",
      message: `${user.name} started a ${MIND_MAP_META[data.type].label.toLowerCase()}: ${map.title}`,
    });

    revalidatePath(`/w/${workspace.slug}/maps`);
    return ok({ id: map.id });
  });
}

export async function deleteMindMap(mapId: string): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();

    const map = await prisma.mindMap.findUnique({
      where: { id: mapId },
      select: { workspaceId: true, workspace: { select: { slug: true } } },
    });
    if (!map) return fail(NOT_FOUND);

    // Membership first, permission second — the same answer for "no such map"
    // and "not your workspace" keeps an id from confirming it exists.
    const membership = await getMembership(user.id, map.workspaceId);
    if (!membership) return fail(NOT_FOUND);
    if (!can(membership.role, "project:delete")) throw new ForbiddenError();

    await prisma.mindMap.delete({ where: { id: mapId } });

    revalidatePath(`/w/${map.workspace.slug}/maps`);
    return ok(undefined);
  });
}

const renameSchema = z.object({
  mapId: z.string().min(1),
  title: z.string().trim().min(1, "Give the map a title").max(120),
});

export async function renameMindMap(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(renameSchema, input);

    const map = await prisma.mindMap.findUnique({
      where: { id: data.mapId },
      select: { workspaceId: true, workspace: { select: { slug: true } } },
    });
    if (!map) return fail(NOT_FOUND);

    const membership = await getMembership(user.id, map.workspaceId);
    if (!membership) return fail(NOT_FOUND);
    if (!can(membership.role, "project:update")) throw new ForbiddenError();

    await prisma.mindMap.update({ where: { id: data.mapId }, data: { title: data.title } });

    revalidatePath(`/w/${map.workspace.slug}/maps`);
    return ok(undefined);
  });
}

/**
 * Replaces a map's contents.
 *
 * The payload is validated against the schema for *this map's* type, read from
 * the row rather than taken from the request — otherwise a caller could send a
 * bridge map's shape to a tree map and store something no renderer can read.
 */
export async function updateMindMapData(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const { mapId, data } = parse(
      z.object({ mapId: z.string().min(1), data: z.unknown() }),
      input,
    );

    const map = await prisma.mindMap.findUnique({
      where: { id: mapId },
      select: { type: true, workspaceId: true, workspace: { select: { slug: true } } },
    });
    if (!map) return fail(NOT_FOUND);

    const membership = await getMembership(user.id, map.workspaceId);
    if (!membership) return fail(NOT_FOUND);
    if (!can(membership.role, "project:update")) throw new ForbiddenError();

    const parsed = canvasSchema.safeParse(data ?? {});
    if (!parsed.success) return fail("Some of that could not be saved. Check the lengths.");

    await prisma.mindMap.update({
      where: { id: mapId },
      data: { data: parsed.data },
    });

    revalidatePath(`/w/${map.workspace.slug}/maps/${mapId}`);
    return ok(undefined);
  });
}
